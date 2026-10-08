"""LinkedIn Posts API (member with w_member_social, or organization page with w_organization_social)."""

from urllib.parse import quote

import httpx

from app.integrations.base import (
    AdapterError, PublishContext, PublishResult, caption, raise_for, require_publishable_media,
)
from app.models import SocialAccount

API = "https://api.linkedin.com/rest"
VERSION = "202409"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "LinkedIn-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json"}


class LinkedInAdapter:
    platform = "linkedin"

    async def _upload_image(self, c: httpx.AsyncClient, token: str, owner: str, url: str) -> str:
        init = raise_for(await c.post(f"{API}/images?action=initializeUpload", headers=_headers(token),
                                      json={"initializeUploadRequest": {"owner": owner}}), "linkedin")
        value = init["value"]
        img = await c.get(url, follow_redirects=True)
        img.raise_for_status()
        up = await c.put(value["uploadUrl"], content=img.content, headers={"Authorization": f"Bearer {token}"})
        if up.status_code >= 400:
            raise AdapterError(f"LinkedIn image upload failed ({up.status_code})")
        return value["image"]

    async def publish(self, pc: PublishContext) -> PublishResult:
        require_publishable_media(pc.asset)
        owner = pc.account.meta.get("urn")
        if not owner:
            raise AdapterError("LinkedIn account has no author URN")
        body: dict = {"author": owner, "commentary": caption(pc.asset)[:3000], "visibility": "PUBLIC",
                      "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [],
                                       "thirdPartyDistributionChannels": []},
                      "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": False}
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                if pc.asset.media_url and pc.asset.kind == "image":
                    image_urn = await self._upload_image(c, pc.token, owner, pc.asset.media_url)
                    body["content"] = {"media": {"id": image_urn}}
                resp = await c.post(f"{API}/posts", headers=_headers(pc.token), json=body)
        except httpx.HTTPError as e:
            raise AdapterError(f"linkedin network error: {e}", retryable=True) from e
        if resp.status_code >= 400:
            raise_for(resp, "linkedin")
        post_urn = resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id")
        if not post_urn:
            raise AdapterError("LinkedIn did not return a post id")
        return PublishResult(external_id=post_urn, url=f"https://www.linkedin.com/feed/update/{post_urn}")

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as c:
            data = raise_for(await c.get(f"{API}/socialActions/{quote(external_id, safe='')}", headers=_headers(token)),
                             "linkedin")
        return {"likes": (data.get("likesSummary") or {}).get("totalLikes", 0),
                "comments": (data.get("commentsSummary") or {}).get("aggregatedTotalComments", 0)}
