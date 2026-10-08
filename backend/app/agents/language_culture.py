"""Agent 8: Language & Cultural Adaptation (Language Adapter + Culture Adapter + Meaning Validator)."""

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.agents.copy import AssetCopy
from app.graph.context import PipelineContext
from app.graph.state import CampaignBrain, language_name

WEIGHTS = {"naturalness": 0.25, "catchiness": 0.2, "cultural_fit": 0.2, "meaning_preservation": 0.25, "platform_fit": 0.1}
MIN_MEANING = 7.0


class CandidateScores(BaseModel):
    naturalness: float = Field(ge=0, le=10)
    catchiness: float = Field(ge=0, le=10)
    cultural_fit: float = Field(ge=0, le=10)
    meaning_preservation: float = Field(ge=0, le=10)
    platform_fit: float = Field(ge=0, le=10)


class Candidate(BaseModel):
    adaptation: AssetCopy
    scores: CandidateScores


class LocalizedVariant(BaseModel):
    label: str
    candidates: list[Candidate] = Field(min_length=1, max_length=3)
    back_translation: str
    cultural_notes: str


class LocalizationOutput(BaseModel):
    variants: list[LocalizedVariant]


def total_score(s: CandidateScores) -> float:
    return round(sum(getattr(s, k) * w for k, w in WEIGHTS.items()), 2)


def select_best(variant: LocalizedVariant) -> tuple[Candidate, float]:
    """Highest weighted score among candidates that preserve meaning; fall back to best meaning score."""
    safe = [c for c in variant.candidates if c.scores.meaning_preservation >= MIN_MEANING]
    pool = safe or sorted(variant.candidates, key=lambda c: -c.scores.meaning_preservation)[:1]
    best = max(pool, key=lambda c: total_score(c.scores))
    return best, total_score(best.scores)


def _payload(brain: CampaignBrain, platform: str, fmt: str, language: str,
             variants: list[tuple[str, AssetCopy]], feedback: dict | None) -> dict:
    payload = {
        "target_language": {"code": language, "name": language_name(language)},
        "code_switching": brain.strategy.code_switching,
        "code_switching_style": brain.strategy.code_switching_style,
        "platform": platform,
        "format": fmt,
        "offer_locked": brain.offer.model_dump(),
        "business_name": brain.business.name,
        "brand_voice": brain.business.brand_voice,
        "audience": brain.strategy.primary_audience,
        "locality": {"city": brain.locality.city, "area": brain.locality.area},
        "variants_to_adapt": [{"label": label, "original_english": copy.model_dump()} for label, copy in variants],
    }
    if feedback:
        payload["previous_attempt_failed_fact_check"] = feedback
    return payload


async def run(ctx: PipelineContext, platform: str, fmt: str, language: str,
              variants: list[tuple[str, AssetCopy]], feedback: dict | None = None) -> dict[str, dict]:
    """Returns {label: {"copy": AssetCopy, "score": float, "back_translation": str, "cultural_notes": str,
    "candidates": [...]}}."""
    brain = ctx.brain()
    out = await call_agent(ctx, "language_culture", LocalizationOutput,
                           _payload(brain, platform, fmt, language, variants, feedback), temperature=0.8)
    result = {}
    for v in out.variants:
        best, score = select_best(v)
        result[v.label] = {
            "copy": best.adaptation,
            "score": score,
            "back_translation": v.back_translation,
            "cultural_notes": v.cultural_notes,
            "candidates": [{"copy": c.adaptation.model_dump(), "scores": c.scores.model_dump(), "total": total_score(c.scores)}
                           for c in v.candidates],
        }
    missing = [label for label, _ in variants if label not in result]
    if missing:
        raise ValueError(f"localization returned no output for variants {missing}")
    return result

