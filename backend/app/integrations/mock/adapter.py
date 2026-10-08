"""Mock publishing for demos and tests. Clearly labelled as simulated everywhere it surfaces."""

import hashlib

from app.integrations.base import AdapterError, PublishContext, PublishResult
from app.models import SocialAccount


class MockAdapter:
    platform = "mock"

    async def publish(self, pc: PublishContext) -> PublishResult:
        if (pc.account.meta or {}).get("fail"):
            raise AdapterError("Platform API rejected request (simulated failure)")
        ext = f"mock_{pc.asset.platform}_{pc.asset.id[:8]}"
        return PublishResult(external_id=ext, url=None, raw={"simulated": True, "target_platform": pc.asset.platform})

    async def metrics(self, account: SocialAccount, token: str, external_id: str) -> dict:
        seed = int(hashlib.sha256(external_id.encode()).hexdigest(), 16)
        reach = 2000 + seed % 12000
        clicks = 50 + seed % 800
        engaged = int(reach * (0.03 + (seed % 60) / 1000))
        return {"simulated": True, "reach": reach, "views": int(reach * 1.4), "clicks": clicks,
                "ctr": round(100 * clicks / reach, 2), "engagement_rate": round(100 * engaged / reach, 2)}
