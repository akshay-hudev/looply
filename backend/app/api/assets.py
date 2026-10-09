from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.agents.copy import AssetCopy
from app.api.serializers import asset_out
from app.core.tenancy import OrgContext, get_org_context, get_owned
from app.graph.state import FORMAT_CATALOG
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
    if a.status in ("draft", "failed", "stale"):
        a.status = "verified"
    ctx.db.commit()
    return asset_out(a)


@router.post("/{asset_id}/accept-flag")
def accept_flag(asset_id: str, ctx: OrgContext = Depends(get_org_context)):
    """The owner has seen the fact-check note and wants this creative kept."""
    a = get_owned(ctx, Asset, asset_id)
    a.verification = {**(a.verification or {}), "owner_accepted": True}
    if a.status == "failed":
        a.status = "verified"
    ctx.db.commit()
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


class ReuseIn(BaseModel):
    mode: Literal["another_platform", "create"] = "another_platform"
    platform: str | None = None


def _place(source: Asset, platform: str) -> tuple[str, str]:
    catalog = FORMAT_CATALOG[platform]
    if source.format in catalog and catalog[source.format] == source.kind:
        return source.format, source.kind
    for fmt, kind in catalog.items():
        if kind == source.kind:
            return fmt, kind
    if source.media_url:
        for fmt, kind in catalog.items():
            if kind == "image":
                return fmt, kind
    fmt = next(iter(catalog))
    return fmt, catalog[fmt]


@router.post("/{asset_id}/reuse", status_code=201)
def reuse_asset(asset_id: str, body: ReuseIn, ctx: OrgContext = Depends(get_org_context)):
    """Copy a post so the same picture and words can go to another platform, or become a new version."""
    source = get_owned(ctx, Asset, asset_id)
    campaign = ctx.db.get(Campaign, source.campaign_id)
    if campaign is None or campaign.status not in ("review", "approved", "publishing", "published"):
        raise HTTPException(409, "This post can be copied once the campaign is ready")
    platform = source.platform if body.mode == "create" else (body.platform or source.platform).lower()
    if platform not in FORMAT_CATALOG:
        raise HTTPException(422, "Pick YouTube, X, or one of the connected platforms")
    fmt, kind = _place(source, platform)
    taken = list(ctx.db.scalars(select(Asset).where(
        Asset.campaign_id == source.campaign_id, Asset.platform == platform,
        Asset.format == fmt, Asset.language == source.language)))
    copy = Asset(
        org_id=source.org_id, campaign_id=source.campaign_id, platform=platform, format=fmt,
        language=source.language, kind=kind, variant=f"R{len(taken) + 1}"[:8], is_selected=True,
        content={**(source.content or {}), "reused_from": source.id},
        cultural_notes=source.cultural_notes, media_prompt=source.media_prompt,
        media_url=source.media_url, media_status="ready" if source.media_url else source.media_status,
        status="approved" if body.mode == "another_platform" else "verified",
        verification={}, prediction={}, brain_version=source.brain_version,
    )
    ctx.db.add(copy)
    ctx.db.commit()
    return asset_out(copy)


@router.post("/{asset_id}/reject")
def reject_asset(asset_id: str, ctx: OrgContext = Depends(get_org_context)):
    a = get_owned(ctx, Asset, asset_id)
    a.status = "rejected"
    a.is_selected = False
    ctx.db.commit()
    return asset_out(a)
