"""Visual Content Agent: Agnes Image 2.5 Flash posters, story cards, offer cards, carousel covers."""

import logging

from pydantic import BaseModel

from app.agents.base import call_agent, creative_context
from app.agents.copy import asset_text
from app.graph.context import PipelineContext
from app.graph.state import language_name
from app.models import Asset
from app.services.creative_renderer import CreativeCopy, compose_image
from app.services.media_service import MediaService
from app.validators.offer_validator import check_offer

log = logging.getLogger(__name__)

SIZES = {"1:1": "1024x1024", "4:5": "1024x1280", "9:16": "1024x1792", "3:4": "1024x1365"}
DEFAULT_RATIO = {"post": "1:1", "offer_card": "1:1", "carousel": "4:5", "story": "9:16", "poster": "3:4"}


class VisualPrompt(BaseModel):
    prompt: str
    negative_prompt: str = ""
    overlay_text: str
    aspect_ratio: str = "1:1"
    style_notes: str = ""


def carousel_slides(asset: Asset, brain) -> list[str]:
    """Slide texts (cover first). Falls back to splitting the copy; offer-violating slides are dropped."""
    c = asset.content or {}
    slides = [s for s in (c.get("slides") or []) if str(s).strip()]
    if len(slides) < 2:
        slides = [c.get("headline") or c.get("hook") or "", *[p for p in str(c.get("body") or "").split("\n") if p.strip()][:3],
                  c.get("cta") or ""]
    slides = [s.strip() for s in slides if s and s.strip() and not check_offer(s, brain.offer)]
    return slides[:6] if len(slides) >= 2 else (slides + [brain.business.name])[:2]


OFFLINE_PROVIDERS = ("demo", "fake")


def creative_copy(asset: Asset, brain, headline: str | None = None, slide_label: str = "") -> CreativeCopy:
    c = asset.content or {}
    o = brain.offer
    body = str(c.get("body") or "")
    support = body.split("\n")[0]
    if len(support) > 140:
        support = support[:140].rsplit(" ", 1)[0] + "…"
    head = headline or c.get("overlay_text") or c.get("headline") or c.get("hook") or o.product or brain.business.name
    when = " · ".join(x for x in (o.duration_text, o.start_date if o.start_date != o.duration_text else None, o.times) if x)
    place = ", ".join(x for x in (brain.locality.area, brain.locality.city) if x)
    return CreativeCopy(brand=brain.business.name or "", headline=str(head), support="" if headline else support,
                        cta=str(c.get("cta") or ""), discount=o.discount or "", price=o.price or "", when=when,
                        place=place, category=" ".join(x for x in (brain.business.category, o.product) if x),
                        slide_label=slide_label)


async def _render(ctx: PipelineContext, media: MediaService, asset: Asset, prompt: str, size: str,
                  fallback: CreativeCopy) -> tuple[str, str]:
    """(url, source). Falls back to a composed poster when no image model can serve the request."""
    try:
        result = await ctx.gateway.image(prompt, size=size)
    except Exception as e:
        log.warning("image model unavailable for asset %s, composing poster: %s", asset.id, e)
        result = None
    if result is None or result.provider in OFFLINE_PROVIDERS:
        svg = compose_image(asset.format, fallback)
        return media.put(svg.encode("utf-8"), org_id=asset.org_id, ext="svg"), "composed"
    if result.b64:
        return await media.store_b64(result.b64, org_id=asset.org_id), result.provider
    return await media.store_from_url(result.url, org_id=asset.org_id, default_ext="png"), result.provider


async def generate(ctx: PipelineContext, asset: Asset, media: MediaService | None = None) -> Asset:
    brain = ctx.brain()
    media = media or MediaService(ctx.settings)
    asset.media_status = "processing"
    ctx.db.commit()
    try:
        user_corr = (asset.content or {}).get("user_correction")
        payload = {
            **creative_context(ctx),
            "platform": asset.platform, "format": asset.format,
            "language": {"code": asset.language, "name": language_name(asset.language)},
            "copy": asset_text(asset.content or {}),
            "visual_brief": (asset.content or {}).get("visual_brief"),
            "offer_locked": brain.offer.model_dump(),
            "brand": brain.business.model_dump(include={"name", "category", "personality", "brand_voice"}),
            "locality": {"city": brain.locality.city, "area": brain.locality.area},
            "audience": brain.strategy.primary_audience,
            "default_aspect_ratio": DEFAULT_RATIO.get(asset.format, "1:1"),
            "user_correction_notes": user_corr,
        }
        vp = await call_agent(ctx, "visual", VisualPrompt, payload, temperature=0.7)
        # Overlay text is customer-facing; it must pass the same numeric checks as the copy.
        if check_offer(vp.overlay_text, brain.offer):
            vp.overlay_text = (asset.content or {}).get("headline") or ""
        size = SIZES.get(vp.aspect_ratio, "1024x1024")
        lang = language_name(asset.language)
        corr_instruction = f"\nSpecific user requested corrections to apply: {user_corr}" if user_corr else ""
        prompt = (f"{vp.prompt}{corr_instruction}\n\nRender this exact text clearly on the image ({lang}): "
                  f"\"{vp.overlay_text}\"\nAvoid: {vp.negative_prompt}")
        slides = carousel_slides(asset, brain) if asset.format == "carousel" else []
        cover = creative_copy(asset, brain, slide_label=f"1/{len(slides)}" if slides else "")
        if vp.overlay_text:
            cover.headline = vp.overlay_text if not slides else (slides[0] or vp.overlay_text)
        url, source = await _render(ctx, media, asset, prompt, size, cover)
        extra: dict = {"overlay_text": vp.overlay_text, "aspect_ratio": vp.aspect_ratio, "media_source": source,
                       "image_prompt": vp.prompt}
        if slides:
            slide_urls = [url]
            for i, text in enumerate(slides[1:], start=2):
                slide_prompt = (f"{vp.prompt}\n\nSlide {i} of a cohesive Instagram carousel: same palette, typography "
                                f"and art direction as slide 1. Render this exact text clearly ({lang}): \"{text}\"\n"
                                f"Avoid: {vp.negative_prompt}")
                slide_copy = creative_copy(asset, brain, headline=text, slide_label=f"{i}/{len(slides)}")
                if i < len(slides):
                    slide_copy.cta = ""
                slide_urls.append((await _render(ctx, media, asset, slide_prompt, size, slide_copy))[0])
            extra["slide_urls"] = slide_urls
        asset.media_prompt = prompt
        asset.media_url = url
        asset.media_status = "ready"
        asset.content = {**(asset.content or {}), **extra}
    except Exception as e:  # media failure must not sink the campaign; it is shown on the asset
        log.exception("image generation failed for asset %s", asset.id)
        asset.media_status = "failed"
        asset.content = {**(asset.content or {}), "media_error": str(e)[:500]}
    ctx.db.commit()
    return asset
