"""Analytics & Feedback agent: actual metrics vs AI predictions -> learnings for the next campaign."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.graph.context import PipelineContext
from app.models.base import new_id


class Learning(BaseModel):
    insight: str
    evidence: str = ""
    recommendation: str = ""


class AnalyticsOutput(BaseModel):
    summary: str
    learnings: list[Learning] = Field(default_factory=list, max_length=5)
    prediction_accuracy: str = ""


async def run(ctx: PipelineContext, rows: list[dict]) -> AnalyticsOutput:
    out = await call_agent(ctx, "analytics", AnalyticsOutput, {
        "business": ctx.business.name, "campaign": ctx.campaign.title, "actual_metrics": rows,
    }, temperature=0.3)
    biz = ctx.business
    stamp = datetime.now(timezone.utc).isoformat()
    simulated = any(bool(r.get("simulated")) for r in rows)
    new = [{**l.model_dump(), "id": new_id(), "campaign_id": ctx.campaign.id, "at": stamp,
            "simulated": simulated} for l in out.learnings]
    keep = [l for l in (biz.learnings or []) if l.get("campaign_id") != ctx.campaign.id]
    biz.learnings = (keep + new)[-20:]
    ctx.db.commit()
    return out
