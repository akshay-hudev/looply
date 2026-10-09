"""Turn one spoken campaign into the form blanks. Copy what was said. Leave the rest empty."""

import re
from datetime import date, timedelta

from pydantic import BaseModel, Field

_LANGUAGES = {
    "english": "en", "kannada": "kn", "kanglish": "kn_en", "hindi": "hi", "hinglish": "hi_en",
    "tamil": "ta", "tanglish": "ta_en", "telugu": "te", "marathi": "mr", "bengali": "bn",
    "malayalam": "ml", "gujarati": "gu", "punjabi": "pa", "urdu": "ur",
}
_PLATFORMS = ("instagram", "whatsapp", "facebook", "linkedin", "youtube")
_FORMATS = {
    "youtube shorts": ("youtube", "short"),
    "youtube short": ("youtube", "short"),
    "youtube post": ("youtube", "post"),
    "offer card": ("whatsapp", "offer_card"),
    "feed post": ("instagram", "post"),
    "story card": ("instagram", "story"),
    "stories": ("instagram", "story"),
    "story": ("instagram", "story"),
    "reels": ("instagram", "reel"),
    "reel": ("instagram", "reel"),
    "carousel": ("instagram", "carousel"),
    "poster": ("instagram", "poster"),
    "post": ("instagram", "post"),
}
_AUDIENCES = (
    "college students", "young professionals", "working professionals", "working women",
    "families with kids", "families", "couples", "brides and bridesmaids", "brides",
    "food lovers", "foodies",
)
_GOALS = (
    "more walk-in visits", "walk-in visits", "walk ins", "more orders", "more enquiries",
    "make people aware", "brand loyalty", "fill the weekend",
)
_TONES = (
    "fun and youthful", "fun & youthful", "warm and friendly", "warm & friendly",
    "premium and elegant", "bold and energetic", "calm and trustworthy", "witty and quirky",
    "fun", "youthful", "warm", "premium",
)
_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9,
    "sept": 9, "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_WEEKDAYS = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
_OFFER_RE = re.compile(
    r"\bbuy\s+\d+\s+get\s+\d+(?:\s+free)?\b"
    r"|\b\d+\s*%\s*off\b(?:\s+(?:for|above|on|over|below|under)\s+(?:₹\s*|rs\.?\s*|inr\s*)?\d+|\s+(?!or\b|and\b)\w+){0,4}"
    r"|₹\s*\d[\d,]*(?:\.\d+)?"
    r"|\b(?:rs\.?|inr)\s*\d[\d,]*"
    r"|\b\d[\d,]*\s*rupees?\b"
    r"|\bunlimited\s+refills?\b",
    re.IGNORECASE,
)
_MONTH_ALT = "|".join(sorted(_MONTHS, key=len, reverse=True))
_CALENDAR_RE = re.compile(
    rf"\b(\d{{4}})-(\d{{2}})-(\d{{2}})\b"
    rf"|\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\b"
    rf"|\b({_MONTH_ALT})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b",
    re.IGNORECASE,
)
_RELATIVE_RE = re.compile(
    r"\b(?:this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b"
    r"|\b(?:today|tomorrow|tonight)\b",
    re.IGNORECASE,
)
_REGION_RE = re.compile(r"\bin\s+([A-Za-z][\w'.-]*(?:\s+[A-Za-z][\w'.-]*){0,3})", re.IGNORECASE)
_FILLER_RE = re.compile(
    r"\b(?:please|promote|promoting|promotion|called|our|the|a|an|we|want|i|need|just|and|for|on|with|to)\b",
    re.IGNORECASE,
)


class DateChoice(BaseModel):
    label: str
    event_date: str | None = None
    occasion: str | None = None


class SpeechBrief(BaseModel):
    transcript: str
    product: str | None = None
    offer: str | None = None
    offer_options: list[str] = Field(default_factory=list)
    audience: str | None = None
    goal: str | None = None
    occasion: str | None = None
    event_date: str | None = None
    date_options: list[DateChoice] = Field(default_factory=list)
    tone: str | None = None
    highlights: str | None = None
    region: str | None = None
    shop_region: str | None = None
    region_clash: bool = False
    languages: list[str] = Field(default_factory=lambda: ["en"])
    formats: dict[str, list[str]] = Field(default_factory=dict)
    platforms_without_formats: list[str] = Field(default_factory=list)
    unplaced: str | None = None


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _same_place(spoken: str, shop: str) -> bool:
    a, b = _norm(spoken), _norm(shop)
    if not a or not b:
        return False
    return a in b or b in a


def _weekday(name: str, today: date, nxt: bool) -> date:
    target = _WEEKDAYS[name]
    delta = (target - today.weekday()) % 7
    if nxt and delta == 0:
        delta = 7
    return today + timedelta(days=delta)


def _calendar(match: re.Match[str], today: date) -> date | None:
    if match.group(1):
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            return None
    if match.group(4) and match.group(5):
        month = _MONTHS.get(match.group(5).lower())
        day = int(match.group(4))
    elif match.group(6) and match.group(7):
        month = _MONTHS.get(match.group(6).lower())
        day = int(match.group(7))
    else:
        return None
    if not month or not 1 <= day <= 31:
        return None
    try:
        return date(today.year, month, day)
    except ValueError:
        return None


def _take(pattern: re.Pattern[str], text: str) -> tuple[str, list[str]]:
    found = [m.group(0).strip(" ,.;") for m in pattern.finditer(text)]
    found = [piece for piece in found if piece]
    return pattern.sub(" ", text), found


def _take_phrases(phrases: tuple[str, ...] | dict, text: str) -> tuple[str, list[str]]:
    keys = list(phrases) if not isinstance(phrases, dict) else sorted(phrases, key=len, reverse=True)
    found: list[str] = []
    for phrase in keys:
        match = re.search(rf"\b{re.escape(phrase)}\b", text, re.IGNORECASE)
        if not match:
            continue
        found.append(match.group(0).strip())
        text = text[:match.start()] + " " + text[match.end():]
    return text, found


def parse_speech(transcript: str, shop_region: str | None = None, *, today: date | None = None) -> SpeechBrief:
    """Read one utterance. A fact is filled only when the words are in the utterance."""
    today = today or date.today()
    original = " ".join(transcript.split())
    text = original
    out = SpeechBrief(transcript=original, shop_region=shop_region or None)

    text, offers = _take(_OFFER_RE, text)
    offers = list(dict.fromkeys(offers))
    if len(offers) > 1:
        out.offer_options = offers
    elif offers:
        out.offer = offers[0]

    calendars: list[tuple[str, date]] = []
    while True:
        match = _CALENDAR_RE.search(text)
        if match is None:
            break
        resolved = _calendar(match, today)
        if resolved is None:
            text = text[:match.start()] + " " + text[match.end():]
            continue
        calendars.append((match.group(0).strip(), resolved))
        text = text[:match.start()] + " " + text[match.end():]

    relatives: list[tuple[str, date | None]] = []
    while True:
        match = _RELATIVE_RE.search(text)
        if match is None:
            break
        raw = match.group(0).strip()
        low = raw.lower()
        if low in ("today", "tonight"):
            resolved: date | None = today
        elif low == "tomorrow":
            resolved = today + timedelta(days=1)
        else:
            nxt = low.startswith("next")
            name = low.split()[-1]
            resolved = None if name == "weekend" else _weekday(name, today, nxt)
        relatives.append((raw, resolved))
        text = text[:match.start()] + " " + text[match.end():]

    dated = [(label, day.isoformat(), label) for label, day in calendars]
    soft = [(label, day.isoformat() if day else None, label) for label, day in relatives]
    if dated and soft:
        soft_days = {day for _, day in relatives if day}
        cal_days = {day for _, day in calendars}
        if soft_days and cal_days and soft_days.isdisjoint(cal_days):
            out.date_options = [
                DateChoice(label=label, event_date=iso, occasion=label) for label, iso, _ in dated
            ] + [
                DateChoice(label=label, event_date=None, occasion=label) for label, _, _ in soft
            ]
        else:
            out.event_date = dated[0][1]
            out.occasion = soft[0][0]
    elif dated:
        out.event_date = dated[0][1]
        out.occasion = dated[0][0]
    elif soft:
        out.occasion = soft[0][0]

    exclusive = False
    languages: list[str] = []
    for word, code in _LANGUAGES.items():
        match = re.search(rf"\b{re.escape(word)}\b", text, re.IGNORECASE)
        if not match:
            continue
        window = text[max(0, match.start() - 8):match.end() + 8].lower()
        if "only" in window:
            exclusive = True
            languages = [code]
            text = text[:match.start()] + " " * (match.end() - match.start()) + text[match.end():]
            break
        languages.append(code)
        text = text[:match.start()] + " " * (match.end() - match.start()) + text[match.end():]
    if exclusive:
        out.languages = languages
    elif languages:
        out.languages = list(dict.fromkeys(["en", *languages]))
    text = re.sub(r"\bonly\b", " ", text, flags=re.IGNORECASE)

    text, format_hits = _take_phrases(_FORMATS, text)
    formats: dict[str, list[str]] = {}
    for hit in format_hits:
        platform, fmt = _FORMATS[hit.lower()]
        formats.setdefault(platform, [])
        if fmt not in formats[platform]:
            formats[platform].append(fmt)
    platforms = []
    for name in _PLATFORMS:
        match = re.search(rf"\b{name}\b", text, re.IGNORECASE)
        if not match:
            continue
        platforms.append(name)
        text = text[:match.start()] + " " + text[match.end():]
    out.formats = formats
    out.platforms_without_formats = [name for name in platforms if name not in formats]

    text, audiences = _take_phrases(_AUDIENCES, text)
    if audiences:
        out.audience = ", ".join(dict.fromkeys(audiences))
    text, goals = _take_phrases(_GOALS, text)
    if goals:
        out.goal = goals[0]
    text, tones = _take_phrases(_TONES, text)
    if tones:
        out.tone = tones[0]

    region_match = _REGION_RE.search(text)
    if region_match and _norm(region_match.group(1)) in {"and", "or", "the", "a", "an", "only"}:
        region_match = None
    if region_match:
        spoken = region_match.group(1).strip(" ,.;")
        text = text[:region_match.start()] + " " + text[region_match.end():]
        if shop_region and _same_place(spoken, shop_region):
            out.region = None
        elif shop_region:
            out.region = spoken
            out.region_clash = True
        else:
            out.region = spoken

    leftover = _FILLER_RE.sub(" ", text)
    clauses = [piece.strip(" ,.;") for piece in re.split(r"[,.]", leftover) if _norm(piece)]
    clauses = [piece for piece in clauses if _norm(piece) not in {"or", "and", "for", "on", "in", "the", "a", "an"}]
    if clauses:
        out.product = clauses[0]
        rest = ", ".join(clauses[1:])
        out.unplaced = rest or None
    return out
