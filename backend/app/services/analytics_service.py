"""Pull actual metrics from each platform and feed learnings back into the business profile."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import analytics as analytics_agent
from app.core.crypto import decrypt
from app.graph.context import PipelineContext
from app.integrations import get_adapter
from app.models import AnalyticsSnapshot, Asset, Campaign, PublishJob, SocialAccount

log = logging.getLogger(__name__)


def latest_rows(db: Session, campaign_id: str) -> list[dict]:
    rows = []
    for job in db.scalars(select(PublishJob).where(PublishJob.campaign_id == campaign_id,
                                                   PublishJob.status == "published")):
        snap = db.scalar(select(AnalyticsSnapshot).where(AnalyticsSnapshot.publish_job_id == job.id)
                         .order_by(AnalyticsSnapshot.created_at.desc()))
        asset = db.get(Asset, job.asset_id)
        if asset is None:
            continue
        metrics = dict(snap.metrics) if snap else {}
        if job.platform == "whatsapp":
            r = job.result or {}
            metrics = {**metrics, "sent": r.get("sent", 0), "failed": r.get("failed", 0), **(r.get("delivery_counts") or {})}
        rows.append({"job_id": job.id, "asset_id": asset.id, "platform": asset.platform, "format": asset.format,
                     "language": asset.language, "variant": asset.variant, "metrics": metrics,
                     "simulated": bool(metrics.get("simulated") or (job.result or {}).get("simulated")),
                     "ai_predicted": {k: (asset.prediction or {}).get(k)
                                      for k in ("predicted_impact", "platform_fit", "local_relevance")},
                     "measured_at": snap.created_at if snap else None})
    return rows


async def pull_campaign_analytics(db: Session, campaign: Campaign | None) -> dict:
    if campaign is None:
        return {}
    jobs = list(db.scalars(select(PublishJob).where(PublishJob.campaign_id == campaign.id,
                                                    PublishJob.status == "published")))
    for job in jobs:
        account = db.get(SocialAccount, job.social_account_id)
        if account is None or not job.external_post_id:
            continue
        try:
            metrics = await get_adapter(account.platform).metrics(account, decrypt(account.access_token_enc) or "",
                                                                  job.external_post_id)
        except Exception as e:
            log.warning("metrics pull failed for job %s: %s", job.id, e)
            continue
        if metrics:
            db.add(AnalyticsSnapshot(org_id=job.org_id, campaign_id=campaign.id, publish_job_id=job.id,
                                     platform=job.platform, metrics=metrics))
    db.commit()
    rows = latest_rows(db, campaign.id)
    if not rows:
        return {"rows": [], "report": None}
    ctx = PipelineContext(db=db, campaign=campaign)
    try:
        report = await analytics_agent.run(ctx, rows)
    except Exception as e:
        log.warning("analytics agent failed for %s: %s", campaign.id, e)
        return {"rows": rows, "report": None}
    campaign.brain = {**(campaign.brain or {}), "analytics_report": report.model_dump()}
    db.commit()
    ctx.emit("analytics_agent", "completed", report.summary, {"learnings": len(report.learnings)})
    return {"rows": rows, "report": report.model_dump()}
