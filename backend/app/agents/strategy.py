"""Agent 5: Strategy. Mode A (user picks formats) is honoured; Mode B (AI decides) is recommended."""

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.graph.context import PipelineContext
from app.graph.state import FORMAT_CATALOG, CampaignBrain, PostingSlot, Strategy


class StrategyOutput(BaseModel):
    objective: str
    primary_audience: str
    secondary_audiences: list[str] = Field(default_factory=list)
    platforms: list[str]
    formats: dict[str, list[str]]
    languages: list[str]
    code_switching: bool = False
    code_switching_style: str | None = None
    tone: str
    posting_schedule: list[PostingSlot] = Field(default_factory=list)
    rationale: str


def normalize_strategy(out: StrategyOutput, brain: CampaignBrain) -> Strategy:
    if brain.content_mode == "user" and brain.requested_formats:
        formats = {p: list(f) for p, f in brain.requested_formats.items()}
    else:
        formats = {}
        for platform, fmts in out.formats.items():
            p = platform.lower()
            valid = [f for f in fmts if f in FORMAT_CATALOG.get(p, {})]
            if valid:
                formats[p] = list(dict.fromkeys(valid))
        for platform, fmts in brain.requested_formats.items():
            formats.setdefault(platform, [])
            formats[platform] = list(dict.fromkeys(formats[platform] + fmts))
        for platform in brain.requested_platforms:
            if platform not in formats:
                formats[platform] = [next(iter(FORMAT_CATALOG[platform]))]
    if not formats:
        formats = {"instagram": ["post"], "whatsapp": ["message"]}
    # The owner's language choice is final; otherwise use the model's recommendation.
    languages = list(dict.fromkeys(brain.requested_languages or [l.lower() for l in out.languages]))
    return Strategy(
        objective=out.objective, primary_audience=out.primary_audience,
        secondary_audiences=out.secondary_audiences, platforms=list(formats), formats=formats,
        languages=languages or ["en"], code_switching=out.code_switching,
        code_switching_style=out.code_switching_style, tone=out.tone,
        posting_schedule=[s for s in out.posting_schedule if s.platform.lower() in formats],
        rationale=out.rationale,
    )


async def run(ctx: PipelineContext) -> Strategy:
    brain = ctx.brain()
    payload = {
        "business": brain.business.model_dump(),
        "objective": brain.objective,
        "offer": brain.offer.model_dump(),
        "locality": brain.locality.model_dump(include={"city", "area", "insights", "language_signals"}),
        "audiences": [a.model_dump() for a in brain.audiences],
        "content_mode": brain.content_mode,
        "owner_requested": {"platforms": brain.requested_platforms, "formats": brain.requested_formats,
                            "languages": brain.requested_languages},
        "allowed_formats": {p: list(f) for p, f in FORMAT_CATALOG.items()},
        "past_learnings": (ctx.business.learnings or [])[-5:],
    }
    out = await call_agent(ctx, "strategy", StrategyOutput, payload, temperature=0.4)
    return normalize_strategy(out, brain)
