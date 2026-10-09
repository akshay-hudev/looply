from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.agents import fact_checker
from app.agents.copy import AssetCopy
from app.api.serializers import asset_out
from app.core.tenancy import OrgContext, get_org_context, get_owned
from app.graph.context import PipelineContext
from app.models import Asset, Campaign
from app.services.jobs import dispatch

router = APIRouter(prefix="/assets", tags=["assets"])


class AssetEdit(BaseModel):
    headline: str | None = None
    hook: str | None = None
    body: str | None = None
    cta: str | None = None
    hashtags: list[str] | None = None


def _siblings(ctx: OrgContext, a: Asset) -> list[Asset]:
    return list(ctx.db.scalars(select(Asset).where(
        Asset.campaign_id == a.campaign_id, Asset.platform == a.platform, Asset.format == a.format,
        Asset.language == a.language)))


@router.get("/{asset_id}")
def get_asset(asset_id: str, ctx: OrgContext = Depends(get_org_context)):
    return asset_out(get_owned(ctx, Asset, asset_id))


@router.patch("/{asset_id}")
async def edit_asset(asset_id: str, body: AssetEdit, ctx: OrgContext = Depends(get_org_context)):
    """Owner edits copy by hand. Edited copy goes through the same Truth Engine before approval."""
    a = get_owned(ctx, Asset, asset_id)
    edits = body.model_dump(exclude_unset=True, exclude_none=True)
    AssetCopy.model_validate({**(a.content or {}), **edits})
    a.content = {**(a.content or {}), **edits, "edited_by_owner": True}
    campaign = ctx.db.get(Campaign, a.campaign_id)
    await fact_checker.verify(PipelineContext(db=ctx.db, campaign=campaign), [a])
    return asset_out(a)


@router.post("/{asset_id}/select")
def select_variant(asset_id: str, ctx: OrgContext = Depends(get_org_context)):
    a = get_owned(ctx, Asset, asset_id)
    for s in _siblings(ctx, a):
        s.is_selected = s.id == a.id
    ctx.db.commit()
    return asset_out(a)


class RegenerateIn(BaseModel):
    instructions: str | None = None
    all_languages: bool = True


@router.post("/{asset_id}/regenerate")
async def regenerate_asset(asset_id: str, background: BackgroundTasks, body: RegenerateIn | None = None, ctx: OrgContext = Depends(get_org_context)):
    a = get_owned(ctx, Asset, asset_id)
    campaign = ctx.db.get(Campaign, a.campaign_id)
    if campaign.status == "generating":
        raise HTTPException(409, "The campaign is still generating")
    
    all_langs = body.all_languages if body is not None else True
    instructions = (body.instructions or "").strip() if body is not None else ""

    if all_langs:
        # Regenerate across every language for this platform and format
        group = list(ctx.db.scalars(select(Asset).where(
            Asset.campaign_id == a.campaign_id,
            Asset.platform == a.platform,
            Asset.format == a.format,
        )))
    else:
        group = _siblings(ctx, a)

    for s in group:
        s.status = "stale"
        s.attempts = 0
        if instructions:
            s.content = {**(s.content or {}), "user_correction": instructions}
        s.media_url = s.media_task_id = s.media_status = None

    campaign.status = "generating"
    ctx.db.commit()
    await dispatch(background, "produce_campaign", campaign.id, "regen", [s.id for s in group])
    return {"action": "regenerating", "asset_ids": [s.id for s in group], "all_languages": all_langs, "instructions": instructions}


@router.post("/{asset_id}/reject")
def reject_asset(asset_id: str, ctx: OrgContext = Depends(get_org_context)):
    a = get_owned(ctx, Asset, asset_id)
    a.status = "rejected"
    a.is_selected = False
    ctx.db.commit()
    return asset_out(a)
