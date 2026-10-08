"""Agent 3: Locality Intelligence. Interprets verified places data; never invents locality facts."""

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.graph.context import PipelineContext
from app.graph.state import LocalityContext, LocalityInsight
from app.services.locality_service import LocalityService


class LocalityInterpretation(BaseModel):
    summary: str
    insights: list[LocalityInsight] = Field(default_factory=list)
    audience_hints: list[str] = Field(default_factory=list)


def ground_insights(ctx_data: LocalityContext, insights: list[LocalityInsight]) -> list[LocalityInsight]:
    """Drop any insight that does not cite a signal present in the verified data."""
    allowed = {s.type for s in ctx_data.signals} | {f"language:{l['language']}" for l in ctx_data.language_signals}
    allowed |= {"language"} if ctx_data.language_signals else set()
    return [i for i in insights if i.signal in allowed or i.signal.split(":")[0] in allowed]


async def run(ctx: PipelineContext, service: LocalityService | None = None) -> LocalityContext:
    brain = ctx.brain()
    biz = ctx.business
    service = service or LocalityService(ctx.settings)
    data = await service.gather(
        lat=biz.lat, lng=biz.lng, address=biz.address or brain.offer.location,
        city=brain.locality.city or biz.city, area=brain.locality.area,
    )
    if biz.lat is None and data.lat is not None:
        biz.lat, biz.lng = data.lat, data.lng
        ctx.db.commit()
    if not data.signals and not data.language_signals:
        data.summary = data.summary or "No verified locality data available."
        return data
    payload = {
        "business_category": brain.business.category,
        "campaign_objective": brain.objective,
        "verified_locality": data.model_dump(include={"city", "area", "radius_m", "data_source", "verified",
                                                      "signals", "language_signals"}),
        "allowed_signal_values": [s.type for s in data.signals] + (["language"] if data.language_signals else []),
    }
    interp = await call_agent(ctx, "locality", LocalityInterpretation, payload, temperature=0.3)
    data.insights = ground_insights(data, interp.insights)
    data.summary = interp.summary
    return data
