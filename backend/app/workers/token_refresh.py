"""Refresh OAuth tokens before they expire (Meta long-lived user tokens, LinkedIn refresh tokens)."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.core.db import SessionLocal
from app.integrations.meta import graph_url
from app.models import SocialAccount

log = logging.getLogger(__name__)


async def _refresh(account: SocialAccount) -> None:
    s = get_settings()
    async with httpx.AsyncClient(timeout=30) as c:
        if account.platform == "instagram" and (account.meta or {}).get("login") == "instagram":
            token = decrypt(account.access_token_enc)
            r = await c.get("https://graph.instagram.com/refresh_access_token", params={
                "grant_type": "ig_refresh_token", "access_token": token})
            data = r.json()
            if "access_token" in data:
                account.access_token_enc = encrypt(data["access_token"])
                account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 5184000)))
        elif account.platform in ("facebook", "whatsapp", "instagram"):
            token = decrypt(account.meta.get("user_token_enc")) if account.meta.get("user_token_enc") else None
            if not token:
                return  # page tokens derived from long-lived user tokens do not expire
            r = await c.get(graph_url("oauth/access_token"), params={
                "grant_type": "fb_exchange_token", "client_id": s.meta_app_id, "client_secret": s.meta_app_secret,
                "fb_exchange_token": token})
            data = r.json()
            if "access_token" in data:
                account.meta = {**account.meta, "user_token_enc": encrypt(data["access_token"])}
                account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 5184000)))
        elif account.platform == "youtube" and account.refresh_token_enc:
            r = await c.post("https://oauth2.googleapis.com/token", data={
                "grant_type": "refresh_token", "refresh_token": decrypt(account.refresh_token_enc),
                "client_id": s.youtube_client_id, "client_secret": s.youtube_client_secret})
            data = r.json()
            if "access_token" in data:
                account.access_token_enc = encrypt(data["access_token"])
                if data.get("refresh_token"):
                    account.refresh_token_enc = encrypt(data["refresh_token"])
                account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
        elif account.platform == "linkedin" and account.refresh_token_enc:
            r = await c.post("https://www.linkedin.com/oauth/v2/accessToken", data={
                "grant_type": "refresh_token", "refresh_token": decrypt(account.refresh_token_enc),
                "client_id": s.linkedin_client_id, "client_secret": s.linkedin_client_secret})
            data = r.json()
            if "access_token" in data:
                account.access_token_enc = encrypt(data["access_token"])
                if data.get("refresh_token"):
                    account.refresh_token_enc = encrypt(data["refresh_token"])
                account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 5184000)))


async def refresh_expiring_tokens(within_days: int = 7) -> int:
    cutoff = datetime.now(timezone.utc) + timedelta(days=within_days)
    count = 0
    with SessionLocal() as db:
        accounts = db.scalars(select(SocialAccount).where(
            SocialAccount.active.is_(True), SocialAccount.expires_at.is_not(None), SocialAccount.expires_at < cutoff))
        for account in accounts:
            try:
                await _refresh(account)
                count += 1
            except Exception as e:
                log.warning("token refresh failed for %s: %s", account.id, e)
        db.commit()
    return count
