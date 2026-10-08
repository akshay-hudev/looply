"""Flags superlative / unverifiable claims the business never backed."""

import re

from app.validators.localization_validator import normalize
from app.validators.offer_validator import Issue

CLAIM_PATTERNS = [
    r"\bbest\b", r"#\s?1\b", r"\bnumber\s?one\b", r"\bno\.?\s?1\b", r"\bcheapest\b", r"\blowest price\b",
    r"\bguarantee[d]?\b", r"\b100%\s+(?:fresh|pure|natural|organic|authentic|satisfaction)", r"\bworld[- ]class\b",
    r"\bunbeatable\b", r"\bfamous\b", r"\baward[- ]winning\b", r"\bmost popular\b", r"\btop[- ]rated\b",
    r"\bonly .{0,20} in (?:town|the city)\b",
    "सबसे अच्छा", "सबसे सस्ता", "नंबर 1", "गारंटी",
    "ಅತ್ಯುತ್ತಮ", "ಅತಿ ಕಡಿಮೆ ಬೆಲೆ", "ನಂಬರ್ 1",
    "சிறந்த", "மலிவான", "ఉత్తమ", "చౌకైన", "ഏറ്റവും മികച്ച", "সেরা", "શ્રેષ્ઠ", "सर्वोत्तम",
]
_COMPILED = [re.compile(p, re.IGNORECASE) for p in CLAIM_PATTERNS]


def check_claims(text: str, supported_claims: list[str]) -> list[Issue]:
    t = normalize(text)
    supported = " ".join(supported_claims).lower()
    issues = []
    for pattern in _COMPILED:
        for m in pattern.finditer(t):
            phrase = m.group(0)
            if phrase.lower() in supported:
                continue
            issues.append(Issue("unsupported_claim", "no supporting evidence provided by the business", phrase,
                                severity="high"))
    return issues
