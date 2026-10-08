"""Compose runtime system prompts from agency-agents personas + LocalMind task contracts + JSON schema."""

import json
import re
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel

PROMPTS_DIR = Path(__file__).parent
AGENCY_DIR = PROMPTS_DIR / "agency"
CONTRACTS_DIR = PROMPTS_DIR / "contracts"

_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF\uFE0F\u200D\u2300-\u23FF]"
)


def _normalize_heading(title: str) -> str:
    title = _EMOJI.sub("", title).lower()
    title = re.sub(r"[^a-z& ]+", " ", title)
    title = re.sub(r"^\s*your\s+", "", title.strip())
    return re.sub(r"\s+", " ", title).strip()


def parse_sections(markdown: str) -> dict[str, str]:
    """Split a persona into level-2 sections, ignoring headings inside fenced code blocks."""
    text = re.sub(r"^---\n.*?\n---\n", "", markdown, count=1, flags=re.DOTALL)
    sections: dict[str, list[str]] = {}
    current: list[str] | None = None
    in_fence = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and line.startswith("## "):
            key = _normalize_heading(line[3:])
            current = sections.setdefault(key, [])
            continue
        if current is not None:
            current.append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items()}


def _clean(body: str, exclude: list[re.Pattern], max_chars: int) -> str:
    body = re.sub(r"```.*?```", "", body, flags=re.DOTALL)
    lines = []
    for line in body.splitlines():
        if line.strip() in ("---",) or any(p.search(line) for p in exclude):
            continue
        line = _EMOJI.sub("", line).rstrip()
        if line.startswith("#"):
            line = "####" + line.lstrip("#")
        lines.append(line)
    # Drop headings left with no content after exclusions.
    kept: list[str] = []
    for i, line in enumerate(lines):
        if line.startswith("####"):
            nxt = next((n for n in lines[i + 1:] if n.strip()), None)
            if nxt is None or nxt.startswith("####"):
                continue
        kept.append(line)
    out = re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()
    if len(out) > max_chars:
        out = out[:max_chars].rsplit("\n", 1)[0].rstrip() + "\n..."
    return out


@lru_cache
def load_manifest() -> dict:
    return yaml.safe_load((PROMPTS_DIR / "manifest.yaml").read_text(encoding="utf-8"))


@lru_cache
def _persona_sections(file: str) -> dict[str, str]:
    return parse_sections((AGENCY_DIR / file).read_text(encoding="utf-8"))


def _persona_name(file: str) -> str:
    m = re.search(r"^name:\s*(.+)$", (AGENCY_DIR / file).read_text(encoding="utf-8"), re.MULTILINE)
    return m.group(1).strip() if m else file


def render_persona(spec: dict, defaults: dict) -> str:
    sections = _persona_sections(spec["file"])
    exclude = [re.compile(p, re.IGNORECASE) for p in defaults.get("exclude", []) + spec.get("exclude", [])]
    max_chars = spec.get("max_section_chars", defaults.get("max_section_chars", 1500))
    parts = []
    for wanted in spec["sections"]:
        match = next((k for k in sections if k.startswith(wanted)), None)
        if match is None:
            raise KeyError(f"Section '{wanted}' not found in {spec['file']} (have: {list(sections)})")
        body = _clean(sections[match], exclude, max_chars)
        if body:
            parts.append(f"### {match.title()}\n{body}")
    focus = f"\nApply this expertise specifically for: {spec['focus']}" if spec.get("focus") else ""
    return f"## Expertise: {_persona_name(spec['file'])}{focus}\n\n" + "\n\n".join(parts)


def _schema_block(schema: type[BaseModel]) -> str:
    return (
        "## Output format\n"
        "Respond with a single JSON object only (no markdown, no commentary) that validates against this JSON Schema:\n"
        + json.dumps(schema.model_json_schema(), ensure_ascii=False, indent=1)
    )


@lru_cache
def _contract(name: str) -> str:
    return (CONTRACTS_DIR / f"{name}.md").read_text(encoding="utf-8").strip()


def build_system_prompt(agent_key: str, schema: type[BaseModel] | None = None) -> str:
    manifest = load_manifest()
    agent = manifest["agents"][agent_key]
    defaults = manifest.get("defaults", {})
    blocks = [_contract("_shared"), _contract(agent["contract"])]
    personas = [render_persona(p, defaults) for p in agent.get("personas", [])]
    if personas:
        blocks.append(
            "# Specialist expertise\n"
            "The expertise below comes from general-purpose specialist personas. Use their judgement and craft, "
            "but the LocalMind rules and task contract above always win when they conflict.\n\n" + "\n\n".join(personas)
        )
    if schema is not None:
        blocks.append(_schema_block(schema))
    return "\n\n".join(blocks)
