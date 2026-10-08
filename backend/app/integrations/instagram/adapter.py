"""Instagram Graph API content publishing (Business/Creator account linked to a Facebook Page).

Flow: create a media container (image_url / video_url must be publicly reachable), wait until the
container is FINISHED (videos), then call media_publish.
"""

import asyncio

from app.integrations.base import AdapterError, PublishContext, PublishResult, caption, require_publishable_media
from app.integrations.meta import graph
from app.models import SocialAccount


class InstagramAdapter:
    platform = "instagram"

    async def _container(self, ig_id: str, token: str, payload: dict) -> str:
        data = await graph("POST", f"{ig_id}/media", token, data=payload, platform="instagram")
        return data["id"]

    async def _wait_ready(self, container_id: str, token: str, *, attempts: int = 30, delay: float = 10) -> None:
        for _ in range(attempts):
            data = await graph("GET", container_id, token, params={"fields": "status_code,status"}, platform="instagram")
            code = data.get("status_code")
            if code == "FINISHED":
                return
            if code in ("ERROR", "EXPIRED"):
                raise AdapterError(f"Instagram could not process the media: {data.get('status')}")
            await asyncio.sleep(delay)
        raise AdapterError("Instagram media processing timed out", retryable=True)

    async def publish(self, pc: PublishContext) -> PublishResult:
        a, ig_id, token = pc.asset, pc.account.external_id, pc.token
        content = a.content or {}
        if not a.media_url:
            raise AdapterError("Instagram requires an image or video; this asset has no generated media")
        require_publishable_media(a)
        text = caption(a)
        if a.format == "carousel":
            slides = content.get("slide_urls") or [a.media_url]
            if len(slides) < 2:
                raise AdapterError("Instagram carousels need at least 2 slides")
            children = [await self._container(ig_id, token, {"image_url": u, "is_carousel_item": "true"})
                        for u in slides[:10]]
            container = await self._container(ig_id, token, {"media_type": "CAROUSEL", "children": ",".join(children),
                                                             "caption": text})
        elif a.format == "reel":
            container = await self._container(ig_id, token, {"media_type": "REELS", "video_url": a.media_url,
                                                             "caption": text, "share_to_feed": "true"})
            await self._wait_ready(container, token)
        elif a.format == "story":
            key = "video_url" if a.kind == "video" else "image_url"
            container = await self._container(ig_id, token, {"media_type": "STORIES", key: a.media_url})
            if a.kind == "video":
                await self._wait_ready(container, token)
        else:  # post, poster
            container = await self._container(ig_id, token, {"image_url": a.media_url, "caption": text})
        published = await graph("POST", f"{ig_id}/media_publish", token, data={"creation_id": container},
                                platform="instagram")
        media_id = published["id"]
        try:
            info = await graph("GET", media_id, token, params={"fields": "permalink"}, platform="instagram")
        except AdapterError:
            info = {}
        return PublishResult(external_id=media_id, url=info.get("permalink"), raw=published)

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict:
        data = await graph("GET", f"{external_id}/insights", token,
                           params={"metric": "reach,likes,comments,shares,saved,views"}, platform="instagram")
        out = {}
        for item in data.get("data", []):
            values = item.get("values") or [{}]
            out[item["name"]] = values[0].get("value", item.get("total_value", {}).get("value"))
        reach = out.get("reach") or 0
        engaged = sum(out.get(k) or 0 for k in ("likes", "comments", "shares", "saved"))
        out["engagement_rate"] = round(100 * engaged / reach, 2) if reach else None
        return out
