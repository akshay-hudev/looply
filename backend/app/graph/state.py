"""Campaign Brain: the single structured state every agent reads from and writes to."""

from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["instagram", "whatsapp", "linkedin", "facebook", "youtube", "x"]

# platform -> format -> asset kind. Content Director and Strategy may only pick from here.
FORMAT_CATALOG: dict[str, dict[str, str]] = {
    "instagram": {"post": "image", "story": "image", "reel": "video", "carousel": "image", "poster": "image"},
    "whatsapp": {"message": "text", "offer_card": "image"},
    "linkedin": {"post": "text"},
    "facebook": {"post": "image"},
    "youtube": {"post": "image", "short": "video"},
    "x": {"post": "image"},
}

LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "kn": "Kannada", "ta": "Tamil", "te": "Telugu", "mr": "Marathi",
    "bn": "Bengali", "ml": "Malayalam", "gu": "Gujarati", "pa": "Punjabi", "ur": "Urdu", "or": "Odia",
    "as": "Assamese", "es": "Spanish", "fr": "French", "ar": "Arabic", "de": "German", "pt": "Portuguese",
    "id": "Indonesian", "zh": "Chinese", "ja": "Japanese",
}


def language_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code, code)


class BusinessProfile(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    products: list[str] = Field(default_factory=list)
    personality: list[str] = Field(default_factory=list)
    brand_voice: str | None = None
    preferred_languages: list[str] = Field(default_factory=list)
    supported_claims: list[str] = Field(default_factory=list)


class OfferFacts(BaseModel):
    """LOCKED facts. Generators must reproduce these exactly; the Truth Engine enforces it."""

    product: str | None = None
    price: str | None = None  # as the owner wrote it, e.g. "₹149"
    discount: str | None = None  # e.g. "20%" or "₹30 off" or "Buy 1 Get 1"
    start_date: str | None = None
    end_date: str | None = None
    duration_text: str | None = None  # e.g. "this weekend"
    times: str | None = None
    location: str | None = None
    restrictions: list[str] = Field(default_factory=list)


class LocalitySignal(BaseModel):
    type: str  # college | school | office | residential | shopping | transit | cafe | hospital | ...
    count: int = 0
    examples: list[str] = Field(default_factory=list)
    nearest_m: int | None = None
    source: str = ""


class LocalityInsight(BaseModel):
    signal: str
    interpretation: str
    relevance: Literal["high", "medium", "low"] = "medium"


class LocalityContext(BaseModel):
    city: str | None = None
    area: str | None = None
    lat: float | None = None
    lng: float | None = None
    radius_m: int | None = None
    data_source: str | None = None
    verified: bool = False
    signals: list[LocalitySignal] = Field(default_factory=list)
    language_signals: list[dict] = Field(default_factory=list)  # [{language, reason, source}]
    insights: list[LocalityInsight] = Field(default_factory=list)
    summary: str | None = None


class AudienceSegment(BaseModel):
    name: str
    priority: Literal["primary", "secondary"] = "secondary"
    motivation: str = ""
    tone: str = ""
    platforms: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    formats: list[str] = Field(default_factory=list)


class PostingSlot(BaseModel):
    platform: str
    day: str
    time: str
    reason: str = ""


class Strategy(BaseModel):
    objective: str = ""
    primary_audience: str = ""
    secondary_audiences: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    formats: dict[str, list[str]] = Field(default_factory=dict)
    languages: list[str] = Field(default_factory=list)
    code_switching: bool = False
    code_switching_style: str | None = None
    tone: str = ""
    posting_schedule: list[PostingSlot] = Field(default_factory=list)
    rationale: str = ""
    accepted: bool = False


class CoreMessage(BaseModel):
    headline: str = ""
    key_message: str = ""
    value_props: list[str] = Field(default_factory=list)
    must_include: list[str] = Field(default_factory=list)
    cta_options: list[str] = Field(default_factory=list)


class CreativeBrief(BaseModel):
    platform: str
    format: str
    angle: str = ""
    hook_direction: str = ""
    visual_direction: str = ""
    key_points: list[str] = Field(default_factory=list)
    template_id: str = ""


class OwnerFile(BaseModel):
    """A file the owner attached to the brief: logo, sample poster, note, or voice recording."""

    url: str = Field(max_length=500)
    filename: str = Field(max_length=200)
    kind: Literal["image", "text", "audio", "file"]
    role: Literal["logo", "sample", "note", "voice", "file"] = "file"
    text: str | None = Field(default=None, max_length=8000)


class CampaignBrief(BaseModel):
    """What the owner told us in the step-by-step form. Any field may be empty."""

    product: str | None = None
    audience: str | None = None
    region: str | None = None
    goal: str | None = None
    offer: str | None = None
    occasion: str | None = None
    event_date: str | None = None
    tone: str | None = None
    highlights: str | None = None

    def filled(self) -> dict[str, str]:
        return {k: v for k, v in self.model_dump().items() if v and str(v).strip()}


class Approval(BaseModel):
    status: Literal["pending", "approved", "rejected"] = "pending"
    by: str | None = None
    at: str | None = None
    note: str | None = None


class CampaignBrain(BaseModel):
    version: int = 1
    raw_inputs: list[str] = Field(default_factory=list)
    brief: CampaignBrief = Field(default_factory=CampaignBrief)
    files: list[OwnerFile] = Field(default_factory=list)
    input_language: str | None = None
    business: BusinessProfile = Field(default_factory=BusinessProfile)
    objective: str | None = None
    target_audience_hint: str | None = None
    offer: OfferFacts = Field(default_factory=OfferFacts)
    locality: LocalityContext = Field(default_factory=LocalityContext)
    audiences: list[AudienceSegment] = Field(default_factory=list)
    strategy: Strategy = Field(default_factory=Strategy)
    content_mode: Literal["ai", "user"] = "ai"
    requested_platforms: list[str] = Field(default_factory=list)
    requested_formats: dict[str, list[str]] = Field(default_factory=dict)
    requested_languages: list[str] = Field(default_factory=list)
    core_message: CoreMessage = Field(default_factory=CoreMessage)
    briefs: list[CreativeBrief] = Field(default_factory=list)
    missing_info: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)
    approval: Approval = Field(default_factory=Approval)
    escalations: list[dict] = Field(default_factory=list)


# Fact keys used by the dependency graph. Every generated asset depends on the facts it carries.
FACT_KEYS = (
    "offer.product", "offer.price", "offer.discount", "offer.dates", "offer.times", "offer.location",
    "offer.restrictions", "business.name", "business.brand_voice", "strategy.tone", "strategy.languages",
)


def fact_values(brain: CampaignBrain) -> dict[str, object]:
    o = brain.offer
    return {
        "offer.product": o.product,
        "offer.price": o.price,
        "offer.discount": o.discount,
        "offer.dates": [o.start_date, o.end_date, o.duration_text],
        "offer.times": o.times,
        "offer.location": o.location,
        "offer.restrictions": list(o.restrictions),
        "business.name": brain.business.name,
        "business.brand_voice": brain.business.brand_voice,
        "strategy.tone": brain.strategy.tone,
        "strategy.languages": sorted(brain.strategy.languages),
    }


def changed_facts(old: CampaignBrain, new: CampaignBrain) -> list[str]:
    a, b = fact_values(old), fact_values(new)
    return [k for k in FACT_KEYS if a[k] != b[k]]


def asset_fact_keys(brain: CampaignBrain) -> list[str]:
    """Fact keys a content asset depends on (only facts that are actually set)."""
    values = fact_values(brain)
    keys = [k for k in FACT_KEYS if k != "strategy.languages" and values[k] not in (None, [], [None, None, None])]
    return keys
