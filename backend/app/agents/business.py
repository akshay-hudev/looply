"""Agent 2: Business Intelligence. Builds the Business Profile and persists it on the Business record."""

from app.agents.base import call_agent
from app.graph.context import PipelineContext
from app.graph.state import BusinessProfile


async def run(ctx: PipelineContext) -> BusinessProfile:
    brain = ctx.brain()
    biz = ctx.business
    payload = {
        "existing_profile": {**(biz.profile or {}), "name": biz.name, "category": biz.category},
        "campaign_business": brain.business.model_dump(),
        "owner_messages": brain.raw_inputs[-3:],
        "offer": brain.offer.model_dump(),
    }
    profile = await call_agent(ctx, "business", BusinessProfile, payload, temperature=0.3)
    # Owner-provided values on the record win over model output.
    profile.name = biz.name or profile.name
    profile.category = biz.category or profile.category
    owner_claims = (biz.profile or {}).get("supported_claims") or []
    profile.supported_claims = sorted(set(owner_claims) | set(brain.business.supported_claims))
    biz.profile = {**(biz.profile or {}), **profile.model_dump(exclude={"supported_claims"}),
                   "supported_claims": profile.supported_claims}
    if not biz.category and profile.category:
        biz.category = profile.category
    ctx.db.commit()
    return profile
