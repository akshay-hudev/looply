"""Background tasks. Each opens its own DB session so it can run in-process or on the arq worker."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.agents import video
from app.core.db import SessionLocal
from app.graph import pipeline
from app.graph.context import PipelineContext, emit_event
from app.models import Asset, Campaign, PublishJob

log = logging.getLogger(__name__)


def _ctx(db, campaign_id: str) -> PipelineContext:
    return PipelineContext(db=db, campaign=db.get(Campaign, campaign_id))


async def plan_campaign(campaign_id: str, message: str, auto_accept_strategy: bool = False) -> None:
    with SessionLocal() as db:
        ctx = _ctx(db, campaign_id)
        try:
            await pipeline.run_plan(ctx, message, auto_accept_strategy=auto_accept_strategy)
        except Exception:
            log.exception("plan failed for %s", campaign_id)
            if ctx.campaign.status == "generating":
                ctx.set_status("failed", ctx.campaign.stage)
            return
        if auto_accept_strategy and ctx.campaign.status == "strategy_review":
            await _produce(ctx, "full", None)


async def produce_campaign(campaign_id: str, mode: str = "full", asset_ids: list[str] | None = None) -> None:
    with SessionLocal() as db:
        await _produce(_ctx(db, campaign_id), mode, asset_ids)


async def _produce(ctx: PipelineContext, mode: str, asset_ids: list[str] | None) -> None:
    try:
        state = await pipeline.run_produce(ctx, mode=mode, asset_ids=asset_ids)
    except Exception:
        return
    if state.get("pending_videos"):
        await poll_videos(ctx.campaign.id)


async def poll_videos(campaign_id: str, *, interval_s: float = 10.0, max_polls: int = 60) -> None:
    """Agnes video generation is async: poll until every submitted video is ready or failed."""
    with SessionLocal() as db:
        ctx = _ctx(db, campaign_id)
        for _ in range(max_polls):
            pending = list(db.scalars(select(Asset).where(
                Asset.campaign_id == campaign_id, Asset.media_status.in_(("pending", "processing")))))
            if not pending:
                return
            for a in pending:
                try:
                    status = await video.poll(ctx, a)
                except Exception as e:
                    log.warning("video poll failed for %s: %s", a.id, e)
                    continue
                if status in ("ready", "failed"):
                    ctx.emit("video_agent", "completed" if status == "ready" else "failed",
                             f"{a.platform} {a.format} video ({a.language}) {status}", {"asset_id": a.id})
            await asyncio.sleep(interval_s)
        for a in db.scalars(select(Asset).where(Asset.campaign_id == campaign_id,
                                                Asset.media_status.in_(("pending", "processing")))):
            a.media_status = "failed"
            a.content = {**(a.content or {}), "media_error": "Timed out waiting for video generation"}
        db.commit()


async def publish_job(job_id: str) -> None:
    from app.services.publishing_service import execute_job

    with SessionLocal() as db:
        job = db.get(PublishJob, job_id)
        if job is None:
            return
        await execute_job(db, job)
        emit_event(db, job.campaign_id, "publishing_agent", job.status,
                   f"{job.platform}: {job.status}" + (f" ({job.error})" if job.error else ""),
                   {"job_id": job.id, "asset_id": job.asset_id})


async def run_due_jobs() -> int:
    """Scheduler tick: publish scheduled jobs whose time has come."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = [j.id for j in db.scalars(select(PublishJob).where(
            PublishJob.status == "scheduled", PublishJob.scheduled_at <= now))]
    for job_id in due:
        await publish_job(job_id)
    return len(due)


async def pull_analytics(campaign_id: str) -> None:
    from app.services.analytics_service import pull_campaign_analytics

    with SessionLocal() as db:
        await pull_campaign_analytics(db, db.get(Campaign, campaign_id))
