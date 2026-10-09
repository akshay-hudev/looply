import asyncio

import httpx
import respx

from app.core.crypto import encrypt
from app.core.db import SessionLocal
from app.models import Asset, Business, Campaign, PublishJob, SocialAccount, WhatsAppContact, WhatsAppTemplate
from app.services.publishing_service import execute_job
from tests.conftest import register

G = "https://graph.facebook.com/v21.0"


def _approved(org_id: str, platform="instagram", fmt="post", **asset_kw) -> tuple[str, str]:
    with SessionLocal() as db:
        b = Business(org_id=org_id, name="ABC Cafe", city="Bengaluru")
        db.add(b)
        db.flush()
        c = Campaign(org_id=org_id, business_id=b.id, title="t", status="approved", brain={})
        db.add(c)
        db.flush()
        a = Asset(org_id=org_id, campaign_id=c.id, platform=platform, format=fmt, language="en",
                  kind=asset_kw.pop("kind", "image"), variant="A", is_selected=True, status="approved",
                  content={"headline": "Cold coffee ₹149", "body": "20% off this weekend", "cta": "Visit us",
                           "hashtags": ["#Bengaluru"]},
                  media_url=asset_kw.pop("media_url", "https://cdn.example/img.png"), **asset_kw)
        db.add(a)
        db.commit()
        return b.id, c.id


def _org(auth):
    return auth["X-Org-Id"]


def test_approve_only_the_posts_that_were_checked(client, auth):
    org_id = _org(auth)
    with SessionLocal() as db:
        b = Business(org_id=org_id, name="ABC Cafe", city="Bengaluru")
        db.add(b)
        db.flush()
        c = Campaign(org_id=org_id, business_id=b.id, title="t", status="review", brain={})
        db.add(c)
        db.flush()
        keep = Asset(org_id=org_id, campaign_id=c.id, platform="instagram", format="post", language="en",
                     kind="image", variant="A", is_selected=True, status="verified", content={"headline": "Keep"})
        hold = Asset(org_id=org_id, campaign_id=c.id, platform="instagram", format="story", language="en",
                     kind="image", variant="A", is_selected=True, status="verified", content={"headline": "Hold"})
        db.add_all([keep, hold])
        db.commit()
        cid, keep_id, hold_id = c.id, keep.id, hold.id
    assert client.post(f"/api/campaigns/{cid}/approve", headers=auth, json={"asset_ids": []}).status_code == 422
    res = client.post(f"/api/campaigns/{cid}/approve", headers=auth, json={"asset_ids": [keep_id]})
    assert res.status_code == 200
    with SessionLocal() as db:
        assert db.get(Asset, keep_id).status == "approved"
        assert db.get(Asset, hold_id).status == "verified"
        assert db.get(Campaign, cid).status == "approved"
    assert client.post(f"/api/campaigns/{cid}/approve", headers=auth).status_code == 200
    with SessionLocal() as db:
        assert db.get(Asset, hold_id).status == "approved"


def test_same_picture_can_go_to_youtube_or_become_a_new_version(client, auth):
    from sqlalchemy import select
    biz_id, cid = _approved(_org(auth))
    with SessionLocal() as db:
        asset = db.scalar(select(Asset).where(Asset.campaign_id == cid))
        aid, media = asset.id, asset.media_url
    created = client.post(f"/api/assets/{aid}/reuse", headers=auth, json={"mode": "another_platform", "platform": "youtube"}).json()
    assert created["platform"] == "youtube" and created["status"] == "approved" and created["media_url"] == media
    acct = client.post("/api/social/mock/connect", headers=auth, json={"target_platform": "youtube", "business_id": biz_id}).json()
    jobs = client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={
        "items": [{"asset_id": created["id"], "social_account_id": acct["id"]}]}).json()
    assert jobs[0]["platform"] == "youtube"
    version = client.post(f"/api/assets/{aid}/reuse", headers=auth, json={"mode": "create"}).json()
    assert version["platform"] == "instagram" and version["status"] == "verified" and version["id"] != aid
    posted = client.post("/api/social/mock/connect", headers=auth, json={"target_platform": "x"}).json()
    assert posted["target_platform"] == "x"


def test_owner_can_delete_a_campaign(client, auth):
    _, cid = _approved(_org(auth))
    assert client.delete(f"/api/campaigns/{cid}", headers=auth).status_code == 204
    assert client.get(f"/api/campaigns/{cid}", headers=auth).status_code == 404


def test_publish_requires_approval_and_mock_publishes(client, auth):
    biz_id, cid = _approved(_org(auth))
    with SessionLocal() as db:
        db.get(Campaign, cid).status = "review"
        db.commit()
    assert client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={}).status_code == 409
    with SessionLocal() as db:
        db.get(Campaign, cid).status = "approved"
        db.commit()
    client.post("/api/social/mock/connect", headers=auth, json={"target_platform": "instagram", "business_id": biz_id})
    jobs = client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={}).json()
    assert len(jobs) == 1
    job = client.get(f"/api/campaigns/{cid}/publish-jobs", headers=auth).json()[0]
    assert job["status"] == "published" and job["simulated"]
    # idempotent: publishing again does not duplicate
    assert len(client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={}).json()) == 1


def test_failure_shows_reason_and_retry(client, auth):
    biz_id, cid = _approved(_org(auth))
    acct = client.post("/api/social/mock/connect", headers=auth, json={
        "target_platform": "instagram", "business_id": biz_id, "simulate_failure": True}).json()
    client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={})
    job = client.get(f"/api/campaigns/{cid}/publish-jobs", headers=auth).json()[0]
    assert job["status"] == "failed" and "simulated failure" in job["error"]
    with SessionLocal() as db:
        db.get(SocialAccount, acct["id"]).meta = {"target_platform": "instagram", "fail": False}
        db.commit()
    assert client.post(f"/api/publish-jobs/{job['id']}/retry", headers=auth).status_code == 202
    assert client.get(f"/api/campaigns/{cid}/publish-jobs", headers=auth).json()[0]["status"] == "published"


def test_replaced_facebook_login_publishes_to_the_connected_account(client, auth):
    _, cid = _approved(_org(auth), platform="facebook")
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        old = SocialAccount(org_id=asset.org_id, platform="facebook", external_id="user-old", display_name="Old profile",
                            active=False, meta={"kind": "user"})
        live = SocialAccount(org_id=asset.org_id, platform="mock", external_id="page-new",
                             display_name="Corner Cafe", active=True, meta={"target_platform": "facebook"})
        db.add_all([old, live])
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=old.id,
                         platform="facebook")
        db.add(job)
        db.commit()
        asyncio.run(execute_job(db, job))
        assert job.status == "published", job.error
        assert job.social_account_id == live.id


def test_cannot_publish_to_another_orgs_account(client, auth):
    _, cid = _approved(_org(auth))
    other = register(client, email="rival@x.in", org="Rival")
    foreign = client.post("/api/social/mock/connect", headers=other, json={"target_platform": "instagram"}).json()
    with SessionLocal() as db:
        asset_id = db.query(Asset).filter_by(campaign_id=cid).one().id
    r = client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={
        "items": [{"asset_id": asset_id, "social_account_id": foreign["id"]}]})
    assert r.status_code == 404


def test_whatsapp_contacts_require_consent_source(client, auth):
    biz = client.post("/api/businesses", headers=auth, json={"name": "ABC"}).json()
    r = client.post("/api/social/whatsapp/contacts", headers=auth, json={"business_id": biz["id"], "contacts": [
        {"phone": "+919800000001", "name": "Asha", "opted_in": True, "opt_in_source": "in-store QR"},
        {"phone": "+919800000002", "name": "Ravi", "opted_in": True}]}).json()
    assert r["imported"] == 1 and r["rejected"][0]["phone"] == "+919800000002"


@respx.mock
def test_instagram_post_flow(client, auth):
    _, cid = _approved(_org(auth))
    ig = "https://graph.instagram.com/v21.0"
    respx.post(f"{ig}/1789/media").mock(return_value=httpx.Response(200, json={"id": "c1"}))
    publish = respx.post(f"{ig}/1789/media_publish").mock(return_value=httpx.Response(200, json={"id": "m1"}))
    respx.get(f"{ig}/m1").mock(return_value=httpx.Response(200, json={"permalink": "https://instagram.com/p/x"}))
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        acct = SocialAccount(org_id=asset.org_id, platform="instagram", external_id="1789",
                             access_token_enc=encrypt("tok"), meta={})
        db.add(acct)
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=acct.id,
                         platform="instagram")
        db.add(job)
        db.commit()
        asyncio.run(execute_job(db, job))
        assert job.status == "published" and job.external_post_id == "m1"
        assert job.result["url"] == "https://instagram.com/p/x"
        assert b"creation_id=c1" in publish.calls[0].request.content
        assert db.get(Campaign, cid).status == "published"


@respx.mock
def test_facebook_personal_profile_uses_a_page_when_one_exists(client, auth):
    _, cid = _approved(_org(auth), platform="facebook")
    respx.get(f"{G}/me/accounts").mock(return_value=httpx.Response(200, json={
        "data": [{"id": "page9", "name": "Corner Cafe", "access_token": "page-tok"}]}))
    photos = respx.post(f"{G}/page9/photos").mock(return_value=httpx.Response(200, json={"post_id": "page9_1"}))
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        acct = SocialAccount(org_id=asset.org_id, platform="facebook", external_id="user1", display_name="Ada",
                             access_token_enc=encrypt("user-tok"),
                             meta={"kind": "user", "user_token_enc": encrypt("user-tok")})
        db.add(acct)
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=acct.id,
                         platform="facebook")
        db.add(job)
        db.commit()
        asyncio.run(execute_job(db, job))
        assert job.status == "published", job.error
        assert job.external_post_id == "page9_1"
        assert photos.called
        saved = db.get(SocialAccount, acct.id)
        assert saved.external_id == "page9" and saved.meta["kind"] == "page"


@respx.mock
def test_facebook_personal_profile_without_a_page_fails_clearly(client, auth):
    _, cid = _approved(_org(auth), platform="facebook")
    respx.get(f"{G}/me/accounts").mock(return_value=httpx.Response(200, json={"data": []}))
    photos = respx.post(url__regex=r".*/photos").mock(return_value=httpx.Response(200, json={"id": "nope"}))
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        acct = SocialAccount(org_id=asset.org_id, platform="facebook", external_id="user1",
                             access_token_enc=encrypt("user-tok"),
                             meta={"kind": "user", "user_token_enc": encrypt("user-tok")})
        db.add(acct)
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=acct.id,
                         platform="facebook")
        db.add(job)
        db.commit()
        asyncio.run(execute_job(db, job))
        assert job.status == "failed"
        assert "personal profile" in job.error
        assert not photos.called


@respx.mock
def test_whatsapp_waits_for_template_then_sends_only_to_opted_in(client, auth):
    biz_id, cid = _approved(_org(auth), platform="whatsapp", fmt="message", kind="text", media_url=None)
    respx.post(f"{G}/waba1/message_templates").mock(return_value=httpx.Response(200, json={"id": "t1", "status": "PENDING"}))
    status = respx.get(f"{G}/t1").mock(return_value=httpx.Response(200, json={"status": "PENDING"}))
    send = respx.post(f"{G}/phone1/messages").mock(return_value=httpx.Response(200, json={"messages": [{"id": "wamid.1"}]}))
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        db.add_all([WhatsAppContact(org_id=asset.org_id, business_id=biz_id, phone="+919800000001", name="Asha",
                                    opted_in=True, opt_in_source="QR"),
                    WhatsAppContact(org_id=asset.org_id, business_id=biz_id, phone="+919800000002", opted_in=False)])
        acct = SocialAccount(org_id=asset.org_id, platform="whatsapp", external_id="phone1",
                             access_token_enc=encrypt("tok"), meta={"waba_id": "waba1"})
        db.add(acct)
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=acct.id,
                         platform="whatsapp")
        db.add(job)
        db.commit()

        asyncio.run(execute_job(db, job))
        assert job.status == "scheduled" and "approve template" in job.error
        assert db.query(WhatsAppTemplate).one().category == "MARKETING"
        assert not send.called

        status.mock(return_value=httpx.Response(200, json={"status": "APPROVED"}))
        asyncio.run(execute_job(db, job))
        assert job.status == "published", job.error
        assert send.call_count == 1 and job.result["sent"] == 1
        assert b"919800000001" in send.calls[0].request.content


@respx.mock
def test_youtube_short_uploads_a_video(client, auth):
    _, cid = _approved(_org(auth), platform="youtube", fmt="short", kind="video",
                       media_url="https://cdn.example/clip.mp4")
    respx.get("https://cdn.example/clip.mp4").mock(
        return_value=httpx.Response(200, content=b"fake-video", headers={"content-type": "video/mp4"}))
    respx.post(url__regex=r"https://www.googleapis.com/upload/youtube/v3/videos.*").mock(
        return_value=httpx.Response(200, headers={"Location": "https://upload.example/session"}))
    uploaded = respx.put("https://upload.example/session").mock(
        return_value=httpx.Response(200, json={"id": "vid123"}))
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        acct = SocialAccount(org_id=asset.org_id, platform="youtube", external_id="UCcafe",
                             access_token_enc=encrypt("tok"), meta={"kind": "channel"})
        db.add(acct)
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=acct.id,
                         platform="youtube")
        db.add(job)
        db.commit()
        asyncio.run(execute_job(db, job))
        assert job.status == "published", job.error
        assert job.external_post_id == "vid123"
        assert job.result["url"] == "https://www.youtube.com/watch?v=vid123"
        body = uploaded.calls[0].request.content
        assert body == b"fake-video"


def test_youtube_image_is_not_uploaded(client, auth):
    _, cid = _approved(_org(auth), platform="youtube", fmt="post", kind="image")
    with SessionLocal() as db:
        asset = db.query(Asset).filter_by(campaign_id=cid).one()
        acct = SocialAccount(org_id=asset.org_id, platform="youtube", external_id="UCcafe",
                             access_token_enc=encrypt("tok"), meta={"kind": "channel"})
        db.add(acct)
        db.flush()
        job = PublishJob(org_id=asset.org_id, campaign_id=cid, asset_id=asset.id, social_account_id=acct.id,
                         platform="youtube")
        db.add(job)
        db.commit()
        asyncio.run(execute_job(db, job))
        assert job.status == "failed"
        assert "picture" in job.error.lower()


@respx.mock
def test_youtube_login_saves_the_channel(client, auth):
    from app.services.oauth_service import complete_youtube

    respx.post("https://oauth2.googleapis.com/token").mock(return_value=httpx.Response(200, json={
        "access_token": "ya29.test", "refresh_token": "rt", "expires_in": 3600, "scope": "youtube.upload"}))
    respx.get("https://www.googleapis.com/youtube/v3/channels").mock(return_value=httpx.Response(200, json={
        "items": [{"id": "UCcafe", "snippet": {"title": "Cafe Channel", "customUrl": "@cafe"}}]}))
    with SessionLocal() as db:
        accounts = asyncio.run(complete_youtube(db, "code", _org(auth), None))
        assert accounts[0].platform == "youtube"
        assert accounts[0].external_id == "UCcafe"
        assert accounts[0].display_name == "Cafe Channel"
        assert accounts[0].refresh_token_enc
