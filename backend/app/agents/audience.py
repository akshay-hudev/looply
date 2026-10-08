"""Agent 4: Audience Intelligence."""

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.graph.context import PipelineContext
from app.graph.state import AudienceSegment, FORMAT_CATALOG


class AudienceOutput(BaseModel):
    segments: list[AudienceSegment] = Field(min_length=1, max_length=3)


async def run(ctx: PipelineContext) -> list[AudienceSegment]:
    brain = ctx.brain()
    biz = ctx.business
    payload = {
        "business": brain.business.model_dump(),
        "objective": brain.objective,
        "owner_target_audience": brain.target_audience_hint,
        "offer": brain.offer.model_dump(),
        "locality": brain.locality.model_dump(include={"city", "area", "insights", "language_signals", "summary"}),
        "past_learnings": (biz.learnings or [])[-5:],
        "platforms_available": list(FORMAT_CATALOG),
    }
    out = await call_agent(ctx, "audience", AudienceOutput, payload, temperature=0.4)
    segments = out.segments
    if not any(s.priority == "primary" for s in segments):
        segments[0].priority = "primary"
    seen_primary = False
    for s in segments:
        if s.priority == "primary":
            if seen_primary:
                s.priority = "secondary"
            seen_primary = True
        s.platforms = [p.lower() for p in s.platforms if p.lower() in FORMAT_CATALOG]
    return segments
