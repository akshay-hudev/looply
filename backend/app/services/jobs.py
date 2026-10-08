"""Dispatch background work to the arq worker, or run it in-process when no worker is configured."""

from fastapi import BackgroundTasks

from app.core.config import get_settings
from app.workers import tasks

_IN_PROCESS = {
    "plan_campaign": tasks.plan_campaign,
    "produce_campaign": tasks.produce_campaign,
    "poll_videos": tasks.poll_videos,
    "publish_job": tasks.publish_job,
    "pull_analytics": tasks.pull_analytics,
}

_pool = None


async def _arq_pool():
    global _pool
    if _pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings

        _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    return _pool


async def dispatch(background: BackgroundTasks, name: str, *args) -> None:
    if get_settings().use_worker:
        pool = await _arq_pool()
        await pool.enqueue_job(name, *args)
    else:
        background.add_task(_IN_PROCESS[name], *args)
