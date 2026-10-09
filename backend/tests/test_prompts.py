"""Prompt snapshots: any change to personas, manifest or contracts shows up as a reviewable diff.

Regenerate with:  UPDATE_SNAPSHOTS=1 pytest tests/test_prompts.py
"""

import os
from pathlib import Path

import pytest

from app.agents.analytics import AnalyticsOutput
from app.agents.audience import AudienceOutput
from app.agents.campaign_manager import Extraction
from app.agents.content_director import BriefsOutput
from app.agents.fact_checker import TruthOutput
from app.agents.language_culture import LocalizationOutput
from app.agents.locality import LocalityInterpretation
from app.agents.optimizer import OptimizationOutput
from app.agents.performance import PerformanceOutput
from app.agents.platform import PlatformOutput
from app.agents.strategy import StrategyOutput
from app.agents.video import VideoPlan
from app.agents.visual import VisualPrompt
from app.graph.state import BusinessProfile, CoreMessage
from app.prompts.builder import build_system_prompt, load_manifest

SNAPSHOTS = Path(__file__).parent / "snapshots" / "prompts"
SCHEMAS = {
    "campaign_manager": Extraction, "business": BusinessProfile, "locality": LocalityInterpretation,
    "audience": AudienceOutput, "strategy": StrategyOutput, "content_director": BriefsOutput, "text": CoreMessage,
    "platform_instagram": PlatformOutput, "platform_whatsapp": PlatformOutput, "platform_linkedin": PlatformOutput,
    "platform_facebook": PlatformOutput, "platform_youtube": PlatformOutput, "language_culture": LocalizationOutput, "truth": TruthOutput,
    "performance": PerformanceOutput, "optimizer": OptimizationOutput, "visual": VisualPrompt, "video": VideoPlan,
    "analytics": AnalyticsOutput,
}


def test_every_manifest_agent_has_a_schema():
    assert set(load_manifest()["agents"]) == set(SCHEMAS)


@pytest.mark.parametrize("agent", sorted(SCHEMAS))
def test_prompt_snapshot(agent):
    prompt = build_system_prompt(agent, SCHEMAS[agent])
    assert "LocalMind" in prompt and "JSON" in prompt
    for banned in ("screenshot", "git commit", "npm install", "zero confirmation"):
        assert banned not in prompt.lower(), f"{agent} prompt leaks coding-agent instruction: {banned}"
    path = SNAPSHOTS / f"{agent}.txt"
    if os.environ.get("UPDATE_SNAPSHOTS") or not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(prompt, encoding="utf-8")
    assert prompt == path.read_text(encoding="utf-8"), f"prompt for {agent} changed; rerun with UPDATE_SNAPSHOTS=1"
