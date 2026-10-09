"""YouTube Data API video uploads (Shorts and other videos) for a connected channel."""

import mimetypes
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.integrations.base import AdapterError, PublishContext, PublishResult, caption, raise_for
from app.models import SocialAccount

UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos"
API = "https://www.googleapis.com/youtube/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"

def _reject_reason(asset) -> str | None:
    url = (asset.media_url or "").lower().split("?")[0]
    preview = url.endswith(".svg") or (asset.content or {}).get("media_source") == "storyboard"
    if asset.kind == "video" and preview:
        return ("This Short is a storyboard drawing, not a video file. YouTube can only upload an mp4. "
                "The video model had no quota left, so the file was never created. "
                "Add video credit, regenerate the Short, then publish again.")
    if asset.kind != "video" or asset.format != "short":
        return ("YouTube cannot publish a picture. This post was not uploaded. "
                "Only a YouTube Short that is a real video file can go to the channel.")
    if not asset.media_url:
        return "This YouTube Short has no video file yet. Wait until the video is ready, then publish."
    return None


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def ensure_token(account: SocialAccount, token: str) -> str:
    """Google access tokens last about an hour. Refresh when this one is near expiry."""
    expires = _aware(account.expires_at)
    if expires and expires > datetime.now(timezone.utc) + timedelta(minutes=2):
        return token
    if not account.refresh_token_enc:
        return token
    s = get_settings()
    if not s.youtube_client_id or not s.youtube_client_secret:
        return token
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.post(TOKEN_URL, data={
            "grant_type": "refresh_token", "refresh_token": decrypt(account.refresh_token_enc),
            "client_id": s.youtube_client_id, "client_secret": s.youtube_client_secret})
    data = raise_for(resp, "youtube")
    account.access_token_enc = encrypt(data["access_token"])
    if data.get("refresh_token"):
        account.refresh_token_enc = encrypt(data["refresh_token"])
    account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
    return data["access_token"]


def _title(asset) -> str:
    c = asset.content or {}
    title = (c.get("headline") or c.get("hook") or "Untitled").replace("<", "").replace(">", "").strip()
    if asset.format == "short" and "#shorts" not in title.lower():
        title = f"{title} #Shorts"
    return title[:100] or "Untitled"


def _description(asset) -> str:
    text = caption(asset)
    if asset.format == "short" and "#shorts" not in text.lower():
        text = f"{text}\n\n#Shorts".strip()
    return text[:5000]


def _content_type(url: str, header: str) -> str:
    raw = (header or "").split(";")[0].strip().lower()
    if raw.startswith(("video/", "image/")):
        return raw
    guessed = mimetypes.guess_type(url.split("?")[0])[0] or ""
    return guessed or "video/mp4"


class YouTubeAdapter:
    platform = "youtube"

    async def publish(self, pc: PublishContext) -> PublishResult:
        asset = pc.asset
        reason = _reject_reason(asset)
        if reason:
            raise AdapterError(reason)
        token = await ensure_token(pc.account, pc.token)
        try:
            async with httpx.AsyncClient(timeout=300, follow_redirects=True) as c:
                media = await c.get(asset.media_url, headers={"ngrok-skip-browser-warning": "1"})
                media.raise_for_status()
                content_type = _content_type(asset.media_url, media.headers.get("content-type", ""))
                if not content_type.startswith("video/"):
                    raise AdapterError(_reject_reason(asset) or "YouTube needs a video file.")
                body = {
                    "snippet": {"title": _title(asset), "description": _description(asset), "categoryId": "22"},
                    "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
                }
                init = await c.post(
                    f"{UPLOAD}?{urlencode({'uploadType': 'resumable', 'part': 'snippet,status'})}",
                    headers={**_headers(token), "Content-Type": "application/json",
                             "X-Upload-Content-Type": content_type, "X-Upload-Content-Length": str(len(media.content))},
                    json=body)
                if init.status_code >= 400:
                    raise_for(init, "youtube")
                upload_url = init.headers.get("location")
                if not upload_url:
                    raise AdapterError("YouTube did not return an upload URL")
                uploaded = await c.put(upload_url, content=media.content, headers={
                    "Authorization": f"Bearer {token}", "Content-Type": content_type,
                    "Content-Length": str(len(media.content))})
        except httpx.HTTPError as e:
            raise AdapterError(f"youtube network error: {e}", retryable=True) from e
        data = raise_for(uploaded, "youtube")
        video_id = data.get("id")
        if not video_id:
            raise AdapterError("YouTube did not return a video id")
        return PublishResult(external_id=video_id, url=f"https://www.youtube.com/watch?v={video_id}", raw=data)

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict:
        token = await ensure_token(account, token)
        async with httpx.AsyncClient(timeout=30) as c:
            data = raise_for(await c.get(f"{API}/videos", headers=_headers(token),
                                         params={"part": "statistics", "id": external_id}), "youtube")
        items = data.get("items") or []
        stats = (items[0].get("statistics") if items else None) or {}
        views = int(stats.get("viewCount") or 0)
        likes = int(stats.get("likeCount") or 0)
        comments = int(stats.get("commentCount") or 0)
        return {"views": views, "likes": likes, "comments": comments,
                "engagement_rate": round(100 * (likes + comments) / views, 2) if views else None}
