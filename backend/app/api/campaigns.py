import asyncio
import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.agents import campaign_manager, change_agent
from app.api.businesses import ensure_learning_ids
from app.api.serializers import campaign_out
from app.core.db import SessionLocal
from app.core.security import decode_access_token
from app.core.tenancy import OrgContext, get_org_context, get_owned
from app.graph.context import PipelineContext
from app.graph.state import FORMAT_CATALOG, CampaignBrain, CampaignBrief, OfferFacts
from app.models import AgentEvent, Asset, Business, Campaign, CampaignVersion, Membership
from app.services.jobs import dispatch

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

PRE_PRODUCTION = ("draft", "clarifying", "strategy_review", "failed")


class CampaignIn(BaseModel):
    business_id: str
    message: str = Field(default="", max_length=5000)
    brief: CampaignBrief = Field(default_factory=CampaignBrief)
    title: str | None = None
    content_mode: Literal["ai", "user"] = "ai"
    requested_formats: dict[str, list[str]] = Field(default_factory=dict)
    requested_languages: list[str] = Field(default_factory=list)
    auto_accept_strategy: bool = False


class MessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class StrategyPatch(BaseModel):
    platforms: list[str] | None = None
    formats: dict[str, list[str]] | None = None
    languages: list[str] | None = None
    tone: str | None = None
    code_switching: bool | None = None
    code_switching_style: str | None = None


class FactsPatch(BaseModel):
    offer: dict | None = None
    business_name: str | None = None
    brand_voice: str | None = None
    supported_claims: list[str] | None = None


def _assets(ctx: OrgContext, campaign_id: str) -> list[Asset]:
    return list(ctx.db.scalars(select(Asset).where(Asset.campaign_id == campaign_id)
                               .order_by(Asset.platform, Asset.format, Asset.language, Asset.variant)))


def _validate_formats(formats: dict[str, list[str]]) -> dict[str, list[str]]:
    for platform, fmts in formats.items():
        allowed = FORMAT_CATALOG.get(platform)
        bad = [f for f in fmts if not allowed or f not in allowed]
        if bad:
            raise HTTPException(422, f"Unsupported formats for {platform}: {bad}")
    return {p: f for p, f in formats.items() if f}


@router.get("/formats")
def formats_catalog():
    return FORMAT_CATALOG


BRIEF_LABELS = {
    "product": "What we are promoting", "audience": "Target audience", "region": "Region",
    "goal": "Goal", "offer": "Offer", "occasion": "Occasion", "event_date": "Date", "tone": "Tone",
    "highlights": "What makes us special",
}


def brief_message(brief: CampaignBrief, message: str) -> str:
    lines = [f"{BRIEF_LABELS[k]}: {v}" for k, v in brief.filled().items()]
    return "\n".join([message.strip(), *lines]).strip()


def seed_brain(brain: CampaignBrain, brief: CampaignBrief) -> None:
    """Owner-entered brief fields become facts directly, so nothing has to be re-asked."""
    b = brief.filled()
    if b.get("product"):
        brain.offer.product = b["product"]
    if b.get("goal"):
        brain.objective = b["goal"]
    if b.get("audience"):
        brain.target_audience_hint = b["audience"]
    if b.get("event_date"):
        brain.offer.start_date = b["event_date"]
    if b.get("occasion"):
        brain.offer.duration_text = b["occasion"]
    if b.get("region"):
        parts = [p.strip() for p in b["region"].split(",") if p.strip()]
        brain.locality.city = parts[-1]
        if len(parts) > 1:
            brain.locality.area = parts[0]
    if b.get("tone"):
        brain.strategy.tone = b["tone"]


@router.post("", status_code=201)
async def create_campaign(body: CampaignIn, background: BackgroundTasks, ctx: OrgContext = Depends(get_org_context)):
    biz = get_owned(ctx, Business, body.business_id)
    formats = _validate_formats(body.requested_formats)
    if body.content_mode == "user" and not formats:
        raise HTTPException(422, "Choose at least one format, or use content_mode 'ai'")
    message = brief_message(body.brief, body.message)
    if len(message) < 3:
        message = f"Promote {biz.name}" + (f", a {biz.category}" if biz.category else "")
    brain = CampaignBrain(content_mode=body.content_mode, requested_formats=formats,
                          requested_platforms=list(formats), brief=body.brief,
                          requested_languages=[l.lower() for l in body.requested_languages])
    seed_brain(brain, body.brief)
    title = body.title or body.brief.product or body.message[:80] or f"{biz.name} campaign"
    c = Campaign(org_id=ctx.org_id, business_id=body.business_id, title=title[:255],
                 status="generating", stage="intake", brain=brain.model_dump(mode="json"))
    ctx.db.add(c)
    ctx.db.commit()
    await dispatch(background, "plan_campaign", c.id, message, body.auto_accept_strategy)
    return campaign_out(c, [])


@router.get("")
def list_campaigns(status_filter: str | None = Query(None, alias="status"), business_id: str | None = None,
                   ctx: OrgContext = Depends(get_org_context)):
    q = select(Campaign).where(Campaign.org_id == ctx.org_id)
    if status_filter:
        q = q.where(Campaign.status.in_(status_filter.split(",")))
    if business_id:
        q = q.where(Campaign.business_id == business_id)
    return [campaign_out(c) for c in ctx.db.scalars(q.order_by(Campaign.created_at.desc()))]


WAITING = {"clarifying", "strategy_review", "review"}


def _locked(brain: dict) -> bool:
    brief = brain.get("brief") or {}
    strategy = brain.get("strategy") or {}
    return any(brief.get(k) for k in ("product", "offer", "region", "audience")) or bool(strategy.get("languages"))


@router.get("/start")
def campaign_start(business_id: str | None = None, learning: str | None = None,
                   ctx: OrgContext = Depends(get_org_context)):
    """Place and languages for the next campaign, from the shop's last locked campaign. Not from the URL."""
    campaigns = list(ctx.db.scalars(
        select(Campaign).where(Campaign.org_id == ctx.org_id)
        .order_by(Campaign.created_at.desc(), Campaign.id.desc())))
    last_used = campaigns[0].business_id if campaigns else None
    biz_id = business_id or last_used
    if not biz_id:
        return {"business_id": None, "region": None, "languages": [], "note": None}
    biz = get_owned(ctx, Business, biz_id)
    ensure_learning_ids(ctx, biz)
    prior = next((c for c in campaigns if c.business_id == biz_id and c.status not in WAITING and _locked(c.brain or {})), None)
    brain = (prior.brain if prior else {}) or {}
    brief = brain.get("brief") or {}
    strategy = brain.get("strategy") or {}
    region = (brief.get("region") or "").strip() or ", ".join(p for p in (biz.address, biz.city) if p) or None
    languages = [str(l).lower() for l in (strategy.get("languages") or brain.get("requested_languages") or []) if l]
    note = None
    if learning:
        match = next((l for l in (biz.learnings or []) if isinstance(l, dict) and l.get("id") == learning), None)
        if match and match.get("recommendation"):
            note = match["recommendation"]
    return {"business_id": biz.id, "region": region or None, "languages": languages, "note": note}


@router.get("/{campaign_id}")
def get_campaign(campaign_id: str, ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, Campaign, campaign_id)
    return campaign_out(c, _assets(ctx, c.id))


@router.post("/{campaign_id}/messages")
async def send_message(campaign_id: str, body: MessageIn, background: BackgroundTasks,
                       ctx: OrgContext = Depends(get_org_context)):
    """Owner talks to the Campaign Manager: answers questions before production, or changes facts after."""
    c = get_owned(ctx, Campaign, campaign_id)
    if c.status == "generating":
        raise HTTPException(status.HTTP_409_CONFLICT, "The campaign is still generating; try again shortly")
    if c.status in PRE_PRODUCTION and not _assets(ctx, c.id):
        c.status = "generating"
        ctx.db.commit()
        await dispatch(background, "plan_campaign", c.id, body.message, False)
        return {"action": "replanning"}
    pctx = PipelineContext(db=ctx.db, campaign=c)
    new_brain, ex = await campaign_manager.run(pctx, body.message)
    if ex.languages_requested:
        # Chat can add languages; removing one is done from the strategy screen.
        new_brain.strategy.languages = list(dict.fromkeys(
            [*new_brain.strategy.languages, *[l.lower() for l in ex.languages_requested]]))
    result = change_agent.apply_change(pctx, new_brain, reason=f"Owner: {body.message}")
    if result["affected_asset_ids"]:
        c.status = "generating"
        ctx.db.commit()
        await dispatch(background, "produce_campaign", c.id, "regen", result["affected_asset_ids"])
    return {"action": "change" if result["changed"] else "no_change", "summary": ex.summary, **result}


@router.put("/{campaign_id}/strategy")
async def update_strategy(campaign_id: str, body: StrategyPatch, background: BackgroundTasks,
                          ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, Campaign, campaign_id)
    pctx = PipelineContext(db=ctx.db, campaign=c)
    brain = pctx.brain()
    patch = body.model_dump(exclude_unset=True)
    if "formats" in patch:
        patch["formats"] = _validate_formats(patch["formats"])
        patch["platforms"] = list(patch["formats"])
    if "languages" in patch:
        patch["languages"] = [l.lower() for l in patch["languages"]]
    new_brain = brain.model_copy(deep=True)
    for k, v in patch.items():
        setattr(new_brain.strategy, k, v)
    has_assets = bool(_assets(ctx, c.id))
    if not has_assets:
        pctx.save_brain(new_brain)
        return campaign_out(c, [])
    if "formats" in patch and patch["formats"] != brain.strategy.formats:
        new_brain.strategy.accepted = True
        pctx.snapshot_version(new_brain, {"reason": "formats changed; full regeneration"})
        c.status = "generating"
        ctx.db.commit()
        await dispatch(background, "produce_campaign", c.id, "full", None)
        return {"action": "regenerating_all"}
    result = change_agent.apply_change(pctx, new_brain, reason="Strategy edited")
    if result["affected_asset_ids"]:
        c.status = "generating"
        ctx.db.commit()
        await dispatch(background, "produce_campaign", c.id, "regen", result["affected_asset_ids"])
    return {"action": "change", **result}


@router.post("/{campaign_id}/strategy/accept")
async def accept_strategy(campaign_id: str, background: BackgroundTasks, ctx: OrgContext = Depends(get_org_context)):
    c = get_owned(ctx, Campaign, campaign_id)
    if c.status != "strategy_review":
        raise HTTPException(409, f"Campaign is '{c.status}', not awaiting strategy review")
    pctx = PipelineContext(db=ctx.db, campaign=c)
    brain = pctx.brain()
    if not brain.strategy.formats:
        raise HTTPException(422, "Strategy has no formats")
    brain.strategy.accepted = True
    pctx.save_brain(brain)
    c.status = "generating"
    ctx.db.commit()
    await dispatch(background, "produce_campaign", c.id, "full", None)
    return {"action": "producing"}


@router.patch("/{campaign_id}/facts")
async def update_facts(campaign_id: str, body: FactsPatch, background: BackgroundTasks,
                       ctx: OrgContext = Depends(get_org_context)):
    """Direct edit of locked facts (e.g. discount 20% -> 25%). Triggers the Change Agent."""
    c = get_owned(ctx, Campaign, campaign_id)
    if c.status == "generating":
        raise HTTPException(409, "The campaign is still generating; try again shortly")
    pctx = PipelineContext(db=ctx.db, campaign=c)
    new_brain = pctx.brain().model_copy(deep=True)
    if body.offer:
        new_brain.offer = OfferFacts.model_validate({**new_brain.offer.model_dump(), **body.offer})
    if body.business_name:
        new_brain.business.name = body.business_name
    if body.brand_voice:
        new_brain.business.brand_voice = body.brand_voice
    if body.supported_claims is not None:
        new_brain.business.supported_claims = body.supported_claims
    result = change_agent.apply_change(pctx, new_brain, reason="Facts edited by owner")
    if result["affected_asset_ids"]:
        c.status = "generating"
        ctx.db.commit()
        await dispatch(background, "produce_campaign", c.id, "regen", result["affected_asset_ids"])
    return result


@router.post("/{campaign_id}/approve")
def approve_campaign(campaign_id: str, ctx: OrgContext = Depends(get_org_context)):
    """Owner approval of every selected, verified asset. Nothing publishes without this."""
    c = get_owned(ctx, Campaign, campaign_id)
    if c.status not in ("review", "approved"):
        raise HTTPException(409, f"Campaign is '{c.status}', not ready for approval")
    assets = _assets(ctx, c.id)
    selected = [a for a in assets if a.is_selected]
    blocking = [a.id for a in selected if a.status in ("failed", "stale", "draft", "pending_localization")]
    if blocking:
        raise HTTPException(422, {"message": "Some selected assets are not verified", "asset_ids": blocking})
    for a in selected:
        a.status = "approved"
    pctx = PipelineContext(db=ctx.db, campaign=c)
    brain = pctx.brain()
    brain.approval.status = "approved"
    brain.approval.by = ctx.user.email
    brain.approval.at = datetime.now(timezone.utc).isoformat()
    pctx.save_brain(brain)
    c.status = "approved"
    ctx.db.commit()
    return campaign_out(c, assets)


@router.get("/{campaign_id}/versions")
def list_versions(campaign_id: str, ctx: OrgContext = Depends(get_org_context)):
    get_owned(ctx, Campaign, campaign_id)
    rows = ctx.db.scalars(select(CampaignVersion).where(CampaignVersion.campaign_id == campaign_id)
                          .order_by(CampaignVersion.version.desc()))
    return [{"version": v.version, "change_summary": v.change_summary, "created_at": v.created_at,
             "offer": (v.brain or {}).get("offer")} for v in rows]


@router.get("/{campaign_id}/events")
def list_events(campaign_id: str, after: int = 0, ctx: OrgContext = Depends(get_org_context)):
    get_owned(ctx, Campaign, campaign_id)
    rows = ctx.db.scalars(select(AgentEvent).where(AgentEvent.campaign_id == campaign_id, AgentEvent.seq > after)
                          .order_by(AgentEvent.seq))
    return [_event_out(e) for e in rows]


def _event_out(e: AgentEvent) -> dict:
    return {"seq": e.seq, "agent": e.agent, "status": e.status, "message": e.message, "data": e.data,
            "created_at": e.created_at.isoformat() if e.created_at else None}


@router.get("/{campaign_id}/stream")
async def stream_events(campaign_id: str, token: str, org_id: str, after: int = 0):
    """SSE progress stream. EventSource cannot set headers, so auth comes from query params."""
    user_id = decode_access_token(token)
    with SessionLocal() as db:
        member = db.scalar(select(Membership).where(Membership.user_id == user_id, Membership.org_id == org_id))
        campaign = db.get(Campaign, campaign_id)
        if not user_id or member is None or campaign is None or campaign.org_id != org_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")

    async def gen():
        last = after
        idle = 0
        while idle < 600:
            with SessionLocal() as db:
                rows = list(db.scalars(select(AgentEvent).where(
                    AgentEvent.campaign_id == campaign_id, AgentEvent.seq > last).order_by(AgentEvent.seq)))
                c = db.get(Campaign, campaign_id)
                st = {"status": c.status, "stage": c.stage}
            for e in rows:
                last = e.seq
                yield {"event": "agent", "data": json.dumps(_event_out(e), default=str)}
            yield {"event": "status", "data": json.dumps(st)}
            idle = 0 if rows else idle + 1
            await asyncio.sleep(1)

    return EventSourceResponse(gen())
