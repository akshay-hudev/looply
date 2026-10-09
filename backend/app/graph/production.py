"""Turns agent output into Asset rows + dependency edges, and runs per-group steps."""

import asyncio
from collections import defaultdict

from sqlalchemy import delete, select

from app.agents import fact_checker, language_culture, optimizer, performance, platform, video, visual
from app.agents.copy import AssetCopy, copy_from_content
from app.content.templates import stamp
from app.graph.context import PipelineContext
from app.graph.state import FORMAT_CATALOG, asset_fact_keys
from app.models import Asset, AssetDependency
from app.services.creative_renderer import compose_image
from app.services.media_service import MediaService

GroupKey = tuple[str, str, str]  # platform, format, language


def campaign_assets(ctx: PipelineContext, ids: list[str] | None = None) -> list[Asset]:
    q = select(Asset).where(Asset.campaign_id == ctx.campaign.id)
    if ids is not None:
        q = q.where(Asset.id.in_(ids))
    return list(ctx.db.scalars(q.order_by(Asset.platform, Asset.format, Asset.language, Asset.variant)))


def groups(assets: list[Asset]) -> dict[GroupKey, list[Asset]]:
    out: dict[GroupKey, list[Asset]] = defaultdict(list)
    for a in assets:
        out[(a.platform, a.format, a.language)].append(a)
    return out


def _write_dependencies(ctx: PipelineContext, assets: list[Asset]) -> None:
    keys = asset_fact_keys(ctx.brain())
    ids = [a.id for a in assets]
    ctx.db.execute(delete(AssetDependency).where(AssetDependency.asset_id.in_(ids)))
    ctx.db.add_all(AssetDependency(asset_id=a.id, campaign_id=a.campaign_id, fact_key=k) for a in assets for k in keys)


def _set_copy(asset: Asset, copy: AssetCopy, *, source: AssetCopy) -> None:
    keep = {k: v for k, v in (asset.content or {}).items() if k in ("aspect_ratio", "template")}
    asset.content = {**keep, **copy.model_dump(), "source_en": source.model_dump()}


async def create_copy(ctx: PipelineContext) -> list[Asset]:
    """Full run: generate English master variants per platform and fan out rows per language."""
    brain = ctx.brain()
    ctx.db.execute(delete(Asset).where(Asset.campaign_id == ctx.campaign.id))
    ctx.db.commit()
    languages = brain.strategy.languages or ["en"]

    async def one(platform_name: str, formats: list[str]):
        ctx.emit("platform_agent", "started", f"Writing {platform_name} copy: {', '.join(formats)}")
        return platform_name, await platform.run(ctx, platform_name, formats)

    results = await asyncio.gather(*(one(p, f) for p, f in brain.strategy.formats.items()))
    created: list[Asset] = []
    for platform_name, by_format in results:
        for fmt, variants in by_format.items():
            for v in variants:
                master = AssetCopy.model_validate(v.model_dump(exclude={"label"}))
                for lang in languages:
                    a = Asset(campaign_id=ctx.campaign.id, org_id=ctx.campaign.org_id, platform=platform_name,
                              format=fmt, language=lang, kind=FORMAT_CATALOG[platform_name][fmt], variant=v.label,
                              brain_version=brain.version, status="draft" if lang == "en" else "pending_localization")
                    _set_copy(a, master, source=master)
                    a.content = {**(a.content or {}), "template": stamp(brain, fmt, v.label)}
                    created.append(a)
        ctx.emit("platform_agent", "completed", f"{platform_name}: {sum(len(v) for v in by_format.values())} variants")
    ctx.db.add_all(created)
    ctx.db.flush()
    _write_dependencies(ctx, created)
    ctx.db.commit()
    return created


async def recreate_copy(ctx: PipelineContext, assets: list[Asset], feedback: dict | None = None) -> None:
    """Regenerate English master copy in place for the given assets (same rows, same variant labels)."""
    brain = ctx.brain()
    by_platform: dict[str, set[str]] = defaultdict(set)
    for a in assets:
        by_platform[a.platform].add(a.format)
    if feedback is None:
        user_corrs = [str((a.content or {}).get("user_correction") or "") for a in assets if (a.content or {}).get("user_correction")]
        if user_corrs:
            feedback = {"user_instruction": "; ".join(set(user_corrs))}
    for platform_name, formats in by_platform.items():
        out = await platform.run(ctx, platform_name, sorted(formats), feedback=feedback)
        for a in assets:
            if a.platform != platform_name:
                continue
            variants = {v.label: v for v in out.get(a.format, [])}
            v = variants.get(a.variant) or next(iter(variants.values()))
            master = AssetCopy.model_validate(v.model_dump(exclude={"label"}))
            user_corr = (a.content or {}).get("user_correction")
            _set_copy(a, master, source=master)
            a.content = {**(a.content or {}), "template": stamp(brain, a.format, a.variant)}
            if user_corr:
                a.content = {**(a.content or {}), "user_correction": user_corr}
            a.status = "draft" if a.language == "en" else "pending_localization"
            a.brain_version = brain.version
            a.media_url = a.media_task_id = a.media_status = None
            a.is_selected = True
    _write_dependencies(ctx, assets)
    ctx.db.commit()


async def localize(ctx: PipelineContext, assets: list[Asset], feedback: dict[str, dict] | None = None) -> None:
    pending = [a for a in assets if a.language != "en"]
    tasks = []
    for (plat, fmt, lang), group in groups(pending).items():
        variants = [(a.variant, AssetCopy.model_validate(a.content.get("source_en") or {})) for a in group]
        fb = {a.variant: feedback[a.id] for a in group if feedback and a.id in feedback} or None
        tasks.append((group, language_culture.run(ctx, plat, fmt, lang, variants, feedback=fb)))
        ctx.emit("language_culture_agent", "started", f"Adapting {plat} {fmt} into {lang}")
    results = await asyncio.gather(*(t for _, t in tasks))
    for (group, _), result in zip(tasks, results):
        for a in group:
            r = result[a.variant]
            source = AssetCopy.model_validate(a.content.get("source_en") or {})
            _set_copy(a, r["copy"], source=source)
            a.content = {**a.content, "localization": {
                "score": r["score"], "back_translation": r["back_translation"], "candidates": r["candidates"]}}
            a.cultural_notes = r["cultural_notes"]
            a.status = "draft"
    ctx.db.commit()


def attach_previews(ctx: PipelineContext, assets: list[Asset]) -> None:
    """Give every visual a picture as soon as the copy exists, before the image model finishes."""
    media = MediaService(ctx.settings)
    brain = ctx.brain()
    changed = False
    for asset in assets:
        if asset.media_url or asset.status == "rejected" or asset.kind == "text" or asset.format == "message":
            continue
        if asset.kind == "video":
            video.storyboard(ctx, asset, media)
            changed = True
            continue
        if asset.kind != "image":
            continue
        svg = compose_image(asset.format, visual.creative_copy(asset, brain))
        asset.media_url = media.put(svg.encode("utf-8"), org_id=asset.org_id, ext="svg")
        asset.media_status = "ready"
        asset.content = {**(asset.content or {}), "media_source": "composed"}
        changed = True
    if changed:
        ctx.db.commit()


def accept_copy(ctx: PipelineContext, assets: list[Asset]) -> None:
    """Keep the written copy. Fact-checking is off so a line is not sent back for a rewrite."""
    for asset in assets:
        if asset.status in ("draft", "failed", "stale"):
            asset.status = "verified"
    ctx.db.commit()
    attach_previews(ctx, assets)


async def verify(ctx: PipelineContext, assets: list[Asset]) -> list[Asset]:
    await fact_checker.verify(ctx, assets)
    attach_previews(ctx, assets)
    return [a for a in assets if a.status == "failed"]


async def regenerate_failed(ctx: PipelineContext, failed: list[Asset]) -> None:
    feedback = {a.id: fact_checker.feedback_for(a) for a in failed}
    for a in failed:
        a.attempts = (a.attempts or 0) + 1
    english = [a for a in failed if a.language == "en"]
    localized = [a for a in failed if a.language != "en"]
    if english:
        merged = {"issues": [i for a in english for i in feedback[a.id]["issues"]],
                  "rejected_texts": [feedback[a.id]["rejected_text"] for a in english]}
        await recreate_copy(ctx, english, feedback=merged)
    if localized:
        for a in localized:
            a.status = "pending_localization"
        await localize(ctx, localized, feedback=feedback)
    ctx.db.commit()


async def predict_and_optimize(ctx: PipelineContext, assets: list[Asset]) -> None:
    rounds = ctx.settings.max_optimization_rounds
    for key, group in groups(assets).items():
        ctx.emit("performance_agent", "started", f"Predicting {key[0]} {key[1]} ({key[2]})")
        await performance.predict(ctx, group)
        selected = next((a for a in group if a.is_selected), None)
        if selected and selected.status == "verified" and rounds > 0:
            ctx.emit("optimization_agent", "started", f"Optimizing variant {selected.variant} of {key[0]} {key[1]} ({key[2]})")
            await optimizer.optimize(ctx, selected, group, rounds=rounds)


async def generate_media(ctx: PipelineContext, assets: list[Asset]) -> list[Asset]:
    """Image generation inline; video submitted and left for the poller. Returns pending video assets."""
    selected = [a for a in assets if a.is_selected and a.status == "verified"]
    attach_previews(ctx, selected)
    images = [a for a in selected if a.kind == "image"]
    videos = [a for a in selected if a.kind == "video"]
    for a in images:
        ctx.emit("visual_agent", "started", f"Creating {a.platform} {a.format} image ({a.language})")
    await asyncio.gather(*(visual.generate(ctx, a) for a in images))
    attach_previews(ctx, [a for a in assets if not a.media_url and a.kind in ("image", "video")])
    for a in videos:
        ctx.emit("video_agent", "started", f"Submitting {a.platform} {a.format} video ({a.language})")
        await video.submit(ctx, a)
    return [a for a in videos if a.media_status == "pending"]


def selected_copy(asset: Asset) -> AssetCopy:
    return copy_from_content(asset.content or {})
