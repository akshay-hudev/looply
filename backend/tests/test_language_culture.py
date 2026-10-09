"""Tests for Language & Cultural Adaptation Agent (Agent 8)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.agents import language_culture
from app.agents.copy import AssetCopy
from app.agents.language_culture import (
    Candidate,
    CandidateScores,
    LocalizedVariant,
    LocalizationOutput,
    total_score,
    validate_candidate,
    select_best,
)
from app.graph.context import PipelineContext
from app.graph.state import CampaignBrain
from app.services.model_gateway.demo import language_culture as demo_language_culture


def test_scoring_weights():
    """Verify default score weights: Naturalness 30%, Meaning 25%, Cultural 20%, Platform 15%, Catchiness 10%."""
    # Test on 0-10 scale
    scores_10 = CandidateScores(
        naturalness=10.0,
        meaning_preservation=8.0,
        cultural_fit=9.0,
        platform_fit=8.0,
        catchiness=7.0,
    )
    # Expected: 10*0.30 + 8*0.25 + 9*0.20 + 8*0.15 + 7*0.10 = 3.0 + 2.0 + 1.8 + 1.2 + 0.7 = 8.70
    assert total_score(scores_10) == 8.70

    # Test on 0-100 scale (normalized)
    scores_100 = CandidateScores(
        naturalness=90.0,
        meaning_preservation=100.0,
        cultural_fit=80.0,
        platform_fit=70.0,
        catchiness=60.0,
    )
    # Expected normalized: 9.0*0.30 + 10.0*0.25 + 8.0*0.20 + 7.0*0.15 + 6.0*0.10 = 2.7 + 2.5 + 1.6 + 1.05 + 0.6 = 8.45
    assert total_score(scores_100) == 8.45


def test_candidate_validation_fact_preservation():
    """Verify candidate validation rejects missing CTAs, or low naturalness/meaning scores."""
    source_copy = AssetCopy(headline="Big Sale", body="Get 20% off today", cta="Shop Now")
    offer_locked = {"product": "Coffee", "price": "₹150", "discount": "20%"}

    # Valid candidate
    good_copy = AssetCopy(headline="Coffee Special", body="Enjoy Coffee at ₹150 with 20% discount!", cta="Order Now")
    good_candidate = Candidate(
        adaptation=good_copy,
        scores=CandidateScores(naturalness=9.0, meaning_preservation=9.5, cultural_fit=9.0, platform_fit=8.5, catchiness=8.0),
    )
    is_ok, reasons = validate_candidate(good_candidate, offer_locked, source_copy)
    assert is_ok is True
    assert len(reasons) == 0

    # Missing CTA candidate
    bad_cta_copy = AssetCopy(headline="Coffee Special", body="Enjoy Coffee at ₹150 with 20% discount!", cta="")
    bad_cta_candidate = Candidate(
        adaptation=bad_cta_copy,
        scores=CandidateScores(naturalness=9.0, meaning_preservation=9.5, cultural_fit=9.0, platform_fit=8.5, catchiness=8.0),
    )
    is_ok, reasons = validate_candidate(bad_cta_candidate, offer_locked, source_copy)
    assert is_ok is False
    assert any("CTA" in r or "call-to-action" in r for r in reasons)

    # Low naturalness score candidate
    low_naturalness_candidate = Candidate(
        adaptation=good_copy,
        scores=CandidateScores(naturalness=4.0, meaning_preservation=9.0, cultural_fit=9.0, platform_fit=8.0, catchiness=8.0),
    )
    is_ok, reasons = validate_candidate(low_naturalness_candidate, offer_locked, source_copy)
    assert is_ok is False
    assert any("naturalness" in r for r in reasons)

    # Low meaning preservation candidate
    low_meaning_candidate = Candidate(
        adaptation=good_copy,
        scores=CandidateScores(naturalness=9.0, meaning_preservation=4.0, cultural_fit=9.0, platform_fit=8.0, catchiness=8.0),
    )
    is_ok, reasons = validate_candidate(low_meaning_candidate, offer_locked, source_copy)
    assert is_ok is False
    assert any("meaning_preservation" in r for r in reasons)


def test_select_best_candidate():
    """Verify select_best chooses the valid candidate with highest total score."""
    offer_locked = {"price": "₹100"}
    c1 = Candidate(
        adaptation=AssetCopy(headline="A1", body="Item at ₹100", cta="Buy"),
        scores=CandidateScores(naturalness=8.0, meaning_preservation=8.0, cultural_fit=8.0, platform_fit=8.0, catchiness=8.0),
    )
    c2 = Candidate(
        adaptation=AssetCopy(headline="A2", body="Item at ₹100", cta="Buy"),
        scores=CandidateScores(naturalness=9.5, meaning_preservation=9.5, cultural_fit=9.0, platform_fit=9.0, catchiness=9.0),
    )

    variant = LocalizedVariant(
        label="A",
        candidates=[c1, c2],
        back_translation="Item at ₹100. Buy now!",
        cultural_notes="Uses native phrasing.",
    )

    best, score, is_valid, reasons = select_best(variant, offer_locked)
    assert is_valid is True
    assert best.adaptation.headline == "A2"
    assert score == total_score(c2.scores)


def test_offline_demo_kannada_and_kanglish():
    """Test offline demo localization for Kannada (kn) and Kanglish (kn_en)."""
    payload_kn = {
        "target_language": {"code": "kn", "name": "Kannada"},
        "target_locale": "Bengaluru",
        "code_switching": False,
        "offer_locked": {"product": "Filter Coffee", "price": "₹50", "discount": "20%"},
        "business_name": "Corner House",
        "variants_to_adapt": [
            {"label": "A", "original_english": {"headline": "Best Coffee", "body": "Visit us for coffee", "cta": "Come today"}}
        ]
    }
    res_kn = demo_language_culture(payload_kn)
    assert "variants" in res_kn
    cands_kn = res_kn["variants"][0]["candidates"]
    assert len(cands_kn) == 3
    # Check that Kannada script is used and price ₹50 is present
    assert "₹50" in cands_kn[0]["adaptation"]["headline"] or "₹50" in cands_kn[0]["adaptation"]["body"]

    # Test Kanglish
    payload_kn_en = {**payload_kn, "code_switching": True, "target_language": {"code": "kn", "name": "Kannada"}}
    res_kn_en = demo_language_culture(payload_kn_en)
    assert len(res_kn_en["variants"][0]["candidates"]) == 3
    assert "weekend" in res_kn_en["variants"][0]["candidates"][0]["adaptation"]["headline"].lower() or "bengaluru" in res_kn_en["variants"][0]["candidates"][0]["adaptation"]["body"].lower()


def test_offline_demo_hindi_and_hinglish():
    """Test offline demo localization for Hindi (hi) and Hinglish (hi_en)."""
    payload_hi = {
        "target_language": {"code": "hi", "name": "Hindi"},
        "target_locale": "Delhi",
        "code_switching": False,
        "offer_locked": {"product": "Butter Chicken", "price": "₹299", "discount": "15%"},
        "business_name": "Dilli Rasoi",
        "variants_to_adapt": [
            {"label": "A", "original_english": {"headline": "Delicious Meal", "body": "Taste our special dish", "cta": "Order now"}}
        ]
    }
    res_hi = demo_language_culture(payload_hi)
    cands_hi = res_hi["variants"][0]["candidates"]
    assert len(cands_hi) == 3
    assert "₹299" in cands_hi[0]["adaptation"]["headline"] or "₹299" in cands_hi[0]["adaptation"]["body"]

    # Test Hinglish
    payload_hi_en = {**payload_hi, "code_switching": True}
    res_hi_en = demo_language_culture(payload_hi_en)
    assert len(res_hi_en["variants"][0]["candidates"]) == 3


def test_offline_demo_tamil_and_tanglish():
    """Test offline demo localization for Tamil (ta) and Tanglish (ta_en)."""
    payload_ta = {
        "target_language": {"code": "ta", "name": "Tamil"},
        "target_locale": "Chennai",
        "code_switching": False,
        "offer_locked": {"product": "Dosa", "price": "₹80"},
        "business_name": "Saravana Bhavan",
        "variants_to_adapt": [
            {"label": "A", "original_english": {"headline": "Crispy Dosa", "body": "Hot dosa ready", "cta": "Come today"}}
        ]
    }
    res_ta = demo_language_culture(payload_ta)
    cands_ta = res_ta["variants"][0]["candidates"]
    assert len(cands_ta) == 3

    # Test Tanglish
    payload_ta_en = {**payload_ta, "code_switching": True}
    res_ta_en = demo_language_culture(payload_ta_en)
    assert len(res_ta_en["variants"][0]["candidates"]) == 3


@pytest.mark.asyncio
async def test_run_agent_with_retry_on_quality_failure():
    """Test language_culture.run retry loop when initial response fails validation."""
    ctx = MagicMock(spec=PipelineContext)
    brain = MagicMock()
    brain.offer.model_dump.return_value = {"price": "₹200", "discount": "10%"}
    brain.business.name = "Test Bakery"
    brain.business.brand_voice = "Friendly"
    brain.strategy.code_switching = False
    brain.strategy.code_switching_style = "None"
    brain.strategy.primary_audience = "Youth"
    brain.locality.city = "Bengaluru"
    brain.locality.area = "Koramangala"
    ctx.brain.return_value = brain
    ctx.emit = MagicMock()

    # First attempt: invalid candidate (low meaning_preservation score 4.0)
    bad_cand = Candidate(
        adaptation=AssetCopy(headline="Low Quality", body="Body with poor meaning", cta="Buy"),
        scores=CandidateScores(naturalness=9.0, meaning_preservation=4.0, cultural_fit=9.0, platform_fit=9.0, catchiness=9.0)
    )
    bad_out = LocalizationOutput(variants=[
        LocalizedVariant(label="A", candidates=[bad_cand], back_translation="No price", cultural_notes="Notes")
    ])

    # Second attempt: valid candidate (includes ₹200 and discount)
    good_cand = Candidate(
        adaptation=AssetCopy(headline="Special Cake", body="Cake at ₹200 with 10% off", cta="Buy Now"),
        scores=CandidateScores(naturalness=9.0, meaning_preservation=9.5, cultural_fit=9.0, platform_fit=9.0, catchiness=9.0)
    )
    good_out = LocalizationOutput(variants=[
        LocalizedVariant(label="A", candidates=[good_cand], back_translation="Cake at ₹200", cultural_notes="Good notes")
    ])

    # Mock call_agent to return bad_out on 1st call, good_out on 2nd call
    call_agent_mock = AsyncMock(side_effect=[bad_out, good_out])
    language_culture.call_agent = call_agent_mock

    src_copy = AssetCopy(headline="Original", body="Original body", cta="Buy Now")
    res = await language_culture.run(ctx, "instagram", "story", "kn", [("A", src_copy)])

    assert "A" in res
    assert res["A"]["copy"].headline == "Special Cake"
    assert call_agent_mock.call_count == 2
    assert ctx.emit.called
