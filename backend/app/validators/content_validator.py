"""Platform format constraints (lengths, hashtag counts, WhatsApp template rules)."""

import re

from app.validators.offer_validator import Issue

LIMITS = {
    ("instagram", "post"): {"body": 2200, "hashtags": 30},
    ("instagram", "reel"): {"body": 2200, "hashtags": 30},
    ("instagram", "carousel"): {"body": 2200, "hashtags": 30},
    ("instagram", "story"): {"headline": 120},
    ("instagram", "poster"): {"headline": 120},
    ("whatsapp", "message"): {"body": 1024, "hashtags": 0},
    ("whatsapp", "offer_card"): {"headline": 80},
    ("linkedin", "post"): {"body": 3000, "hashtags": 5},
    ("facebook", "post"): {"body": 5000, "hashtags": 10},
}

URL_SHORTENERS = re.compile(r"\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd)/", re.IGNORECASE)


def check_format(platform: str, fmt: str, content: dict) -> list[Issue]:
    issues = []
    limits = LIMITS.get((platform, fmt), {})
    for field in ("headline", "body"):
        limit = limits.get(field)
        value = content.get(field) or ""
        if limit and len(value) > limit:
            issues.append(Issue("format_violation", f"{field} <= {limit} chars", f"{len(value)} chars", severity="medium"))
    max_tags = limits.get("hashtags")
    tags = content.get("hashtags") or []
    if max_tags is not None and len(tags) > max_tags:
        issues.append(Issue("format_violation", f"<= {max_tags} hashtags", f"{len(tags)} hashtags", severity="low"))
    if platform == "whatsapp" and fmt == "message":
        body = content.get("body") or ""
        if URL_SHORTENERS.search(body):
            issues.append(Issue("format_violation", "no URL shorteners in WhatsApp templates", "URL shortener",
                                severity="medium"))
        if len(re.findall(r"\{\{\d+\}\}", body)) > 1:
            issues.append(Issue("format_violation", "at most one {{1}} placeholder", "multiple placeholders",
                                severity="medium"))
    return issues
