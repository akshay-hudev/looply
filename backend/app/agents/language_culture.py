"""Agent 8: Language & Cultural Adaptation (Meaning-First Copywriter + Cultural Adapter + Quality Evaluator)."""

import re
from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.agents.copy import AssetCopy
from app.graph.context import PipelineContext
from app.graph.state import CampaignBrain, language_name

# Default scoring weights: Naturalness 30%, Meaning Preservation 25%, Cultural Fit 20%, Platform Fit 15%, Catchiness 10%
WEIGHTS = {
    "naturalness": 0.30,
    "meaning_preservation": 0.25,
    "cultural_fit": 0.20,
    "platform_fit": 0.15,
    "catchiness": 0.10,
}

MIN_MEANING_THRESHOLD = 7.0
MIN_NATURALNESS_THRESHOLD = 7.0


class CandidateScores(BaseModel):
    naturalness: float = Field(ge=0, le=100, description="Native fluency and phrasing (30% weight)")
    meaning_preservation: float = Field(ge=0, le=100, description="Preservation of core intent & offer facts (25% weight)")
    cultural_fit: float = Field(ge=0, le=100, description="Local relevance without clichés (20% weight)")
    platform_fit: float = Field(ge=0, le=100, description="Appropriateness for platform/format (15% weight)")
    catchiness: float = Field(ge=0, le=100, description="Marketing punch & engagement (10% weight)")


class Candidate(BaseModel):
    adaptation: AssetCopy
    scores: CandidateScores
    adaptation_strategy: str = Field(default="Natural cultural adaptation preserving core intent.")


class LocalizedVariant(BaseModel):
    label: str
    candidates: list[Candidate] = Field(min_length=1, max_length=3)
    back_translation: str
    cultural_notes: str


class LocalizationOutput(BaseModel):
    variants: list[LocalizedVariant]


def _normalize_score(val: float) -> float:
    """If score is on 0-100 scale, normalize to 0-10 for unified threshold comparison."""
    return val / 10.0 if val > 10.0 else val


def total_score(s: CandidateScores) -> float:
    """Calculates weighted total score using the 30/25/20/15/10 weight scheme."""
    norm = {
        "naturalness": _normalize_score(s.naturalness),
        "meaning_preservation": _normalize_score(s.meaning_preservation),
        "cultural_fit": _normalize_score(s.cultural_fit),
        "platform_fit": _normalize_score(s.platform_fit),
        "catchiness": _normalize_score(s.catchiness),
    }
    weighted = sum(norm[k] * w for k, w in WEIGHTS.items())
    return round(weighted, 2)


def validate_candidate(candidate: Candidate, offer_locked: dict | None = None,
                       source_copy: AssetCopy | None = None) -> tuple[bool, list[str]]:
    """Quality check: validates naturalness, meaning preservation, score thresholds, and CTAs."""
    reasons = []
    meaning = _normalize_score(candidate.scores.meaning_preservation)
    naturalness = _normalize_score(candidate.scores.naturalness)

    if meaning < MIN_MEANING_THRESHOLD:
        reasons.append(f"meaning_preservation score ({meaning:.1f}) is below minimum threshold ({MIN_MEANING_THRESHOLD})")

    if naturalness < MIN_NATURALNESS_THRESHOLD:
        reasons.append(f"naturalness score ({naturalness:.1f}) is below minimum threshold ({MIN_NATURALNESS_THRESHOLD})")

    # Check CTA presence if source copy had a CTA
    if source_copy and source_copy.cta and source_copy.cta.strip():
        if not candidate.adaptation.cta or not candidate.adaptation.cta.strip():
            reasons.append("call-to-action (CTA) is missing in target adaptation")

    return (len(reasons) == 0, reasons)


def select_best(variant: LocalizedVariant, offer_locked: dict | None = None,
                source_copy: AssetCopy | None = None) -> tuple[Candidate, float, bool, list[str]]:
    """Selects highest weighted score among valid candidates; falls back to best meaning preservation."""
    valid_candidates = []
    all_reasons = []

    for c in variant.candidates:
        is_ok, reasons = validate_candidate(c, offer_locked, source_copy)
        if is_ok:
            valid_candidates.append(c)
        else:
            all_reasons.extend(reasons)

    if valid_candidates:
        best = max(valid_candidates, key=lambda c: total_score(c.scores))
        return best, total_score(best.scores), True, []
    
    # Fallback to candidate with highest meaning preservation score
    best_fallback = max(variant.candidates, key=lambda c: _normalize_score(c.scores.meaning_preservation))
    return best_fallback, total_score(best_fallback.scores), False, all_reasons


def _payload(brain: CampaignBrain, platform: str, fmt: str, language: str,
             variants: list[tuple[str, AssetCopy]], feedback: dict | None = None) -> dict:
    payload = {
        "target_language": {"code": language, "name": language_name(language)},
        "target_locale": brain.locality.city or brain.locality.area or "General",
        "code_switching": brain.strategy.code_switching,
        "code_switching_style": brain.strategy.code_switching_style,
        "platform": platform,
        "format": fmt,
        "tone": brain.business.brand_voice or "Engaging & Friendly",
        "audience": brain.strategy.primary_audience or "General Audience",
        "offer_locked": brain.offer.model_dump(),
        "business_name": brain.business.name,
        "brand_voice": brain.business.brand_voice,
        "locality": {"city": brain.locality.city, "area": brain.locality.area},
        "variants_to_adapt": [{"label": label, "original_english": copy.model_dump()} for label, copy in variants],
    }
    if feedback:
        payload["previous_attempt_failed_quality_check"] = feedback
    return payload


async def run(ctx: PipelineContext, platform: str, fmt: str, language: str,
              variants: list[tuple[str, AssetCopy]], feedback: dict | None = None) -> dict[str, dict]:
    """Runs language and cultural adaptation pipeline with quality validation and up to 2 retries."""
    brain = ctx.brain()
    offer_locked = brain.offer.model_dump()
    source_map = {label: copy for label, copy in variants}
    
    current_feedback = feedback or {}
    max_retries = 2
    attempt = 0

    while True:
        attempt += 1
        payload = _payload(brain, platform, fmt, language, variants, current_feedback)
        out = await call_agent(ctx, "language_culture", LocalizationOutput, payload, temperature=0.8)

        result = {}
        failed_variants = {}

        for v in out.variants:
            source_copy = source_map.get(v.label)
            best, score, is_valid, reasons = select_best(v, offer_locked, source_copy)

            if not is_valid and attempt <= max_retries:
                failed_variants[v.label] = reasons

            cultural_notes = v.cultural_notes
            if not is_valid and attempt > max_retries:
                cultural_notes += f" (Note: Quality warnings detected: {'; '.join(reasons)})"

            result[v.label] = {
                "copy": best.adaptation,
                "score": score,
                "back_translation": v.back_translation,
                "cultural_notes": cultural_notes,
                "candidates": [
                    {
                        "copy": c.adaptation.model_dump(),
                        "scores": c.scores.model_dump(),
                        "total": total_score(c.scores),
                        "strategy": getattr(c, "adaptation_strategy", "Adapted for local culture"),
                    }
                    for c in v.candidates
                ],
            }

        # If any variants failed validation and we have remaining retries, retry with feedback
        if failed_variants and attempt <= max_retries:
            current_feedback = {
                "attempt": attempt,
                "reasons": failed_variants,
                "instruction": "Regenerate adaptations avoiding unnatural phrasing, preserving exact prices/discounts, and including CTAs."
            }
            ctx.emit("language_culture_agent", "retry", f"Quality check failed on attempt {attempt}. Retrying with feedback.")
            continue

        missing = [label for label, _ in variants if label not in result]
        if missing:
            raise ValueError(f"localization returned no output for variants {missing}")

        return result
