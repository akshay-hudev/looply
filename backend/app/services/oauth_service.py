"""OAuth: authorization URLs, code exchange and account discovery. Passwords are never collected."""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import encrypt
from app.integrations.base import AdapterError, raise_for
from app.integrations.meta import graph, graph_url
from app.models import SocialAccount

INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish",
                    "instagram_business_manage_insights"]
META_SCOPES = {
    "instagram": INSTAGRAM_SCOPES,
    "facebook": ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    "whatsapp": ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"],
}
LINKEDIN_SCOPES = ["openid", "profile", "w_member_social", "w_organization_social", "r_organization_social",
                   "rw_organization_admin"]
YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
                  "https://www.googleapis.com/auth/youtube.readonly"]


def redirect_uri(platform: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/api/social/{platform}/callback"


def _instagram_client() -> tuple[str, str]:
    s = get_settings()
    app_id = s.instagram_app_id or s.meta_app_id
    secret = s.instagram_app_secret or s.meta_app_secret
    return app_id, secret


def authorize_url(platform: str, state: str) -> str:
    s = get_settings()
    if platform == "instagram":
        app_id, _secret = _instagram_client()
        if not app_id:
            raise AdapterError("META_APP_ID is not configured")
        q = {"enable_fb_login": "0", "force_authentication": "1", "client_id": app_id,
             "redirect_uri": redirect_uri(platform), "response_type": "code",
             "scope": ",".join(INSTAGRAM_SCOPES), "state": state}
        return f"https://www.instagram.com/oauth/authorize?{urlencode(q)}"
    if platform in META_SCOPES:
        if not s.meta_app_id:
            raise AdapterError("META_APP_ID is not configured")
        q = {"client_id": s.meta_app_id, "redirect_uri": redirect_uri(platform), "state": state,
             "scope": ",".join(META_SCOPES[platform]), "response_type": "code"}
        return f"https://www.facebook.com/{s.meta_graph_version}/dialog/oauth?{urlencode(q)}"
    if platform == "linkedin":
        if not s.linkedin_client_id:
            raise AdapterError("LINKEDIN_CLIENT_ID is not configured")
        q = {"response_type": "code", "client_id": s.linkedin_client_id, "redirect_uri": redirect_uri(platform),
             "state": state, "scope": " ".join(LINKEDIN_SCOPES)}
        return f"https://www.linkedin.com/oauth/v2/authorization?{urlencode(q)}"
    if platform == "youtube":
        if not s.youtube_client_id:
            raise AdapterError("YOUTUBE_CLIENT_ID is not configured")
        q = {"client_id": s.youtube_client_id, "redirect_uri": redirect_uri(platform), "response_type": "code",
             "scope": " ".join(YOUTUBE_SCOPES), "access_type": "offline", "prompt": "consent",
             "include_granted_scopes": "true", "state": state}
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(q)}"
    raise AdapterError(f"Unsupported platform {platform}")


async def connect_with_token(db: Session, platform: str, token: str, external_id: str, org_id: str,
                             business_id: str | None, display_name: str = "", waba_id: str | None = None) -> SocialAccount:
    """Connect an account with a token the owner already has (Graph API user/page token, or LinkedIn token)."""
    token = token.strip()
    external_id = external_id.strip()
    if platform == "instagram":
        data = await graph("GET", external_id, token, params={"fields": "username"}, platform="instagram")
        name = display_name or f"@{data.get('username', external_id)}"
        meta: dict = {}
    elif platform == "facebook":
        data = await graph("GET", external_id, token, params={"fields": "name"}, platform="facebook")
        name = display_name or data.get("name") or external_id
        meta = {}
    elif platform == "whatsapp":
        data = await graph("GET", external_id, token, params={"fields": "display_phone_number,verified_name"},
                           platform="whatsapp")
        name = display_name or f"{data.get('verified_name', '')} {data.get('display_phone_number', '')}".strip() or external_id
        meta = {"waba_id": waba_id or get_settings().whatsapp_business_account_id}
        if not meta["waba_id"]:
            raise AdapterError("WhatsApp also needs the WhatsApp Business Account id")
    elif platform == "linkedin":
        async with httpx.AsyncClient(timeout=30) as c:
            me = raise_for(await c.get("https://api.linkedin.com/v2/userinfo",
                                       headers={"Authorization": f"Bearer {token}"}), "linkedin")
        external_id = external_id or f"urn:li:person:{me['sub']}"
        name = display_name or me.get("name") or "LinkedIn"
        meta = {"urn": external_id, "kind": "organization" if "organization" in external_id else "member"}
    elif platform == "youtube":
        async with httpx.AsyncClient(timeout=30) as c:
            data = raise_for(await c.get("https://www.googleapis.com/youtube/v3/channels",
                                         params={"part": "snippet", "mine": "true"},
                                         headers={"Authorization": f"Bearer {token}"}), "youtube")
        items = data.get("items") or []
        chosen = next((i for i in items if i.get("id") == external_id), None)
        if chosen is None and not external_id and items:
            chosen = items[0]
        if chosen is None:
            raise AdapterError("This token cannot access that YouTube channel. Create a channel on the Google "
                               "account, or paste the channel id that belongs to the token.")
        external_id = chosen["id"]
        name = display_name or (chosen.get("snippet") or {}).get("title") or "YouTube"
        meta = {"kind": "channel"}
    else:
        raise AdapterError(f"Unsupported platform {platform}")
    account = _upsert(db, org_id, business_id, platform, external_id, display_name=name,
                      access_token_enc=encrypt(token), meta=meta)
    db.commit()
    return account


def _upsert(db: Session, org_id: str, business_id: str | None, platform: str, external_id: str, **fields) -> SocialAccount:
    acct = db.scalar(select(SocialAccount).where(SocialAccount.org_id == org_id, SocialAccount.platform == platform,
                                                 SocialAccount.external_id == external_id))
    if acct is None:
        acct = SocialAccount(org_id=org_id, platform=platform, external_id=external_id)
        db.add(acct)
    acct.business_id = business_id
    acct.active = True
    for k, v in fields.items():
        setattr(acct, k, v)
    return acct


async def _meta_user_token(platform: str, code: str) -> tuple[str, int]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=30) as c:
        short = raise_for(await c.get(graph_url("oauth/access_token"), params={
            "client_id": s.meta_app_id, "client_secret": s.meta_app_secret, "redirect_uri": redirect_uri(platform),
            "code": code}), "meta")
        long = raise_for(await c.get(graph_url("oauth/access_token"), params={
            "grant_type": "fb_exchange_token", "client_id": s.meta_app_id, "client_secret": s.meta_app_secret,
            "fb_exchange_token": short["access_token"]}), "meta")
    return long["access_token"], int(long.get("expires_in", 5184000))


async def complete_instagram(db: Session, code: str, org_id: str, business_id: str | None) -> list[SocialAccount]:
    """Instagram Login. The business_* permissions are rejected by Facebook's own login dialog."""
    app_id, secret = _instagram_client()
    async with httpx.AsyncClient(timeout=30) as c:
        short_resp = raise_for(await c.post("https://api.instagram.com/oauth/access_token", data={
            "client_id": app_id, "client_secret": secret, "grant_type": "authorization_code",
            "redirect_uri": redirect_uri("instagram"), "code": code}), "instagram")
        if isinstance(short_resp.get("data"), list) and short_resp["data"]:
            short_resp = short_resp["data"][0]
        long = raise_for(await c.get("https://graph.instagram.com/access_token", params={
            "grant_type": "ig_exchange_token", "client_secret": secret,
            "access_token": short_resp["access_token"]}), "instagram")
    token = long["access_token"]
    me = await graph("GET", "me", token, params={"fields": "user_id,username"}, platform="instagram")
    external_id = str(me.get("user_id") or me.get("id") or short_resp.get("user_id") or "")
    if not external_id:
        raise AdapterError("Instagram did not return an account id")
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(long.get("expires_in", 5184000)))
    account = _upsert(db, org_id, business_id, "instagram", external_id,
                      display_name=f"@{me.get('username', external_id)}", access_token_enc=encrypt(token),
                      scopes=",".join(INSTAGRAM_SCOPES),
                      meta={"login": "instagram"}, expires_at=expires_at)
    db.commit()
    return [account]


async def complete_meta(db: Session, platform: str, code: str, org_id: str, business_id: str | None) -> list[SocialAccount]:
    if platform == "instagram":
        return await complete_instagram(db, code, org_id, business_id)
    user_token, expires_in = await _meta_user_token(platform, code)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    scopes = ",".join(META_SCOPES[platform])
    accounts: list[SocialAccount] = []
    if platform in ("instagram", "facebook"):
        pages = await graph("GET", "me/accounts", user_token,
                            params={"fields": "id,name,access_token,instagram_business_account{id,username}"})
        for page in pages.get("data", []):
            if platform == "facebook":
                accounts.append(_upsert(db, org_id, business_id, "facebook", page["id"], display_name=page["name"],
                                        access_token_enc=encrypt(page["access_token"]), scopes=scopes,
                                        meta={"kind": "page", "user_token_enc": encrypt(user_token)}, expires_at=expires_at))
        if platform == "facebook" and not accounts:
            me = await graph("GET", "me", user_token, params={"fields": "id,name"}, platform="facebook")
            accounts.append(_upsert(db, org_id, business_id, "facebook", str(me["id"]),
                                    display_name=me.get("name") or "Facebook",
                                    access_token_enc=encrypt(user_token), scopes=scopes,
                                    meta={"kind": "user", "user_token_enc": encrypt(user_token)}, expires_at=expires_at))
    else:  # whatsapp
        s = get_settings()
        wabas = []
        if s.whatsapp_business_account_id:
            wabas = [s.whatsapp_business_account_id]
        else:
            businesses = await graph("GET", "me/businesses", user_token, params={"fields": "id"})
            for b in businesses.get("data", []):
                owned = await graph("GET", f"{b['id']}/owned_whatsapp_business_accounts", user_token)
                wabas += [w["id"] for w in owned.get("data", [])]
        for waba in wabas:
            phones = await graph("GET", f"{waba}/phone_numbers", user_token,
                                 params={"fields": "id,display_phone_number,verified_name"})
            for ph in phones.get("data", []):
                accounts.append(_upsert(db, org_id, business_id, "whatsapp", ph["id"],
                                        display_name=f"{ph.get('verified_name', '')} {ph.get('display_phone_number', '')}".strip(),
                                        access_token_enc=encrypt(user_token), scopes=scopes,
                                        meta={"waba_id": waba, "user_token_enc": encrypt(user_token)},
                                        expires_at=expires_at))
    if not accounts:
        raise AdapterError(f"No {platform} accounts were found on this login. For Instagram, the account must be a "
                           "Business/Creator account linked to a Facebook Page.")
    db.commit()
    return accounts


async def complete_linkedin(db: Session, code: str, org_id: str, business_id: str | None) -> list[SocialAccount]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=30) as c:
        tok = raise_for(await c.post("https://www.linkedin.com/oauth/v2/accessToken", data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri("linkedin"),
            "client_id": s.linkedin_client_id, "client_secret": s.linkedin_client_secret}), "linkedin")
        token = tok["access_token"]
        headers = {"Authorization": f"Bearer {token}", "LinkedIn-Version": "202409", "X-Restli-Protocol-Version": "2.0.0"}
        me = raise_for(await c.get("https://api.linkedin.com/v2/userinfo", headers=headers), "linkedin")
        orgs_resp = await c.get("https://api.linkedin.com/rest/organizationAcls",
                                params={"q": "roleAssignee", "role": "ADMINISTRATOR", "state": "APPROVED"}, headers=headers)
        orgs = orgs_resp.json().get("elements", []) if orgs_resp.status_code == 200 else []
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tok.get("expires_in", 5184000)))
    common = dict(access_token_enc=encrypt(token), refresh_token_enc=encrypt(tok.get("refresh_token")),
                  expires_at=expires_at, scopes=tok.get("scope", ""))
    person_urn = f"urn:li:person:{me['sub']}"
    accounts = [_upsert(db, org_id, business_id, "linkedin", person_urn, display_name=me.get("name", "LinkedIn member"),
                        meta={"urn": person_urn, "kind": "member"}, **common)]
    for o in orgs:
        urn = o.get("organization")
        if urn:
            accounts.append(_upsert(db, org_id, business_id, "linkedin", urn, display_name=f"Page {urn.split(':')[-1]}",
                                    meta={"urn": urn, "kind": "organization"}, **common))
    db.commit()
    return accounts


async def complete_youtube(db: Session, code: str, org_id: str, business_id: str | None) -> list[SocialAccount]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=30) as c:
        tok = raise_for(await c.post("https://oauth2.googleapis.com/token", data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri("youtube"),
            "client_id": s.youtube_client_id, "client_secret": s.youtube_client_secret}), "youtube")
        token = tok["access_token"]
        channels = raise_for(await c.get("https://www.googleapis.com/youtube/v3/channels",
                                         params={"part": "snippet", "mine": "true"},
                                         headers={"Authorization": f"Bearer {token}"}), "youtube")
    items = channels.get("items") or []
    if not items:
        raise AdapterError("This Google account has no YouTube channel. Create a channel, then connect again.")
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tok.get("expires_in", 3600)))
    fields = dict(access_token_enc=encrypt(token), expires_at=expires_at, scopes=tok.get("scope", ""))
    if tok.get("refresh_token"):
        fields["refresh_token_enc"] = encrypt(tok["refresh_token"])
    accounts = []
    for ch in items:
        snippet = ch.get("snippet") or {}
        accounts.append(_upsert(db, org_id, business_id, "youtube", ch["id"],
                                display_name=snippet.get("title") or "YouTube",
                                meta={"kind": "channel", "custom_url": snippet.get("customUrl")}, **fields))
    db.commit()
    return accounts
