import json
from typing import TypeVar

from pydantic import BaseModel

from app.graph.context import PipelineContext
from app.prompts.builder import build_system_prompt

M = TypeVar("M", bound=BaseModel)

AGENT_MARKER = "LOCALMIND_AGENT:"


def render_payload(agent_key: str, payload: dict) -> str:
    # The marker line lets offline/fake providers route requests; real models just ignore it.
    return f"{AGENT_MARKER}{agent_key}\n" + json.dumps(payload, ensure_ascii=False, indent=1, default=str)


def creative_context(ctx: PipelineContext) -> dict:
    """Everything a creative agent can draw on, plus how much the owner actually told us."""
    brain = ctx.brain()
    biz = ctx.business
    brief = brain.brief.filled()
    known = {
        "product": brain.offer.product, "offer": brain.offer.discount or brain.offer.price or brief.get("offer"),
        "audience": brain.strategy.primary_audience or brain.target_audience_hint or brief.get("audience"),
        "region": brain.locality.area or brain.locality.city or brief.get("region"),
        "goal": brain.objective or brief.get("goal"), "occasion": brief.get("occasion"),
        "highlights": brief.get("highlights") or brain.business.description,
    }
    richness = sum(1 for v in known.values() if v)
    return {
        "owner_brief": brief,
        "business_profile": {"name": brain.business.name or biz.name, "category": brain.business.category or biz.category,
                     "description": brain.business.description, "products": brain.business.products,
                     "personality": brain.business.personality, "brand_voice": brain.business.brand_voice},
        "place": {"city": brain.locality.city or biz.city, "area": brain.locality.area,
                  "insights": [i.interpretation for i in brain.locality.insights][:5]},
        "audience_hint": known["audience"],
        "occasion": brief.get("occasion"),
        "input_richness": "sparse" if richness <= 3 else "rich",
    }


async def call_agent(ctx: PipelineContext, agent_key: str, schema: type[M], payload: dict, *,
                     temperature: float = 0.7) -> M:
    return await ctx.gateway.chat_json(
        build_system_prompt(agent_key, schema), render_payload(agent_key, payload), schema, temperature=temperature
    )
