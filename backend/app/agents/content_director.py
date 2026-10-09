"""Agent 6: Content Director. Decides the asset work plan and writes one creative brief per asset."""

from pydantic import BaseModel

from app.agents.base import call_agent, creative_context
from app.content.templates import choose
from app.graph.context import PipelineContext
from app.graph.state import FORMAT_CATALOG, CampaignBrain, CreativeBrief


class BriefsOutput(BaseModel):
    briefs: list[CreativeBrief]


def work_plan(brain: CampaignBrain) -> list[tuple[str, str, str]]:
    """(platform, format, kind) for every asset type the strategy calls for."""
    plan = []
    for platform, formats in brain.strategy.formats.items():
        for fmt in formats:
            kind = FORMAT_CATALOG.get(platform, {}).get(fmt)
            if kind:
                plan.append((platform, fmt, kind))
    return plan


async def run(ctx: PipelineContext) -> list[CreativeBrief]:
    brain = ctx.brain()
    plan = work_plan(brain)
    payload = {
        **creative_context(ctx),
        "strategy": brain.strategy.model_dump(),
        "core_message": brain.core_message.model_dump(),
        "offer_locked": brain.offer.model_dump(),
        "brand_voice": brain.business.brand_voice,
        "assets_to_produce": [{"platform": p, "format": f, "kind": k} for p, f, k in plan],
        "templates": {f: choose(brain, f) for _, f, _ in plan},
        "template_instruction": (
            "Each format lists three templates, labeled A, B and C, with the job that template is for. "
            "Write the brief so variant A follows A, B follows B and C follows C. "
            "Use the beats as the structure. Refill every line from this business. Do not copy a sample line."
        ),
    }
    out = await call_agent(ctx, "content_director", BriefsOutput, payload, temperature=0.6)
    by_key = {(b.platform.lower(), b.format.lower()): b for b in out.briefs}
    # Exactly one brief per planned asset; fill gaps rather than trusting the model's list.
    return [by_key.get((p, f)) or CreativeBrief(platform=p, format=f, key_points=brain.core_message.must_include)
            for p, f, _ in plan]
