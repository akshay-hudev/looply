"""Facebook Page publishing with a Page access token."""

from app.integrations.base import AdapterError, PublishContext, PublishResult, caption, require_publishable_media
from app.integrations.meta import graph
from app.models import SocialAccount


class FacebookAdapter:
    platform = "facebook"

    async def publish(self, pc: PublishContext) -> PublishResult:
        a, page_id, token = pc.asset, pc.account.external_id, pc.token
        text = caption(a)
        require_publishable_media(a)
        if a.kind == "video" and a.media_url:
            data = await graph("POST", f"{page_id}/videos", token, data={"file_url": a.media_url, "description": text},
                               platform="facebook", timeout=300)
            post_id = data.get("id")
        elif a.media_url:
            data = await graph("POST", f"{page_id}/photos", token, data={"url": a.media_url, "message": text},
                               platform="facebook")
            post_id = data.get("post_id") or data.get("id")
        else:
            data = await graph("POST", f"{page_id}/feed", token, data={"message": text}, platform="facebook")
            post_id = data.get("id")
        if not post_id:
            raise AdapterError(f"Facebook returned no post id: {data}")
        return PublishResult(external_id=post_id, url=f"https://www.facebook.com/{post_id}", raw=data)

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict:
        data = await graph("GET", external_id, token, platform="facebook", params={
            "fields": "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares"})
        out = {
            "reactions": (data.get("reactions") or {}).get("summary", {}).get("total_count", 0),
            "comments": (data.get("comments") or {}).get("summary", {}).get("total_count", 0),
            "shares": (data.get("shares") or {}).get("count", 0),
        }
        try:
            ins = await graph("GET", f"{external_id}/insights", token, platform="facebook",
                              params={"metric": "post_impressions_unique,post_clicks"})
            for item in ins.get("data", []):
                out[item["name"]] = (item.get("values") or [{}])[0].get("value")
        except AdapterError:
            pass
        reach = out.get("post_impressions_unique") or 0
        engaged = out["reactions"] + out["comments"] + out["shares"]
        out["reach"] = reach
        out["engagement_rate"] = round(100 * engaged / reach, 2) if reach else None
        return out
