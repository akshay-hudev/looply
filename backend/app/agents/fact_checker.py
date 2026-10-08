"""Agent 9: Campaign Truth Engine. Deterministic checks first, then an LLM meaning/claims check."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.agents.copy import asset_text
from app.graph.context import PipelineContext
from app.graph.state import CampaignBrain, language_name
from app.models import Asset
from app.validators.claim_validator import check_claims
from app.validators.content_validator import check_format
from app.validators.offer_validator import Issue, check_offer, missing_facts

BLOCKING = {"high", "medium"}
CATEGORY = {
    "discount_mismatch": "offer", "price_mismatch": "offer", "missing_fact": "offer",
    "product_mismatch": "product", "date_mismatch": "date", "time_mismatch": "date",
    "location_mismatch": "location", "missing_restriction": "offer",
    "unsupported_claim": "claims", "meaning_drift": "meaning", "format_violation": "format", "other": "meaning",
}


class LLMIssue(BaseModel):
    type: Literal["product_mismatch", "price_mismatch", "discount_mismatch", "date_mismatch", "time_mismatch",
                  "location_mismatch", "missing_restriction", "unsupported_claim", "meaning_drift", "other"]
    expected: str = ""
    found: str = ""
    severity: Literal["high", "medium", "low"] = "medium"


class AssetVerdict(BaseModel):
    asset_id: str
    back_translation: str
    issues: list[LLMIssue] = Field(default_factory=list)
    verdict: Literal["PASS", "NEEDS_WORK"]


class TruthOutput(BaseModel):
    results: list[AssetVerdict]


def deterministic_issues(asset: Asset, brain: CampaignBrain) -> list[Issue]:
    text = asset_text(asset.content or {})
    return [
        *check_offer(text, brain.offer),
        *check_claims(text, brain.business.supported_claims),
        *check_format(asset.platform, asset.format, asset.content or {}),
        *missing_facts(text, brain.offer),
    ]


def summarize(issues: list[dict]) -> dict:
    checks = {c: "pass" for c in ("offer", "product", "date", "location", "claims", "meaning", "format")}
    for i in issues:
        cat = CATEGORY.get(i["type"], "meaning")
        if i["severity"] in BLOCKING:
            checks[cat] = "fail"
        elif checks[cat] == "pass":
            checks[cat] = "warn"
    return checks


async def verify(ctx: PipelineContext, assets: list[Asset], *, use_llm: bool = True) -> dict[str, dict]:
    """Verify assets, write Asset.verification/status, return {asset_id: verification}."""
    brain = ctx.brain()
    det = {a.id: [i.dict() for i in deterministic_issues(a, brain)] for a in assets}
    llm: dict[str, AssetVerdict] = {}
    if use_llm and assets:
        # One LLM call per language group keeps prompts focused and parallel-safe.
        by_lang: dict[str, list[Asset]] = {}
        for a in assets:
            by_lang.setdefault(a.language, []).append(a)
        for language, group in by_lang.items():
            payload = {
                "offer_locked": brain.offer.model_dump(),
                "business_name": brain.business.name,
                "supported_claims": brain.business.supported_claims,
                "language": language_name(language),
                "assets": [{"asset_id": a.id, "platform": a.platform, "format": a.format,
                            "text": asset_text(a.content or {})} for a in group],
            }
            out = await call_agent(ctx, "truth", TruthOutput, payload, temperature=0.0)
            llm.update({r.asset_id: r for r in out.results})

    now = datetime.now(timezone.utc).isoformat()
    results = {}
    for a in assets:
        issues = list(det[a.id])
        v = llm.get(a.id)
        if v:
            issues += [{**i.model_dump(), "source": "llm"} for i in v.issues]
        elif use_llm:
            issues.append({"type": "other", "expected": "LLM verification result", "found": "missing",
                           "severity": "medium", "source": "llm"})
        passed = not any(i["severity"] in BLOCKING for i in issues)
        verification = {
            "verdict": "PASS" if passed else "NEEDS_WORK",
            "issues": issues,
            "checks": summarize(issues),
            "back_translation": v.back_translation if v else None,
            "checked_at": now,
        }
        a.verification = verification
        a.status = "verified" if passed else "failed"
        results[a.id] = verification
    ctx.db.commit()
    return results


def feedback_for(asset: Asset) -> dict:
    v = asset.verification or {}
    return {
        "issues": [i for i in v.get("issues", []) if i.get("severity") in BLOCKING],
        "rejected_text": asset_text(asset.content or {}),
        "instruction": "Fix every listed issue. Locked facts must match exactly.",
    }


def campaign_scores(assets: list[Asset]) -> dict:
    """Accuracy percentages for the review screen (share of assets passing each check)."""
    if not assets:
        return {}
    keys = ("offer", "product", "date", "location", "claims", "meaning")
    out = {}
    for k in keys:
        ok = sum(1 for a in assets if (a.verification or {}).get("checks", {}).get(k, "pass") != "fail")
        out[f"{k}_accuracy"] = round(100 * ok / len(assets))
    out["unsupported_claims"] = sum(
        1 for a in assets for i in (a.verification or {}).get("issues", [])
        if i["type"] == "unsupported_claim" and i["severity"] in BLOCKING)
    return out
