from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.tenancy import OrgContext, get_org_context, get_owned
from app.models import Asset, Campaign, PublishJob, SocialAccount
from app.services.jobs import dispatch
from app.services.publishing_service import account_targets, refresh_campaign_status

router = APIRouter(tags=["publishing"])


class PublishItem(BaseModel):
    asset_id: str
    social_account_id: str
    scheduled_at: datetime | None = None


class PublishIn(BaseModel):
    """Either explicit items, or auto: every selected approved asset goes to every matching connected account."""
    items: list[PublishItem] | None = None
    scheduled_at: datetime | None = None
    platforms: list[str] | None = None


def job_out(j: PublishJob) -> dict:
    return {"id": j.id, "campaign_id": j.campaign_id, "asset_id": j.asset_id, "social_account_id": j.social_account_id,
            "platform": j.platform, "status": j.status, "scheduled_at": j.scheduled_at, "published_at": j.published_at,
            "external_post_id": j.external_post_id, "error": j.error, "attempts": j.attempts, "result": j.result,
            "simulated": bool((j.result or {}).get("simulated"))}


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


@router.post("/campaigns/{campaign_id}/publish", status_code=202)
async def publish(campaign_id: str, body: PublishIn, background: BackgroundTasks,
                  ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, Campaign, campaign_id)
    if c.status not in ("approved", "publishing", "published"):
        raise HTTPException(409, "The owner must approve the campaign before anything is published")
    if body.items:
        pairs = []
        for it in body.items:
            asset, acct = get_owned(ctx, Asset, it.asset_id), get_owned(ctx, SocialAccount, it.social_account_id)
            if asset.campaign_id != c.id:
                raise HTTPException(400, f"Asset {asset.id} is not part of this campaign")
            pairs.append((asset, acct, _aware(it.scheduled_at or body.scheduled_at)))
    else:
        assets = ctx.db.scalars(select(Asset).where(Asset.campaign_id == c.id, Asset.is_selected.is_(True),
                                                    Asset.status == "approved"))
        accounts = list(ctx.db.scalars(select(SocialAccount).where(SocialAccount.org_id == ctx.org_id,
                                                                   SocialAccount.active.is_(True))))
        accounts = [a for a in accounts if a.business_id in (None, c.business_id)]
        pairs = [(a, acct, _aware(body.scheduled_at)) for a in assets for acct in accounts
                 if account_targets(acct) == a.platform and (not body.platforms or a.platform in body.platforms)]
    pairs = [p for p in pairs if not (p[0].platform == "whatsapp" and p[0].format == "offer_card")]
    if not pairs:
        raise HTTPException(400, "Nothing to publish: connect an account for at least one approved platform")

    jobs = []
    for asset, acct, when in pairs:
        if asset.status != "approved":
            raise HTTPException(409, f"Asset {asset.id} is not approved")
        if account_targets(acct) != asset.platform:
            raise HTTPException(400, f"Account {acct.display_name} cannot publish {asset.platform} content")
        existing = ctx.db.scalar(select(PublishJob).where(
            PublishJob.asset_id == asset.id, PublishJob.social_account_id == acct.id,
            PublishJob.status.in_(("queued", "scheduled", "publishing", "published"))))
        if existing:
            jobs.append(existing)
            continue
        future = when and when > datetime.now(timezone.utc)
        job = PublishJob(org_id=ctx.org_id, campaign_id=c.id, asset_id=asset.id, social_account_id=acct.id,
                         platform=asset.platform, status="scheduled" if future else "queued", scheduled_at=when)
        ctx.db.add(job)
        jobs.append(job)
    ctx.db.commit()
    refresh_campaign_status(ctx.db, c.id)
    for j in jobs:
        if j.status == "queued":
            await dispatch(background, "publish_job", j.id)
    return [job_out(j) for j in jobs]


@router.get("/campaigns/{campaign_id}/publish-jobs")
def list_jobs(campaign_id: str, ctx: OrgContext = Depends(get_org_context)):
    get_owned(ctx, Campaign, campaign_id)
    rows = ctx.db.scalars(select(PublishJob).where(PublishJob.campaign_id == campaign_id).order_by(PublishJob.created_at))
    return [job_out(j) for j in rows]


@router.post("/publish-jobs/{job_id}/retry", status_code=202)
async def retry(job_id: str, background: BackgroundTasks, ctx: OrgContext = Depends(get_org_context)):
    j = get_owned(ctx, PublishJob, job_id)
    if j.status != "failed":
        raise HTTPException(409, "Only failed jobs can be retried")
    j.status, j.error, j.attempts, j.scheduled_at = "queued", None, 0, None
    ctx.db.commit()
    await dispatch(background, "publish_job", j.id)
    return job_out(j)


@router.post("/publish-jobs/{job_id}/cancel")
def cancel(job_id: str, ctx: OrgContext = Depends(get_org_context)):
    j = get_owned(ctx, PublishJob, job_id)
    if j.status not in ("queued", "scheduled"):
        raise HTTPException(409, "Only queued or scheduled jobs can be cancelled")
    j.status, j.error = "failed", "Cancelled by owner"
    ctx.db.commit()
    refresh_campaign_status(ctx.db, j.campaign_id)
    return job_out(j)
