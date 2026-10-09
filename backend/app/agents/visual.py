"""Visual Content Agent: posters, story cards, offer cards and carousels.

With ANTHROPIC_API_KEY set, Claude designs each creative as SVG and it is rendered to PNG for publishing.
Otherwise Agnes Image 2.5 Flash draws it. Either way the built-in composed poster is the fallback.
"""

import asyncio
import logging

from pydantic import BaseModel

from app.agents.base import call_agent, creative_context
from app.agents.copy import asset_text
from app.graph.context import PipelineContext
from app.graph.state import language_name
from app.models import Asset
from app.services.claude_designer import ClaudeDesigner, DesignError, data_uri, get_designer, image_block, rasterize
from app.services.creative_renderer import SIZES as CANVAS, CreativeCopy, compose_image, palette_for
from app.services.media_service import MediaService
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
    """Slide texts (cover first). Falls back to splitting the copy."""
    c = asset.content or {}
    slides = [s for s in (c.get("slides") or []) if str(s).strip()]
    if len(slides) < 2:
        slides = [c.get("headline") or c.get("hook") or "", *[p for p in str(c.get("body") or "").split("\n") if p.strip()][:3],
                  c.get("cta") or ""]
    slides = [s.strip() for s in slides if s and s.strip()]
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


def owner_images(brain) -> list[dict]:
    return [{"role": f.role, "filename": f.filename, "url": f.url} for f in brain.files if f.kind == "image"]


async def _render(ctx: PipelineContext, media: MediaService, asset: Asset, prompt: str, size: str,
                  fallback: CreativeCopy, reference_urls: list[str] | None = None) -> tuple[str, str]:
    """(url, source). Falls back to a composed poster when no image model can serve the request."""
    try:
        result = await ctx.gateway.image(prompt, size=size, reference_urls=reference_urls or None)
    except Exception as e:
        log.warning("image model unavailable for asset %s, composing poster: %s", asset.id, e)
        result = None
    if result is None or result.provider in OFFLINE_PROVIDERS:
        svg = compose_image(asset.format, fallback)
        return media.put(svg.encode("utf-8"), org_id=asset.org_id, ext="svg"), "composed"
    if result.b64:
        return await media.store_b64(result.b64, org_id=asset.org_id), result.provider
    return await media.store_from_url(result.url, org_id=asset.org_id, default_ext="png"), result.provider


def design_brief(asset: Asset, brain, cover: CreativeCopy) -> dict:
    """What Claude needs to design one creative: the copy, the locked facts and the brand."""
    c = asset.content or {}
    p = palette_for(cover.category, cover.brand, cover.headline)
    return {
        "platform": asset.platform, "format": asset.format,
        "language": {"code": asset.language, "name": language_name(asset.language)},
        "brand": {"name": brain.business.name, "category": brain.business.category,
                  "voice": brain.business.brand_voice, "palette_hint": [p.bg1, p.bg2, p.accent, p.soft]},
        "headline": cover.headline, "support_line": cover.support, "body": c.get("body"),
        "call_to_action": cover.cta,
        "locked_facts": {"discount": cover.discount, "price": cover.price, "when": cover.when, "place": cover.place},
        "tone": brain.strategy.tone, "audience": brain.strategy.primary_audience,
        "owner_correction_notes": c.get("user_correction"),
    }


async def generate_with_claude(ctx: PipelineContext, asset: Asset, designer: ClaudeDesigner, media: MediaService) -> None:
    """Claude designs the creative as SVG; we keep the SVG and publish a PNG rendered from it."""
    brain = ctx.brain()
    media_dir = ctx.settings.local_media_dir
    slides = carousel_slides(asset, brain) if asset.format == "carousel" else []
    cover = creative_copy(asset, brain, slide_label=f"1/{len(slides)}" if slides else "")
    width, height = CANVAS.get(asset.format, (1080, 1080))
    files = owner_images(brain)
    references = [b for b in (image_block(f["url"], media_dir) for f in files if f["role"] != "logo") if b][:3]
    logo = next((f["url"] for f in files if f["role"] == "logo"), None)
    try:
        svgs = await designer.poster(design_brief(asset, brain, cover), width=width, height=height, slides=slides or None,
                                     references=references, logo_uri=data_uri(logo, media_dir) if logo else None)
        pngs = await asyncio.gather(*(asyncio.to_thread(rasterize, svg, width, height) for svg in svgs))
    except DesignError as e:
        log.warning("claude could not design asset %s, using the composed poster: %s", asset.id, e)
        svg = compose_image(asset.format, cover)
        asset.media_url = media.put(svg.encode("utf-8"), org_id=asset.org_id, ext="svg")
        asset.media_status = "ready"
        asset.content = {**(asset.content or {}), "media_source": "composed",
                         "media_note": "Claude couldn't design this one, so LOOPLY composed it from your copy."}
        return
    svg_urls = [media.put(svg.encode("utf-8"), org_id=asset.org_id, ext="svg") for svg in svgs]
    png_urls = [media.put(png, org_id=asset.org_id, ext="png") for png in pngs]
    asset.media_prompt = None
    asset.media_url = png_urls[0]
    asset.media_status = "ready"
    content = {k: v for k, v in (asset.content or {}).items() if k not in ("media_error", "media_note")}
    content.update({"media_source": "claude", "design_model": designer.model, "svg_url": svg_urls[0]})
    if slides:
        content.update({"slide_urls": png_urls, "slide_svg_urls": svg_urls})
    asset.content = content


async def generate(ctx: PipelineContext, asset: Asset, media: MediaService | None = None) -> Asset:
    brain = ctx.brain()
    media = media or MediaService(ctx.settings)
    designer = get_designer(ctx.settings)
    if designer is not None:
        asset.media_status = "processing"
        ctx.db.commit()
        try:
            await generate_with_claude(ctx, asset, designer, media)
        except Exception as e:  # media failure must not sink the campaign; it is shown on the asset
            log.exception("claude design failed for asset %s", asset.id)
            asset.media_status = "failed"
            asset.content = {**(asset.content or {}), "media_error": str(e)[:500]}
        ctx.db.commit()
        return asset
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
            "owner_images": owner_images(brain),
            "template": (asset.content or {}).get("template"),
            "template_instruction": (
                "Compose the picture to this template's layout. One hero, the overlay from the copy, "
                "and the template's job. Do not add a second offer or a second scene."
            ),
        }
        vp = await call_agent(ctx, "visual", VisualPrompt, payload, temperature=0.7)
        size = SIZES.get(vp.aspect_ratio, "1024x1024")
        lang = language_name(asset.language)
        corr_instruction = f"\nSpecific user requested corrections to apply: {user_corr}" if user_corr else ""
        prompt = (f"{vp.prompt}{corr_instruction}\n\nRender this exact text clearly on the image ({lang}): "
                  f"\"{vp.overlay_text}\"\nAvoid: {vp.negative_prompt}")
        refs = owner_images(brain)
        if refs:
            notes = []
            for im in refs:
                if im["role"] == "logo":
                    notes.append(f"Place the owner's logo ({im['filename']}) in a corner. Do not invent a different logo.")
                else:
                    notes.append(f"Match the owner's sample ({im['filename']}): same product, colours, and layout.")
            prompt = f"{prompt}\n" + "\n".join(notes)
        ref_urls = [im["url"] for im in refs]
        slides = carousel_slides(asset, brain) if asset.format == "carousel" else []
        cover = creative_copy(asset, brain, slide_label=f"1/{len(slides)}" if slides else "")
        if vp.overlay_text:
            cover.headline = vp.overlay_text if not slides else (slides[0] or vp.overlay_text)
        url, source = await _render(ctx, media, asset, prompt, size, cover, ref_urls)
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
                slide_urls.append((await _render(ctx, media, asset, slide_prompt, size, slide_copy, ref_urls))[0])
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
