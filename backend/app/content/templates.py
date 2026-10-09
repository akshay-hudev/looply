"""Picks stored content templates for a campaign and stamps one on each variant."""

from functools import lru_cache
from pathlib import Path

import yaml

from app.graph.state import CampaignBrain

_PATH = Path(__file__).resolve().parents[1] / "prompts" / "templates.yaml"
_LABELS = ("A", "B", "C")


@lru_cache
def load_catalog() -> dict:
    return yaml.safe_load(_PATH.read_text(encoding="utf-8"))


def signals(brain: CampaignBrain) -> set[str]:
    """What this brief is actually for, so a template is chosen for that job."""
    brief = brain.brief.filled()
    found = set()
    if brain.offer.discount or brain.offer.price or brief.get("offer"):
        found.add("offer")
    if brain.offer.start_date or brain.offer.duration_text or brief.get("event_date") or brief.get("occasion"):
        found.add("event")
    goal = f"{brain.objective or ''} {brief.get('goal') or ''}".lower()
    if any(word in goal for word in ("aware", "know", "exist", "visibility")):
        found.add("awareness")
    if any(word in goal for word in ("visit", "walk", "order", "enquir", "book")):
        found.add("visit")
    return found or {"awareness"}


def family_templates(fmt: str) -> list[dict]:
    families = load_catalog().get("families") or {}
    family = families.get(fmt) or families.get("post")
    return list(family.get("templates") or [])


def choose(brain: CampaignBrain, fmt: str) -> list[dict]:
    """Three templates, labeled A, B and C. The closest use comes first, then the rest."""
    wanted = signals(brain)
    ranked = sorted(family_templates(fmt), key=lambda item: (-len(wanted & set(item.get("when") or [])), item["id"]))
    if len(ranked) < 3:
        ranked = ranked + family_templates("post")
    picked = []
    seen = set()
    for item in ranked:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        picked.append(item)
        if len(picked) == 3:
            break
    family = (load_catalog().get("families") or {}).get(fmt) or {}
    out = []
    for label, item in zip(_LABELS, picked):
        out.append({
            "label": label,
            "id": item["id"],
            "name": item["name"],
            "use": item["use"],
            "aspect": family.get("aspect"),
            "layout": family.get("layout"),
            "beats": item.get("beats") or [],
        })
    return out


def for_variant(brain: CampaignBrain, fmt: str, label: str) -> dict:
    chosen = choose(brain, fmt)
    return next((item for item in chosen if item["label"] == label), chosen[0])


def stamp(brain: CampaignBrain, fmt: str, label: str) -> dict:
    """The fields saved on the asset. Sample lines stay in the prompt, not on the card."""
    item = for_variant(brain, fmt, label)
    return {"id": item["id"], "name": item["name"], "use": item["use"], "aspect": item["aspect"]}
