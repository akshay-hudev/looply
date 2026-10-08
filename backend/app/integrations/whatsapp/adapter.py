"""WhatsApp Cloud API broadcasts.

Business-initiated messages must use an approved MARKETING template and may only go to contacts who
opted in. Flow per message asset:
  1. Create the template (body = asset copy, header = the selected offer-card image if any).
  2. Wait for Meta's review (job is re-scheduled while PENDING).
  3. Once APPROVED, send to every opted-in contact of the business and record per-recipient status.
"""

import re

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.integrations.base import AdapterError, AwaitingExternal, PublishContext, PublishResult
from app.integrations.meta import graph, graph_url
from app.models import Asset, Campaign, SocialAccount, WhatsAppContact, WhatsAppTemplate

# LocalMind language code -> WhatsApp template language code.
TEMPLATE_LANG = {"en": "en", "hi": "hi", "kn": "kn", "ta": "ta", "te": "te", "mr": "mr", "bn": "bn", "ml": "ml",
                 "gu": "gu", "pa": "pa", "ur": "ur", "es": "es", "fr": "fr", "ar": "ar", "pt": "pt_BR", "id": "id"}


def template_body(asset: Asset) -> str:
    c = asset.content or {}
    text = "\n\n".join(p for p in (c.get("body") or c.get("headline") or "", c.get("cta") or "") if p)
    # WhatsApp allows only numbered placeholders; normalize any to {{1}} and keep at most one.
    text = re.sub(r"\{\{\s*\w+\s*\}\}", "{{1}}", text)
    first = text.find("{{1}}")
    if first != -1:
        text = text[: first + 5] + text[first + 5:].replace("{{1}}", "")
    return text[:1024]


def template_name(asset: Asset) -> str:
    return f"lm_{asset.campaign_id[:10]}_{asset.id[:10]}_{asset.language}".lower()


async def _upload_header_handle(image_url: str, token: str) -> str:
    """Resumable Upload API -> media handle required as the header example for template review."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as c:
        img = await c.get(image_url)
        img.raise_for_status()
        mime = img.headers.get("content-type", "image/png").split(";")[0]
        start = await c.post(graph_url(f"{s.meta_app_id}/uploads"),
                             params={"file_length": len(img.content), "file_type": mime, "access_token": token})
        session = start.json().get("id")
        if not session:
            raise AdapterError(f"WhatsApp header upload failed: {start.text[:300]}")
        up = await c.post(graph_url(session), content=img.content,
                          headers={"Authorization": f"OAuth {token}", "file_offset": "0"})
        handle = up.json().get("h")
        if not handle:
            raise AdapterError(f"WhatsApp header upload failed: {up.text[:300]}")
        return handle


def _offer_card(pc: PublishContext) -> Asset | None:
    """Selected offer card for the message's language. Preview-only (SVG) cards are skipped: text-only send."""
    card = pc.db.scalar(select(Asset).where(
        Asset.campaign_id == pc.asset.campaign_id, Asset.platform == "whatsapp", Asset.format == "offer_card",
        Asset.language == pc.asset.language, Asset.is_selected.is_(True), Asset.status == "approved",
        Asset.media_url.is_not(None)))
    return None if card is None or card.media_url.lower().endswith(".svg") else card


class WhatsAppAdapter:
    platform = "whatsapp"

    async def _ensure_template(self, pc: PublishContext) -> WhatsAppTemplate:
        a, acct = pc.asset, pc.account
        tpl = pc.db.scalar(select(WhatsAppTemplate).where(WhatsAppTemplate.asset_id == a.id,
                                                          WhatsAppTemplate.social_account_id == acct.id))
        if tpl and tpl.external_id:
            data = await graph("GET", tpl.external_id, pc.token, params={"fields": "status,rejected_reason"},
                               platform="whatsapp")
            tpl.status = data.get("status", tpl.status)
            pc.db.commit()
            if tpl.status == "REJECTED":
                raise AdapterError(f"WhatsApp rejected the template: {data.get('rejected_reason') or 'no reason given'}")
            return tpl

        body = template_body(a)
        components: list[dict] = []
        card = _offer_card(pc)
        if card:
            handle = await _upload_header_handle(card.media_url, pc.token)
            components.append({"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [handle]}})
        body_comp: dict = {"type": "BODY", "text": body}
        if "{{1}}" in body:
            body_comp["example"] = {"body_text": [["Asha"]]}
        components.append(body_comp)
        waba = acct.meta.get("waba_id") or get_settings().whatsapp_business_account_id
        if not waba:
            raise AdapterError("WhatsApp Business Account id is missing on the connected account")
        lang = TEMPLATE_LANG.get(a.language, a.language)
        data = await graph("POST", f"{waba}/message_templates", pc.token, platform="whatsapp", json={
            "name": template_name(a), "language": lang, "category": "MARKETING", "components": components})
        tpl = WhatsAppTemplate(org_id=a.org_id, social_account_id=acct.id, asset_id=a.id, name=template_name(a),
                               language=lang, status=data.get("status", "PENDING"), external_id=data.get("id"),
                               components=components)
        pc.db.add(tpl)
        pc.db.commit()
        return tpl

    async def publish(self, pc: PublishContext) -> PublishResult:
        if pc.asset.format != "message":
            raise AdapterError("Only WhatsApp messages are sent; offer cards go out as the message header image")
        tpl = await self._ensure_template(pc)
        if tpl.status != "APPROVED":
            raise AwaitingExternal(f"Waiting for WhatsApp to approve template '{tpl.name}' (status {tpl.status})")

        business_id = pc.db.get(Campaign, pc.asset.campaign_id).business_id
        contacts = list(pc.db.scalars(select(WhatsAppContact).where(
            WhatsAppContact.business_id == business_id, WhatsAppContact.opted_in.is_(True))))
        if not contacts:
            raise AdapterError("No opted-in WhatsApp contacts for this business")
        card = _offer_card(pc)
        has_param = any(c.get("type") == "BODY" and "{{1}}" in c.get("text", "") for c in tpl.components)
        results = []
        for contact in contacts:
            comps = []
            if card:
                comps.append({"type": "header", "parameters": [{"type": "image", "image": {"link": card.media_url}}]})
            if has_param:
                comps.append({"type": "body", "parameters": [{"type": "text", "text": contact.name or "there"}]})
            try:
                data = await graph("POST", f"{pc.account.external_id}/messages", pc.token, platform="whatsapp", json={
                    "messaging_product": "whatsapp", "to": contact.phone.lstrip("+"), "type": "template",
                    "template": {"name": tpl.name, "language": {"code": tpl.language}, "components": comps}})
                results.append({"phone": contact.phone, "status": "sent", "message_id": (data.get("messages") or [{}])[0].get("id")})
            except AdapterError as e:
                results.append({"phone": contact.phone, "status": "failed", "error": str(e)[:300]})
        sent = [r for r in results if r["status"] == "sent"]
        if not sent:
            raise AdapterError(f"All {len(results)} WhatsApp sends failed: {results[0].get('error')}")
        return PublishResult(external_id=f"template:{tpl.external_id}",
                             raw={"recipients": results, "sent": len(sent), "failed": len(results) - len(sent)})

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict:
        # Delivery/read/click counts arrive via webhooks; aggregated on the PublishJob result by the webhook handler.
        return {}
