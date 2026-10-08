from app.agents.fact_checker import campaign_scores
from app.models import Asset, Campaign


def asset_out(a: Asset) -> dict:
    return {
        "id": a.id, "campaign_id": a.campaign_id, "platform": a.platform, "format": a.format,
        "language": a.language, "kind": a.kind, "variant": a.variant, "is_selected": a.is_selected,
        "status": a.status, "content": a.content or {}, "cultural_notes": a.cultural_notes,
        "media_url": a.media_url, "media_status": a.media_status, "media_prompt": a.media_prompt,
        "verification": a.verification or {}, "prediction": a.prediction or {},
        "optimization_history": a.optimization_history or [], "attempts": a.attempts,
        "brain_version": a.brain_version, "updated_at": a.updated_at,
    }


def review_summary(assets: list[Asset]) -> dict:
    selected = [a for a in assets if a.is_selected]
    preds = [a.prediction.get("predicted_score") for a in selected if (a.prediction or {}).get("predicted_score")]
    platform_fit = [a.prediction.get("platform_fit") for a in selected if (a.prediction or {}).get("platform_fit")]
    local = [a.prediction.get("local_relevance") for a in selected if (a.prediction or {}).get("local_relevance")]
    avg = lambda xs: round(sum(xs) / len(xs)) if xs else None  # noqa: E731
    return {
        "selected_assets": len(selected),
        "total_assets": len(assets),
        "languages": sorted({a.language for a in assets}),
        "platforms": sorted({a.platform for a in assets}),
        "verified": sum(1 for a in selected if a.status in ("verified", "approved")),
        "failed": sum(1 for a in selected if a.status == "failed"),
        "stale": sum(1 for a in assets if a.status == "stale"),
        "truth": campaign_scores(selected),
        "predicted_impact": avg(preds),
        "platform_fit": avg(platform_fit),
        "local_relevance": avg(local),
        "prediction_label": "AI-predicted",
    }


def campaign_out(c: Campaign, assets: list[Asset] | None = None) -> dict:
    out = {
        "id": c.id, "business_id": c.business_id, "title": c.title, "status": c.status, "stage": c.stage,
        "current_version": c.current_version, "brain": c.brain or {}, "created_at": c.created_at,
        "updated_at": c.updated_at,
    }
    if assets is not None:
        out["assets"] = [asset_out(a) for a in assets]
        out["summary"] = review_summary(assets)
    return out
