"""Agent 7: Platform Adaptation. One call per platform, 3 variants per format, English master copy."""

from pydantic import BaseModel, Field

from app.agents.base import call_agent, creative_context
from app.agents.copy import AssetCopy
from app.graph.context import PipelineContext
from app.graph.state import CampaignBrain

VARIANT_LABELS = ("A", "B", "C")


class Variant(AssetCopy):
    label: str = Field(description="A, B or C")


class FormatVariants(BaseModel):
    format: str
    variants: list[Variant] = Field(min_length=1, max_length=3)


class PlatformOutput(BaseModel):
    assets: list[FormatVariants]


def _payload(brain: CampaignBrain, platform: str, formats: list[str], feedback: dict | None) -> dict:
    payload = {
        "platform": platform,
        "formats": formats,
        "business": brain.business.model_dump(include={"name", "category", "brand_voice", "personality"}),
        "offer_locked": brain.offer.model_dump(),
        "supported_claims": brain.business.supported_claims,
        "core_message": brain.core_message.model_dump(),
        "audience": [a.model_dump() for a in brain.audiences if platform in a.platforms] or
                    [a.model_dump() for a in brain.audiences[:1]],
        "locality": {"city": brain.locality.city, "area": brain.locality.area,
                     "insights": [i.model_dump() for i in brain.locality.insights]},
        "tone": brain.strategy.tone,
        "briefs": [b.model_dump() for b in brain.briefs if b.platform == platform and b.format in formats],
    }
    if feedback:
        payload["previous_attempt_failed_fact_check"] = feedback
    return payload


async def run(ctx: PipelineContext, platform: str, formats: list[str],
              feedback: dict | None = None) -> dict[str, list[Variant]]:
    brain = ctx.brain()
    payload = {**creative_context(ctx), **_payload(brain, platform, formats, feedback)}
    out = await call_agent(ctx, f"platform_{platform}", PlatformOutput, payload, temperature=0.8)
    result: dict[str, list[Variant]] = {}
    for item in out.assets:
        fmt = item.format.lower()
        if fmt not in formats:
            continue
        variants = item.variants[:3]
        for v, label in zip(variants, VARIANT_LABELS):
            v.label = label
        result[fmt] = variants
    missing = [f for f in formats if f not in result]
    if missing:
        raise ValueError(f"{platform} agent returned no copy for formats: {missing}")
    return result
