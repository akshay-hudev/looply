"""Facebook Page publishing with a Page access token."""

from app.integrations.base import AdapterError, PublishContext, PublishResult, caption, require_publishable_media
from app.integrations.meta import graph
from app.models import SocialAccount


PAGE_REQUIRED = (
    "Facebook no longer lets apps post on a personal profile. "
    "Create a Facebook Page you manage, then on Accounts press Change and connect that Page."
)


class FacebookAdapter:
    platform = "facebook"

    async def _publish_target(self, pc: PublishContext) -> tuple[str, str]:
        """Page id + Page token. A personal profile cannot be posted to; look up a Page if one exists."""
        meta = dict(pc.account.meta or {})
        if meta.get("kind") != "user":
            return pc.account.external_id, pc.token
        from app.core.crypto import decrypt, encrypt

        user_token = decrypt(meta.get("user_token_enc") or "") or pc.token
        pages = await graph("GET", "me/accounts", user_token,
                            params={"fields": "id,name,access_token"}, platform="facebook")
        page = next((p for p in pages.get("data") or [] if p.get("id") and p.get("access_token")), None)
        if not page:
            raise AdapterError(PAGE_REQUIRED)
        acct = pc.account
        acct.external_id = str(page["id"])
        if page.get("name"):
            acct.display_name = page["name"]
        acct.access_token_enc = encrypt(page["access_token"])
        acct.meta = {**meta, "kind": "page"}
        pc.db.commit()
        return acct.external_id, page["access_token"]

    async def publish(self, pc: PublishContext) -> PublishResult:
        a = pc.asset
        page_id, token = await self._publish_target(pc)
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
