"""arq worker: `arq app.workers.settings.WorkerSettings`."""

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Campaign
from app.workers import tasks
from app.workers.token_refresh import refresh_expiring_tokens


async def plan_campaign(ctx, campaign_id, message, auto_accept_strategy=False):
    await tasks.plan_campaign(campaign_id, message, auto_accept_strategy)


async def produce_campaign(ctx, campaign_id, mode="full", asset_ids=None):
    await tasks.produce_campaign(campaign_id, mode, asset_ids)


async def poll_videos(ctx, campaign_id):
    await tasks.poll_videos(campaign_id)


async def publish_job(ctx, job_id):
    await tasks.publish_job(job_id)


async def pull_analytics(ctx, campaign_id):
    await tasks.pull_analytics(campaign_id)


async def scheduler_tick(ctx):
    await tasks.run_due_jobs()


async def analytics_tick(ctx):
    with SessionLocal() as db:
        ids = list(db.scalars(select(Campaign.id).where(Campaign.status.in_(("published", "publishing")))))
    for campaign_id in ids:
        await tasks.pull_analytics(campaign_id)


async def token_refresh_tick(ctx):
    await refresh_expiring_tokens()


class WorkerSettings:
    functions = [plan_campaign, produce_campaign, poll_videos, publish_job, pull_analytics]
    cron_jobs = [
        cron(scheduler_tick, second={0, 30}),
        cron(analytics_tick, minute={0}),
        cron(token_refresh_tick, minute={15}),
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    job_timeout = 60 * 30
