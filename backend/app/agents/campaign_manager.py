"""Agent 1: Campaign Manager. Extracts campaign facts, detects missing info, handles owner changes."""

import re

from pydantic import BaseModel, Field

from app.agents.base import call_agent
from app.graph.context import PipelineContext
from app.graph.state import FORMAT_CATALOG, CampaignBrain, OfferFacts


class ExtractedLocation(BaseModel):
    city: str | None = None
    area: str | None = None
    address: str | None = None


class Extraction(BaseModel):
    summary: str = Field(description="One-sentence summary of what the owner wants")
    input_language: str | None = Field(None, description="ISO 639-1 code of the owner's message language")
    business_name: str | None = None
    business_category: str | None = None
    location: ExtractedLocation = Field(default_factory=ExtractedLocation)
    objective: str | None = Field(None, description="Campaign goal, e.g. 'Increase student visits'")
    target_audience: str | None = None
    offer: OfferFacts = Field(default_factory=OfferFacts)
    platforms_requested: list[str] = Field(default_factory=list)
    formats_requested: dict[str, list[str]] = Field(default_factory=dict)
    languages_requested: list[str] = Field(default_factory=list, description="ISO 639-1 codes")
    is_change_request: bool = False
    missing_info: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)


def infer_product(text: str) -> str | None:
    """A specific thing being promoted, when the owner named one."""
    if re.search(r"secret menu", text, re.I):
        return "Secret menu"
    if re.search(r"continent\w*", text, re.I):
        return "Continental menu"
    if m := re.search(r"(?:new|our|the)\s+([a-z]+(?:\s[a-z]+)?)\s+(?:for|at|is)\b", text, re.I):
        return m.group(1).title()
    return None


def apply_owner_inferences(brain: CampaignBrain, text: str, business_name: str | None) -> None:
    """Fill facts the owner already stated, so a follow-up answer does not loop on the same question."""
    if not brain.offer.product:
        brain.offer.product = infer_product(text)
        if not brain.offer.product and re.search(r"\b(cafe|café|restaurant|menu|food)\b", text, re.I):
            brain.offer.product = business_name or "the restaurant"
    if not brain.objective and re.search(
        r"popular|awareness|reach more|more people|people can see|visibility|famous|footfall", text, re.I
    ):
        brain.objective = "Increase awareness and visits"


def deterministic_missing(brain: CampaignBrain, has_location: bool) -> list[str]:
    missing = []
    if not brain.offer.product and not brain.business.products:
        missing.append("product")
    if not brain.objective:
        missing.append("objective")
    if not has_location and not brain.offer.location:
        missing.append("location")
    return missing


def _clean_formats(formats: dict[str, list[str]]) -> dict[str, list[str]]:
    out = {}
    for platform, fmts in formats.items():
        allowed = FORMAT_CATALOG.get(platform.lower())
        if allowed:
            valid = [f for f in fmts if f in allowed]
            if valid:
                out[platform.lower()] = valid
    return out


def merge_extraction(brain: CampaignBrain, ex: Extraction) -> CampaignBrain:
    """Merge new facts into the brain. Only non-null extracted values overwrite existing ones."""
    b = brain.model_copy(deep=True)
    if ex.input_language:
        b.input_language = ex.input_language
    if ex.business_name:
        b.business.name = ex.business_name
    if ex.business_category:
        b.business.category = ex.business_category
    if ex.objective:
        b.objective = ex.objective
    if ex.target_audience:
        b.target_audience_hint = ex.target_audience
    for field, value in ex.offer.model_dump().items():
        if value not in (None, [], ""):
            setattr(b.offer, field, value)
    if ex.location.city:
        b.locality.city = ex.location.city
    if ex.location.area:
        b.locality.area = ex.location.area
    # Selections made explicitly in the form (Mode B) win over ones inferred from free text.
    if ex.platforms_requested and not b.requested_formats:
        b.requested_platforms = [p.lower() for p in ex.platforms_requested if p.lower() in FORMAT_CATALOG]
    if ex.formats_requested and not b.requested_formats:
        b.requested_formats = _clean_formats(ex.formats_requested)
    if ex.languages_requested and not b.requested_languages:
        b.requested_languages = [code.lower() for code in ex.languages_requested]
    return b


async def run(ctx: PipelineContext, message: str) -> tuple[CampaignBrain, Extraction]:
    brain = ctx.brain()
    biz = ctx.business
    payload = {
        "owner_message": "\n".join([*brain.raw_inputs, message]),
        "existing_campaign": {
            "business": brain.business.model_dump(),
            "objective": brain.objective,
            "offer": brain.offer.model_dump(),
            "target_audience": brain.target_audience_hint,
        },
        "business_record": {"name": biz.name, "category": biz.category, "city": biz.city, "address": biz.address},
        "allowed_platforms_and_formats": FORMAT_CATALOG,
    }
    ex = await call_agent(ctx, "campaign_manager", Extraction, payload, temperature=0.1)
    merged = merge_extraction(brain, ex)
    merged.raw_inputs = [*brain.raw_inputs, message]
    apply_owner_inferences(merged, "\n".join(merged.raw_inputs), biz.name)
    if not merged.business.name:
        merged.business.name = biz.name
    if not merged.locality.city:
        merged.locality.city = biz.city
    # Dry input is not a blocker: promote the business itself and default to awareness.
    if not merged.offer.product and not merged.business.products:
        merged.offer.product = merged.brief.product or biz.name
    if not merged.objective:
        merged.objective = merged.brief.goal or "Increase awareness and visits"
    if not merged.target_audience_hint and merged.brief.audience:
        merged.target_audience_hint = merged.brief.audience
    merged.missing_info = sorted(set(deterministic_missing(merged, bool(biz.city or biz.address or merged.locality.city))))
    merged.clarifying_questions = ex.clarifying_questions[:3] if merged.missing_info else []
    if merged.missing_info and not merged.clarifying_questions:
        merged.clarifying_questions = [f"Could you tell me the {m.replace('_', ' ')} for this campaign?" for m in merged.missing_info]
    return merged, ex
