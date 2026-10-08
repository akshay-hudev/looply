"""Executes PublishJobs. Only approved assets on authorized accounts are ever published."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt
from app.integrations import get_adapter
from app.integrations.base import AdapterError, AwaitingExternal, PublishContext
from app.models import Asset, Campaign, PublishJob, SocialAccount

log = logging.getLogger(__name__)
MAX_ATTEMPTS = 3


def account_targets(account: SocialAccount) -> str:
    """The platform an account publishes to (mock accounts stand in for a real platform)."""
    return (account.meta or {}).get("target_platform", account.platform) if account.platform == "mock" else account.platform


def refresh_campaign_status(db: Session, campaign_id: str) -> None:
    jobs = list(db.scalars(select(PublishJob).where(PublishJob.campaign_id == campaign_id)))
    c = db.get(Campaign, campaign_id)
    if not jobs or c is None:
        return
    states = {j.status for j in jobs}
    if states <= {"published"}:
        c.status = "published"
    elif states & {"queued", "scheduled", "publishing"} or "published" in states:
        c.status = "publishing"
    else:
        c.status = "approved"  # everything failed; owner can retry
    db.commit()


async def execute_job(db: Session, job: PublishJob) -> PublishJob:
    if job.status not in ("queued", "scheduled"):
        return job
    asset = db.get(Asset, job.asset_id)
    account = db.get(SocialAccount, job.social_account_id)
    reason = None
    if asset is None or asset.status != "approved":
        reason = "Asset is not approved by the owner"
    elif account is None or not account.active:
        reason = "Social account is disconnected"
    elif account.org_id != job.org_id or asset.org_id != job.org_id:
        reason = "Account does not belong to this organization"
    if reason:
        job.status, job.error = "failed", reason
        db.commit()
        refresh_campaign_status(db, job.campaign_id)
        return job

    job.status = "publishing"
    job.attempts += 1
    db.commit()
    try:
        token = decrypt(account.access_token_enc) or ""
        result = await get_adapter(account.platform).publish(PublishContext(db=db, account=account, asset=asset, token=token))
        job.status = "published"
        job.external_post_id = result.external_id
        job.published_at = datetime.now(timezone.utc)
        job.result = {"url": result.url, **result.raw}
        job.error = None
    except AwaitingExternal as e:
        job.status = "scheduled"
        job.scheduled_at = datetime.now(timezone.utc) + timedelta(seconds=e.retry_after_s)
        job.error = str(e)
        job.attempts -= 1  # waiting on platform review is not a failed attempt
    except AdapterError as e:
        if e.retryable and job.attempts < MAX_ATTEMPTS:
            job.status = "scheduled"
            job.scheduled_at = datetime.now(timezone.utc) + timedelta(minutes=2 ** job.attempts)
        else:
            job.status = "failed"
        job.error = str(e)
    except Exception as e:
        log.exception("publish job %s crashed", job.id)
        job.status, job.error = "failed", f"Unexpected error: {e}"
    db.commit()
    refresh_campaign_status(db, job.campaign_id)
    return job
