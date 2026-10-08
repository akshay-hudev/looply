import hashlib
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import create_state_token, decode_state_token
from app.core.tenancy import OrgContext, get_org_context, get_owned, require_admin
from app.integrations.base import AdapterError
from app.models.base import new_id
from app.models import Business, PublishJob, SocialAccount, WhatsAppContact, WhatsAppTemplate
from app.services import oauth_service

router = APIRouter(prefix="/social", tags=["social"])
PLATFORMS = ("instagram", "facebook", "whatsapp", "linkedin")


def account_out(a: SocialAccount) -> dict:
    return {"id": a.id, "platform": a.platform, "external_id": a.external_id, "display_name": a.display_name,
            "business_id": a.business_id, "active": a.active, "expires_at": a.expires_at, "scopes": a.scopes,
            "target_platform": (a.meta or {}).get("target_platform", a.platform),
            "simulated": a.platform == "mock", "kind": (a.meta or {}).get("kind")}


@router.get("/accounts")
def list_accounts(ctx: OrgContext = Depends(get_org_context)):
    rows = ctx.db.scalars(select(SocialAccount).where(SocialAccount.org_id == ctx.org_id, SocialAccount.active.is_(True)))
    return [account_out(a) for a in rows]


@router.get("/providers")
def providers(ctx: OrgContext = Depends(get_org_context)):
    """Which official login pages are configured, so the UI only offers sign-in buttons that work."""
    s = get_settings()
    meta = bool(s.meta_app_id and s.meta_app_secret)
    linkedin = bool(s.linkedin_client_id and s.linkedin_client_secret)
    return {"instagram": {"login": meta, "via": "Instagram"}, "facebook": {"login": meta, "via": "Facebook"},
            "whatsapp": {"login": meta, "via": "Facebook"}, "linkedin": {"login": linkedin, "via": "LinkedIn"}}


@router.delete("/accounts/{account_id}", status_code=204)
def disconnect(account_id: str, ctx: OrgContext = Depends(require_admin)):
    a = get_owned(ctx, SocialAccount, account_id)
    a.active = False
    a.access_token_enc = a.refresh_token_enc = None
    ctx.db.commit()


class MockIn(BaseModel):
    target_platform: str = Field(pattern="^(instagram|facebook|whatsapp|linkedin)$")
    business_id: str | None = None
    simulate_failure: bool = False


@router.post("/mock/connect", status_code=201)
def connect_mock(body: MockIn, ctx: OrgContext = Depends(require_admin)):
    """Simulated account for demos: publishing is clearly marked as simulated."""
    if body.business_id:
        get_owned(ctx, Business, body.business_id)
    a = SocialAccount(org_id=ctx.org_id, business_id=body.business_id, platform="mock",
                      external_id=f"mock-{body.target_platform}-{new_id()[:12]}",
                      display_name=f"Demo {body.target_platform.title()} (simulated)",
                      meta={"target_platform": body.target_platform, "fail": body.simulate_failure})
    ctx.db.add(a)
    ctx.db.commit()
    return account_out(a)


class TokenIn(BaseModel):
    platform: str = Field(pattern="^(instagram|facebook|whatsapp|linkedin)$")
    access_token: str = Field(min_length=8)
    external_id: str = Field(min_length=2, description="Instagram account id, Facebook page id, WhatsApp phone number id, or LinkedIn URN")
    display_name: str = ""
    business_id: str | None = None
    waba_id: str | None = None


@router.post("/token", status_code=201)
async def connect_token(body: TokenIn, ctx: OrgContext = Depends(require_admin)):
    """Connect Instagram, Facebook, WhatsApp or LinkedIn with an access token, without the OAuth dialog."""
    if body.business_id:
        get_owned(ctx, Business, body.business_id)
    try:
        account = await oauth_service.connect_with_token(
            ctx.db, body.platform, body.access_token, body.external_id, ctx.org_id, body.business_id,
            body.display_name, body.waba_id)
    except AdapterError as e:
        raise HTTPException(400, str(e)) from e
    return account_out(account)


class ConnectIn(BaseModel):
    business_id: str | None = None


@router.post("/{platform}/connect")
def connect(platform: str, body: ConnectIn, ctx: OrgContext = Depends(require_admin)):
    if platform not in PLATFORMS:
        raise HTTPException(404, "Unknown platform")
    if body.business_id:
        get_owned(ctx, Business, body.business_id)
    state = create_state_token({"org_id": ctx.org_id, "user_id": ctx.user.id, "business_id": body.business_id,
                                "platform": platform})
    try:
        return {"authorize_url": oauth_service.authorize_url(platform, state)}
    except AdapterError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/{platform}/callback")
async def callback(platform: str, state: str, code: str | None = None, error: str | None = None,
                   error_description: str | None = None):
    front = get_settings().frontend_url.rstrip("/")
    data = decode_state_token(state)
    if not data or data.get("platform") != platform:
        return RedirectResponse(f"{front}/accounts?error=invalid_state")
    if error or not code:
        return RedirectResponse(f"{front}/accounts?error={error or 'cancelled'}")
    with SessionLocal() as db:
        try:
            if platform == "linkedin":
                accounts = await oauth_service.complete_linkedin(db, code, data["org_id"], data.get("business_id"))
            else:
                accounts = await oauth_service.complete_meta(db, platform, code, data["org_id"], data.get("business_id"))
        except AdapterError as e:
            from urllib.parse import quote

            return RedirectResponse(f"{front}/accounts?error={quote(str(e)[:300])}")
    notice = ""
    if platform == "facebook" and accounts and all((a.meta or {}).get("kind") == "user" for a in accounts):
        notice = "&notice=no_page"
    return RedirectResponse(f"{front}/accounts?connected={platform}&count={len(accounts)}{notice}")


# --- WhatsApp contacts (opt-in is mandatory for business-initiated messages) ---

class ContactIn(BaseModel):
    phone: str = Field(pattern=r"^\+?[1-9]\d{7,14}$")
    name: str = ""
    language: str | None = None
    opted_in: bool = False
    opt_in_source: str = ""


class ContactsIn(BaseModel):
    business_id: str
    contacts: list[ContactIn] = Field(max_length=5000)


@router.get("/whatsapp/contacts")
def list_contacts(business_id: str, ctx: OrgContext = Depends(get_org_context)):
    get_owned(ctx, Business, business_id)
    rows = ctx.db.scalars(select(WhatsAppContact).where(WhatsAppContact.business_id == business_id))
    return [{"id": c.id, "phone": c.phone, "name": c.name, "language": c.language, "opted_in": c.opted_in,
             "opted_in_at": c.opted_in_at, "opt_in_source": c.opt_in_source} for c in rows]


@router.post("/whatsapp/contacts")
def import_contacts(body: ContactsIn, ctx: OrgContext = Depends(get_org_context)):
    get_owned(ctx, Business, body.business_id)
    imported, rejected = 0, []
    for c in body.contacts:
        if c.opted_in and not c.opt_in_source.strip():
            rejected.append({"phone": c.phone, "reason": "opt_in_source is required to record consent"})
            continue
        phone = "+" + c.phone.lstrip("+")
        row = ctx.db.scalar(select(WhatsAppContact).where(WhatsAppContact.business_id == body.business_id,
                                                          WhatsAppContact.phone == phone))
        if row is None:
            row = WhatsAppContact(org_id=ctx.org_id, business_id=body.business_id, phone=phone)
            ctx.db.add(row)
        row.name, row.language = c.name, c.language
        if c.opted_in and not row.opted_in:
            row.opted_in_at = datetime.now(timezone.utc)
        row.opted_in = c.opted_in
        row.opt_in_source = c.opt_in_source
        imported += 1
    ctx.db.commit()
    return {"imported": imported, "rejected": rejected}


@router.post("/whatsapp/contacts/{contact_id}/opt-out")
def opt_out(contact_id: str, ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, WhatsAppContact, contact_id)
    c.opted_in = False
    ctx.db.commit()
    return {"id": c.id, "opted_in": False}


@router.get("/whatsapp/templates")
def list_templates(ctx: OrgContext = Depends(get_org_context)):
    rows = ctx.db.scalars(select(WhatsAppTemplate).where(WhatsAppTemplate.org_id == ctx.org_id))
    return [{"id": t.id, "name": t.name, "language": t.language, "status": t.status, "asset_id": t.asset_id}
            for t in rows]


# --- WhatsApp webhook: delivery/read statuses and STOP opt-outs ---

@router.get("/whatsapp/webhook")
def verify_webhook(mode: str = Query(alias="hub.mode"), token: str = Query(alias="hub.verify_token"),
                   challenge: str = Query(alias="hub.challenge")):
    expected = get_settings().whatsapp_verify_token
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return Response(challenge, media_type="text/plain")
    raise HTTPException(403, "Verification failed")


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request):
    raw = await request.body()
    secret = get_settings().meta_app_secret
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not secret or not hmac.compare_digest(sig, "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()):
        raise HTTPException(403, "Bad signature")
    payload = await request.json()
    with SessionLocal() as db:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for st in value.get("statuses", []):
                    _record_status(db, st)
                for msg in value.get("messages", []):
                    if (msg.get("text") or {}).get("body", "").strip().upper() in ("STOP", "UNSUBSCRIBE"):
                        phone = "+" + msg.get("from", "").lstrip("+")
                        for c in db.scalars(select(WhatsAppContact).where(WhatsAppContact.phone == phone)):
                            c.opted_in = False
        db.commit()
    return {"ok": True}


def _record_status(db, st: dict) -> None:
    message_id = st.get("id")
    for job in db.scalars(select(PublishJob).where(PublishJob.platform == "whatsapp", PublishJob.status == "published")):
        recipients = (job.result or {}).get("recipients", [])
        for r in recipients:
            if r.get("message_id") == message_id:
                r["delivery"] = st.get("status")
                counts = {}
                for x in recipients:
                    if x.get("delivery"):
                        counts[x["delivery"]] = counts.get(x["delivery"], 0) + 1
                job.result = {**job.result, "recipients": recipients, "delivery_counts": counts}
                return
