"""Analytics & Feedback agent: actual metrics vs AI predictions -> learnings for the next campaign."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.graph.context import PipelineContext


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
    new = [{**l.model_dump(), "campaign_id": ctx.campaign.id, "at": stamp} for l in out.learnings]
    keep = [l for l in (biz.learnings or []) if l.get("campaign_id") != ctx.campaign.id]
    biz.learnings = (keep + new)[-20:]
    ctx.db.commit()
    return out
