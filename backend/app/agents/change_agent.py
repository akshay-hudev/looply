"""Agent 12: Campaign Versioning / Change Agent (deterministic).

A fact edit creates a new campaign version, finds the assets that depend on the changed facts via the
dependency graph, marks them stale and returns their ids for partial regeneration. Unaffected assets
(including approved ones) are left untouched.
"""

from sqlalchemy import delete, select

from app.graph.context import PipelineContext
from app.graph.state import FORMAT_CATALOG, CampaignBrain, asset_fact_keys, changed_facts, fact_values
from app.models import Asset, AssetDependency


def affected_asset_ids(ctx: PipelineContext, fact_keys: list[str]) -> list[str]:
    if not fact_keys:
        return []
    rows = ctx.db.scalars(select(AssetDependency.asset_id).where(
        AssetDependency.campaign_id == ctx.campaign.id, AssetDependency.fact_key.in_(fact_keys)).distinct())
    return list(rows)


def _sync_languages(ctx: PipelineContext, old: CampaignBrain, new: CampaignBrain) -> list[str]:
    """Add rows for newly added languages (cloned from the English master), delete removed ones."""
    added = [l for l in new.strategy.languages if l not in old.strategy.languages]
    removed = [l for l in old.strategy.languages if l not in new.strategy.languages]
    if removed:
        ctx.db.execute(delete(Asset).where(Asset.campaign_id == ctx.campaign.id, Asset.language.in_(removed)))
    existing = list(ctx.db.scalars(select(Asset).where(Asset.campaign_id == ctx.campaign.id)))
    seeds = {(a.platform, a.format, a.variant): a for a in existing}
    created = []
    for lang in added:
        for (plat, fmt, variant), seed in seeds.items():
            source = (seed.content or {}).get("source_en") or {}
            a = Asset(campaign_id=ctx.campaign.id, org_id=ctx.campaign.org_id, platform=plat, format=fmt,
                      language=lang, kind=FORMAT_CATALOG[plat][fmt], variant=variant, brain_version=new.version,
                      status="pending_localization" if lang != "en" else "draft",
                      content={**source, "source_en": source})
            created.append(a)
    ctx.db.add_all(created)
    ctx.db.flush()
    keys = asset_fact_keys(new)
    ctx.db.add_all(AssetDependency(asset_id=a.id, campaign_id=a.campaign_id, fact_key=k) for a in created for k in keys)
    return [a.id for a in created]


def apply_change(ctx: PipelineContext, new_brain: CampaignBrain, reason: str) -> dict:
    old = ctx.brain()
    changed = changed_facts(old, new_brain)
    if not changed:
        ctx.save_brain(new_brain)
        return {"changed": [], "affected_asset_ids": [], "version": old.version}

    affected = affected_asset_ids(ctx, [k for k in changed if k != "strategy.languages"])
    for a in ctx.db.scalars(select(Asset).where(Asset.id.in_(affected))):
        a.status = "stale"
        a.attempts = 0
    added = _sync_languages(ctx, old, new_brain) if "strategy.languages" in changed else []

    before, after = fact_values(old), fact_values(new_brain)
    new_brain.approval.status = "pending"
    version = ctx.snapshot_version(new_brain, {
        "reason": reason,
        "changed": [{"fact": k, "before": before[k], "after": after[k]} for k in changed],
        "affected_asset_ids": affected,
        "added_asset_ids": added,
    })
    ctx.db.commit()
    ctx.emit("change_agent", "info", f"Campaign change detected: {', '.join(changed)}. "
                                     f"Affected assets: {len(affected) + len(added)}",
             {"changed": changed, "affected": len(affected) + len(added), "version": version})
    return {"changed": changed, "affected_asset_ids": affected + added, "version": version}
