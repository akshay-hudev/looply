"""Deterministic offer-fact checks: price, discount, dates and times must match the locked facts."""

import re
from dataclasses import asdict, dataclass

from app.graph.state import OfferFacts
from app.validators.localization_validator import normalize

PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
RUPEE_RE = re.compile(r"₹\s*(\d+(?:\.\d+)?)")
TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)", re.IGNORECASE)
DMY_RE = re.compile(r"(?<![₹\d.])\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b(?!\s*%)")
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
DAY_MONTH_RE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*", re.IGNORECASE)
MONTH_DAY_RE = re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b", re.IGNORECASE)


@dataclass
class Issue:
    type: str
    expected: str
    found: str
    severity: str = "high"
    source: str = "deterministic"

    def dict(self) -> dict:
        return asdict(self)


def _num(value: str | None) -> float | None:
    if not value:
        return None
    m = re.search(r"\d+(?:\.\d+)?", normalize(value))
    return float(m.group()) if m else None


def _percent(value: str | None) -> float | None:
    if not value:
        return None
    m = PERCENT_RE.search(normalize(value))
    return float(m.group(1)) if m else None


def allowed_amounts(offer: OfferFacts) -> set[float]:
    """Rupee amounts an asset may legitimately mention: price, discounted price, flat discount, any amount in restrictions."""
    amounts: set[float] = set()
    price = _num(offer.price) if offer.price and ("₹" in normalize(offer.price) or _percent(offer.price) is None) else None
    if price is not None:
        amounts.add(price)
    pct = _percent(offer.discount)
    if price is not None and pct is not None:
        discounted = price * (1 - pct / 100)
        amounts |= {round(discounted, 2), float(round(discounted)), float(int(discounted))}
    if offer.discount and pct is None:
        for m in RUPEE_RE.finditer(normalize(offer.discount)):
            flat = float(m.group(1))
            amounts.add(flat)
            if price is not None:
                amounts.add(price - flat)
    for text in [*offer.restrictions, offer.times or "", offer.duration_text or ""]:
        amounts |= {float(m.group(1)) for m in RUPEE_RE.finditer(normalize(text))}
    return amounts


def allowed_percents(offer: OfferFacts) -> set[float]:
    out = {p for p in (_percent(offer.discount),) if p is not None}
    for text in offer.restrictions:
        out |= {float(m.group(1)) for m in PERCENT_RE.finditer(normalize(text))}
    return out


def _times(text: str) -> set[tuple[int, int]]:
    out = set()
    for h, m, ampm in TIME_RE.findall(text):
        hour = int(h) % 12 + (12 if ampm.lower().startswith("p") else 0)
        out.add((hour, int(m or 0)))
    return out


def _dates(text: str) -> set[tuple[int, int]]:
    """(day, month) pairs mentioned explicitly."""
    out = set()
    for d, mon in DAY_MONTH_RE.findall(text):
        out.add((int(d), MONTHS[mon[:3].lower()]))
    for mon, d in MONTH_DAY_RE.findall(text):
        out.add((int(d), MONTHS[mon[:3].lower()]))
    for d, m, _ in DMY_RE.findall(text):
        day, month = int(d), int(m)
        if 1 <= day <= 31 and 1 <= month <= 12:
            out.add((day, month))
    return out


def check_offer(text: str, offer: OfferFacts) -> list[Issue]:
    issues: list[Issue] = []
    t = normalize(text)

    percents = allowed_percents(offer)
    for m in PERCENT_RE.finditer(t):
        value = float(m.group(1))
        if value == 100 and "100%" not in (offer.discount or ""):
            continue  # "100% fresh" style phrasing is a claim, handled by the claim validator
        if value not in percents:
            issues.append(Issue("discount_mismatch", offer.discount or "no percentage discount", m.group(0)))

    amounts = allowed_amounts(offer)
    for m in RUPEE_RE.finditer(t):
        value = float(m.group(1))
        if not any(abs(value - a) < 0.51 for a in amounts):
            issues.append(Issue("price_mismatch", offer.price or "no price given", m.group(0)))

    locked_times = _times(normalize(offer.times or ""))
    if locked_times:
        for tm in _times(t) - locked_times:
            issues.append(Issue("time_mismatch", offer.times or "", f"{tm[0]:02d}:{tm[1]:02d}"))

    locked_dates = _dates(normalize(" ".join(filter(None, [offer.start_date, offer.end_date, offer.duration_text]))))
    if locked_dates:
        lo, hi = min(locked_dates, key=lambda x: (x[1], x[0])), max(locked_dates, key=lambda x: (x[1], x[0]))
        for d in _dates(t):
            if not ((lo[1], lo[0]) <= (d[1], d[0]) <= (hi[1], hi[0])):
                issues.append(Issue("date_mismatch", f"{offer.start_date or ''} - {offer.end_date or ''}".strip(" -"),
                                    f"{d[0]}/{d[1]}"))
    return issues


def missing_facts(text: str, offer: OfferFacts) -> list[Issue]:
    """Warn (low severity, does not block) when the discount is absent from an asset entirely."""
    t = normalize(text)
    issues = []
    pct = _percent(offer.discount)
    if pct is not None and not any(float(m.group(1)) == pct for m in PERCENT_RE.finditer(t)):
        issues.append(Issue("missing_fact", offer.discount or "", "discount not mentioned", severity="low"))
    return issues
