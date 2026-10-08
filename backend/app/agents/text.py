"""Text Content Agent: the semantic core message every asset derives from."""

from app.agents.base import call_agent, creative_context
from app.graph.context import PipelineContext
from app.graph.state import CoreMessage


async def run(ctx: PipelineContext) -> CoreMessage:
    brain = ctx.brain()
    payload = {
        **creative_context(ctx),
        "business": brain.business.model_dump(),
        "objective": brain.objective,
        "offer_locked": brain.offer.model_dump(),
        "primary_audience": brain.strategy.primary_audience,
        "tone": brain.strategy.tone,
    }
    return await call_agent(ctx, "text", CoreMessage, payload, temperature=0.5)
