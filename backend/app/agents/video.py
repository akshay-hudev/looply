"""Video Content Agent: plans a reel and submits it to Agnes Video 2.5 (async; polled by the worker)."""

import logging

from pydantic import BaseModel, Field

from app.agents.base import call_agent, creative_context
from app.agents.copy import VideoScene, asset_text
from app.agents.visual import OFFLINE_PROVIDERS, creative_copy
from app.graph.context import PipelineContext
from app.graph.state import language_name
from app.models import Asset
from app.services.creative_renderer import compose_storyboard
from app.validators.offer_validator import check_offer
from app.services.media_service import MediaService

log = logging.getLogger(__name__)


class VideoPlan(BaseModel):
    prompt: str
    duration_s: int = Field(default=10, ge=4, le=20)
    aspect_ratio: str = "9:16"
    hook: str
    scenes: list[VideoScene]
    cta: str


async def submit(ctx: PipelineContext, asset: Asset) -> Asset:
    brain = ctx.brain()
    try:
        payload = {
            **creative_context(ctx),
            "platform": asset.platform, "format": asset.format,
            "language": {"code": asset.language, "name": language_name(asset.language)},
            "copy": asset_text(asset.content or {}),
            "draft_script": (asset.content or {}).get("video_script"),
            "offer_locked": brain.offer.model_dump(),
            "brand": brain.business.model_dump(include={"name", "category", "personality"}),
            "audience": brain.strategy.primary_audience,
            "locality": {"city": brain.locality.city, "area": brain.locality.area},
        }
        plan = await call_agent(ctx, "video", VideoPlan, payload, temperature=0.7)
        asset.media_prompt = plan.prompt
        asset.content = {**(asset.content or {}), "video_script": {
            "duration_s": plan.duration_s, "aspect_ratio": plan.aspect_ratio,
            "scenes": [s.model_dump() for s in plan.scenes]}, "video_hook": plan.hook}
        try:
            task = await ctx.gateway.video_submit(plan.prompt, duration_s=plan.duration_s,
                                                  aspect_ratio=plan.aspect_ratio)
        except Exception as e:
            log.warning("video model unavailable for asset %s, composing storyboard: %s", asset.id, e)
            task = None
        if task is None or task.provider in OFFLINE_PROVIDERS:
            storyboard(ctx, asset, note=None if task else "Video model unavailable; showing the storyboard.")
        else:
            asset.media_task_id = f"{task.provider}:{task.task_id}"
            asset.media_status = "pending"
    except Exception as e:
        log.exception("video planning failed for asset %s", asset.id)
        asset.media_status = "failed"
        asset.content = {**(asset.content or {}), "media_error": str(e)[:500]}
    ctx.db.commit()
    return asset


def storyboard(ctx: PipelineContext, asset: Asset, media: MediaService | None = None, note: str | None = None) -> None:
    """Animated storyboard preview of the reel, built from the verified script and offer facts."""
    media = media or MediaService(ctx.settings)
    brain = ctx.brain()
    c = asset.content or {}
    script = c.get("video_script") or {}
    scenes = [s for s in script.get("scenes") or []
              if not check_offer(f"{s.get('overlay_text') or ''} {s.get('voiceover') or ''}", brain.offer)]
    hook = c.get("video_hook")
    if not hook or check_offer(hook, brain.offer):
        hook = c.get("hook") or c.get("headline")
    fallback = creative_copy(asset, brain, headline=hook)
    svg = compose_storyboard(fallback, scenes, int(script.get("duration_s") or 10))
    asset.media_url = media.put(svg.encode("utf-8"), org_id=asset.org_id, ext="svg")
    asset.media_status = "ready"
    asset.content = {**c, "media_source": "storyboard", **({"media_note": note} if note else {})}


async def poll(ctx: PipelineContext, asset: Asset, media: MediaService | None = None) -> str:
    """One poll step. Success is only reported once the finished file is stored and retrievable."""
    if not asset.media_task_id or asset.media_status not in ("pending", "processing"):
        return asset.media_status or "none"
    provider, task_id = asset.media_task_id.split(":", 1)
    status = await ctx.gateway.video_status(provider, task_id)
    if status.status == "ready" and status.url:
        media = media or MediaService(ctx.settings)
        try:
            asset.media_url = await media.store_from_url(status.url, org_id=asset.org_id, default_ext="mp4")
        except Exception:
            # Keep the provider URL if re-hosting fails (e.g. offline demo URL).
            asset.media_url = status.url
        asset.media_status = "ready"
    elif status.status == "failed":
        storyboard(ctx, asset, media, note=f"Video generation failed ({status.error or 'unknown error'}); "
                                           "showing the storyboard.")
    else:
        asset.media_status = "processing"
    ctx.db.commit()
    return asset.media_status
