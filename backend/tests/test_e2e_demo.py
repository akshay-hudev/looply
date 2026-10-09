"""README demo: Bengaluru cafe, Kannada + English, Instagram + WhatsApp, then a 20% -> 25% change."""

import functools
import json

import pytest

from app.graph.state import LocalityContext, LocalitySignal
from app.services.locality_service import LocalityService, language_signals_for
from app.services.model_gateway import set_gateway
from app.services.model_gateway.demo import demo_gateway, demo_responder
from app.workers import tasks

MESSAGE = ("We are ABC Cafe in Bengaluru. Our new cold coffee is for ₹149 and 20% off this weekend. "
           "We want more college students. Make it in Kannada and English.")


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    async def gather(self, *, lat, lng, address, city, area):
        return LocalityContext(
            city=city, area="Koramangala", lat=12.935, lng=77.624, radius_m=1500, data_source="test", verified=True,
            signals=[LocalitySignal(type="college", count=4, examples=["Christ University"], nearest_m=600, source="osm"),
                     LocalitySignal(type="office", count=9, examples=["Tech Park"], nearest_m=400, source="osm")],
            language_signals=language_signals_for(city))

    monkeypatch.setattr(LocalityService, "gather", gather)
    monkeypatch.setattr(tasks, "poll_videos", functools.partial(tasks.poll_videos, interval_s=0))
    set_gateway(demo_gateway())
    yield
    set_gateway(None)


def _setup(client, auth):
    biz = client.post("/api/businesses", headers=auth, json={
        "name": "ABC Cafe", "category": "Cafe", "city": "Bengaluru", "address": "Koramangala, Bengaluru"}).json()
    r = client.post("/api/campaigns", headers=auth, json={"business_id": biz["id"], "message": MESSAGE})
    assert r.status_code == 201, r.text
    return biz, r.json()["id"]


def _get(client, auth, cid):
    return client.get(f"/api/campaigns/{cid}", headers=auth).json()


def test_bengaluru_cafe_campaign_end_to_end(client, auth):
    biz, cid = _setup(client, auth)
    c = _get(client, auth, cid)
    assert c["status"] == "strategy_review", c["stage"]
    brain = c["brain"]
    assert brain["offer"]["price"] == "₹149" and brain["offer"]["discount"] == "20%"
    assert set(brain["strategy"]["languages"]) == {"kn", "en"}
    assert brain["locality"]["insights"], "grounded locality insights expected"

    assert client.post(f"/api/campaigns/{cid}/strategy/accept", headers=auth).status_code == 200
    c = _get(client, auth, cid)
    assert c["status"] == "review", c["stage"]
    assets = c["assets"]
    assert {a["language"] for a in assets} == {"kn", "en"}
    assert {a["platform"] for a in assets} == {"instagram", "whatsapp"}
    selected = [a for a in assets if a["is_selected"]]
    groups = {(a["platform"], a["format"], a["language"]) for a in assets}
    assert len(selected) == len(groups), "exactly one selected variant per platform/format/language"
    for a in selected:
        assert a["status"] == "verified", (a["platform"], a["format"], a["language"], a["verification"])
        assert a["prediction"].get("label") == "AI-predicted"
    kn = next(a for a in selected if a["language"] == "kn" and a["format"] == "post")
    assert "149" in json.dumps(kn["content"], ensure_ascii=False)
    reel = next(a for a in selected if a["format"] == "reel")
    assert reel["media_status"] == "ready" and reel["media_url"]
    assert c["summary"]["prediction_label"] == "AI-predicted"

    events = client.get(f"/api/campaigns/{cid}/events", headers=auth).json()
    agents = {e["agent"] for e in events}
    assert {"campaign_manager", "locality_agent", "fact_checker"} <= agents or len(agents) >= 6

    # --- Owner changes the discount: only dependent assets regenerate and re-verify ---
    r = client.patch(f"/api/campaigns/{cid}/facts", headers=auth, json={"offer": {"discount": "25%"}})
    assert r.status_code == 200, r.text
    change = r.json()
    assert change["changed"] == ["offer.discount"]
    assert change["affected_asset_ids"]
    c = _get(client, auth, cid)
    assert c["status"] == "review"
    assert c["brain"]["offer"]["discount"] == "25%"
    for a in [a for a in c["assets"] if a["is_selected"]]:
        text = json.dumps(a["content"], ensure_ascii=False)
        assert "20%" not in text and "20 %" not in text, (a["format"], a["language"], text)
        assert a["status"] == "verified"
    versions = client.get(f"/api/campaigns/{cid}/versions", headers=auth).json()
    assert versions[0]["offer"]["discount"] == "25%" and len(versions) >= 2

    # --- Approval gate, then simulated publishing and analytics feedback ---
    assert client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={}).status_code == 409
    assert client.post(f"/api/campaigns/{cid}/approve", headers=auth).status_code == 200
    for p in ("instagram", "whatsapp"):
        client.post("/api/social/mock/connect", headers=auth, json={"target_platform": p, "business_id": biz["id"]})
    r = client.post(f"/api/campaigns/{cid}/publish", headers=auth, json={})
    assert r.status_code == 202, r.text
    jobs = client.get(f"/api/campaigns/{cid}/publish-jobs", headers=auth).json()
    assert jobs and all(j["status"] == "published" for j in jobs), jobs
    fmt = {a["id"]: a["format"] for a in _get(client, auth, cid)["assets"]}
    assert "offer_card" not in {fmt[j["asset_id"]] for j in jobs}, "offer cards ride along as the WhatsApp header"
    assert {j["platform"] for j in jobs} == {"instagram", "whatsapp"}
    assert _get(client, auth, cid)["status"] == "published"

    assert client.post(f"/api/campaigns/{cid}/analytics/refresh", headers=auth).status_code == 202
    report = client.get(f"/api/campaigns/{cid}/analytics", headers=auth).json()
    assert report["rows"] and all(r["simulated"] for r in report["rows"])
    assert report["report"]["learnings"]
    assert client.get(f"/api/businesses/{biz['id']}/learnings", headers=auth).json()


def test_wrong_discount_does_not_restart_the_campaign(client, auth):
    """A rough Kannada draft is not sent back through a fact-check rewrite loop."""
    calls = {"n": 0}

    def responder(messages):
        out = demo_responder(messages)
        user = next(m for m in messages if m.role == "user").content
        if "LOCALMIND_AGENT:language_culture" in user and '"code": "kn"' in user and calls["n"] < 1:
            calls["n"] += 1
            return out.replace("20%", "30%")
        return out

    set_gateway(demo_gateway(responder))
    _, cid = _setup(client, auth)
    client.post(f"/api/campaigns/{cid}/strategy/accept", headers=auth)
    c = _get(client, auth, cid)
    assert c["status"] == "review"
    selected = [a for a in c["assets"] if a["is_selected"]]
    assert selected and all(a["status"] == "verified" for a in selected)
    events = client.get(f"/api/campaigns/{cid}/events", headers=auth).json()
    assert not any("fact-check feedback" in (e.get("message") or "") for e in events)
    visuals = [a for a in selected if a["format"] != "message"]
    assert visuals and all(a["media_url"] for a in visuals)


def test_restaurant_popularity_answer_continues(client, auth):
    biz = client.post("/api/businesses", headers=auth, json={
        "name": "Mano's Cafe", "category": "Restaurant", "city": "Bengaluru"}).json()
    r = client.post("/api/campaigns", headers=auth, json={
        "business_id": biz["id"],
        "message": "We have launched a new restaurant named mano's cafe, Where we have continential"})
    cid = r.json()["id"]
    c = _get(client, auth, cid)
    if c["status"] == "clarifying":
        sent = client.post(f"/api/campaigns/{cid}/messages", headers=auth, json={
            "message": "It is mainly to make our restaurant popular and many people can see it"})
        assert sent.status_code == 200, sent.text
        c = _get(client, auth, cid)
    assert c["status"] == "strategy_review", c["brain"].get("clarifying_questions")
    assert c["brain"]["offer"]["product"]
    assert c["brain"]["objective"]


def test_user_chosen_formats_and_carousel_slides(client, auth):
    biz = client.post("/api/businesses", headers=auth, json={"name": "ABC Cafe", "city": "Bengaluru"}).json()
    r = client.post("/api/campaigns", headers=auth, json={
        "business_id": biz["id"], "message": MESSAGE, "content_mode": "user",
        "requested_formats": {"instagram": ["carousel"], "linkedin": ["post"]}, "requested_languages": ["en", "hi"],
        "auto_accept_strategy": True})
    c = _get(client, auth, r.json()["id"])
    assert c["status"] == "review", c["stage"]
    assert {(a["platform"], a["format"]) for a in c["assets"]} == {("instagram", "carousel"), ("linkedin", "post")}
    assert {a["language"] for a in c["assets"]} == {"en", "hi"}
    carousel = next(a for a in c["assets"] if a["format"] == "carousel" and a["is_selected"])
    assert len(carousel["content"]["slide_urls"]) >= 2


def test_dry_brief_still_produces_viewable_creatives(client, auth):
    """No free text, no offer: just what/who/where. Every visual asset gets a composed preview and passes truth."""
    biz = client.post("/api/businesses", headers=auth, json={
        "name": "Mano's Cafe", "category": "Restaurant", "city": "Bengaluru"}).json()
    r = client.post("/api/campaigns", headers=auth, json={
        "business_id": biz["id"], "message": "", "content_mode": "user", "auto_accept_strategy": True,
        "brief": {"product": "Continental menu", "audience": "Young professionals", "region": "Indiranagar, Bengaluru"},
        "requested_formats": {"instagram": ["poster", "story", "reel", "carousel"], "whatsapp": ["message", "offer_card"]},
        "requested_languages": ["en"]})
    assert r.status_code == 201, r.text
    c = _get(client, auth, r.json()["id"])
    assert c["status"] == "review", (c["stage"], c["brain"].get("clarifying_questions"))
    assert c["brain"]["brief"]["audience"] == "Young professionals"
    selected = [a for a in c["assets"] if a["is_selected"]]
    for a in selected:
        assert a["status"] == "verified", (a["format"], a["verification"])
        if a["format"] != "message":
            assert a["media_url"] and a["media_url"].endswith(".svg"), (a["format"], a["media_url"])
            assert client.get(a["media_url"]).status_code == 200
    reel = next(a for a in selected if a["format"] == "reel")
    assert reel["content"]["media_source"] == "storyboard"
    post = json.dumps(next(a for a in selected if a["format"] == "poster")["content"], ensure_ascii=False)
    assert "Indiranagar" in post or "Mano" in post


def test_voice_transcription(client, auth, monkeypatch):
    import respx
    import httpx

    monkeypatch.setenv("STT_API_KEY", "k")
    from app.core.config import get_settings

    get_settings.cache_clear()
    with respx.mock:
        respx.post("https://api.openai.com/v1/audio/transcriptions").mock(
            return_value=httpx.Response(200, json={"text": MESSAGE, "language": "en"}))
        r = client.post("/api/voice/transcribe", headers=auth, files={"file": ("a.webm", b"\x00" * 100, "audio/webm")})
    get_settings.cache_clear()
    assert r.status_code == 200 and r.json()["text"] == MESSAGE


def test_copy_is_accepted_without_a_fact_check(client, auth):
    def responder(messages):
        out = demo_responder(messages)
        user = next(m for m in messages if m.role == "user").content
        if "LOCALMIND_AGENT:language_culture" in user and '"code": "kn"' in user:
            return out.replace("20%", "30%")
        return out

    set_gateway(demo_gateway(responder))
    _, cid = _setup(client, auth)
    client.post(f"/api/campaigns/{cid}/strategy/accept", headers=auth)
    c = _get(client, auth, cid)
    selected = [a for a in c["assets"] if a["is_selected"]]
    assert selected and all(a["status"] == "verified" for a in selected)
    assert client.post(f"/api/campaigns/{cid}/approve", headers=auth).status_code == 200
