from dataclasses import dataclass, field
from typing import Protocol

import httpx
from sqlalchemy.orm import Session

from app.models import Asset, SocialAccount


class AdapterError(Exception):
    """Platform rejected the request. `retryable` distinguishes outages from bad requests."""

    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class AwaitingExternal(Exception):
    """Publishing is blocked on the platform (e.g. WhatsApp template review); re-check later."""

    def __init__(self, message: str, retry_after_s: int = 300):
        super().__init__(message)
        self.retry_after_s = retry_after_s


@dataclass
class PublishResult:
    external_id: str
    url: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class PublishContext:
    db: Session
    account: SocialAccount
    asset: Asset
    token: str


class PublishAdapter(Protocol):
    async def publish(self, pc: PublishContext) -> PublishResult: ...

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict: ...


def require_publishable_media(asset: Asset) -> None:
    urls = [asset.media_url or "", *((asset.content or {}).get("slide_urls") or [])]
    if any(u.lower().endswith(".svg") for u in urls):
        raise AdapterError("This creative is a Looply preview (composed without an image/video model). "
                           "Add AGNES_API_KEY (or another image provider) and regenerate it before publishing "
                           "to a real account, or publish to a simulated account.")


def caption(asset: Asset) -> str:
    c = asset.content or {}
    parts = [c.get("hook") or c.get("headline") or "", c.get("body") or "", c.get("cta") or ""]
    text = "\n\n".join(p.strip() for p in dict.fromkeys(parts) if p and p.strip())
    tags = " ".join(c.get("hashtags") or [])
    return f"{text}\n\n{tags}".strip() if tags else text


def raise_for(resp: httpx.Response, platform: str) -> dict:
    try:
        data = resp.json()
    except ValueError:
        data = {"raw": resp.text[:500]}
    if resp.status_code >= 400 or (isinstance(data, dict) and "error" in data and data["error"]):
        err = data.get("error") if isinstance(data, dict) else None
        msg = err.get("message") if isinstance(err, dict) else (err or resp.text[:300])
        retryable = resp.status_code == 429 or resp.status_code >= 500 or (
            isinstance(err, dict) and err.get("is_transient"))
        raise AdapterError(f"{platform} API rejected request ({resp.status_code}): {msg}", retryable=bool(retryable))
    return data
