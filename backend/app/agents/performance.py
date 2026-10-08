"""Agent 10: Performance. AI-predicted scores per variant (never mixed with real analytics)."""

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.agents.copy import asset_text
from app.graph.context import PipelineContext
from app.models import Asset

SUBSCORES = ("hook_strength", "clarity", "cta_strength", "platform_fit", "local_relevance")


class VariantScore(BaseModel):
    asset_id: str
    predicted_score: int = Field(ge=0, le=100)
    hook_strength: int = Field(ge=0, le=100)
    clarity: int = Field(ge=0, le=100)
    cta_strength: int = Field(ge=0, le=100)
    platform_fit: int = Field(ge=0, le=100)
    local_relevance: int = Field(ge=0, le=100)
    rationale: str


class PerformanceOutput(BaseModel):
    scores: list[VariantScore]


async def predict(ctx: PipelineContext, group: list[Asset]) -> dict[str, VariantScore]:
    """Score all variants of one (platform, format, language) group and mark the best as selected."""
    brain = ctx.brain()
    sample = group[0]
    payload = {
        "platform": sample.platform,
        "format": sample.format,
        "language": sample.language,
        "audience": brain.strategy.primary_audience,
        "objective": brain.objective,
        "locality": {"city": brain.locality.city, "insights": [i.model_dump() for i in brain.locality.insights]},
        "past_learnings": (ctx.business.learnings or [])[-5:],
        "variants": [{"asset_id": a.id, "label": a.variant, "text": asset_text(a.content or {})} for a in group],
    }
    out = await call_agent(ctx, "performance", PerformanceOutput, payload, temperature=0.2)
    scores = {s.asset_id: s for s in out.scores if s.asset_id in {a.id for a in group}}
    for a in group:
        s = scores.get(a.id)
        a.prediction = ({"label": "AI-predicted", **s.model_dump(exclude={"asset_id"})} if s else
                        {"label": "AI-predicted", "predicted_score": None, "rationale": "No prediction returned"})
    eligible = [a for a in group if a.status == "verified" and scores.get(a.id)] or [a for a in group if scores.get(a.id)]
    best = max(eligible, key=lambda a: scores[a.id].predicted_score) if eligible else group[0]
    for a in group:
        a.is_selected = a.id == best.id
    ctx.db.commit()
    return scores
