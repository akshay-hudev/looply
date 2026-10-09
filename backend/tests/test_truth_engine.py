from app.graph.state import OfferFacts
from app.validators.claim_validator import check_claims
from app.validators.content_validator import check_format
from app.validators.localization_validator import normalize
from app.validators.offer_validator import check_offer, missing_facts

OFFER = OfferFacts(product="Cold Coffee", price="₹149", discount="20%", duration_text="this weekend",
                   start_date="12 Oct", end_date="13 Oct")


def types(issues):
    return [i.type for i in issues]


def test_readme_example_30_percent_rejected():
    issues = check_offer("Get 30% off on Cold Coffee!", OFFER)
    assert types(issues) == ["discount_mismatch"]
    assert issues[0].expected == "20%" and issues[0].found == "30%"


def test_correct_copy_passes_including_discounted_price():
    text = "Cold Coffee at ₹149, now 20% off = just ₹119 this weekend (12-13 Oct)!"
    assert check_offer(text, OFFER) == []


def test_indic_digits_and_percent_words_normalized():
    assert "20%" in normalize("ಶೇ ೨೦ ರಿಯಾಯಿತಿ")
    assert "20%" in normalize("२० प्रतिशत छूट")
    assert "₹149" in normalize("ರೂ. ೧೪೯")
    assert check_offer("ಕೋಲ್ಡ್ ಕಾಫಿ ರೂ.೧೪೯, ಶೇ ೨೦ ರಿಯಾಯಿತಿ!", OFFER) == []
    assert types(check_offer("कोल्ड कॉफ़ी पर २५ प्रतिशत छूट", OFFER)) == ["discount_mismatch"]


def test_wrong_price_and_date():
    assert types(check_offer("Only Rs. 99 this weekend", OFFER)) == ["price_mismatch"]
    assert types(check_offer("Offer valid till 20 Oct", OFFER)) == ["date_mismatch"]


def test_iso_locked_date_accepts_12_october():
    offer = OfferFacts(product="AVIS", start_date="2026-10-12")
    assert check_offer("Dussehra special opening on 12 October 2026", offer) == []
    assert types(check_offer("Opening on 20 October 2026", offer)) == ["date_mismatch"]


def test_unsupported_claims():
    assert types(check_claims("Best coffee in Bengaluru", [])) == ["unsupported_claim"]
    assert check_claims("Best coffee in Bengaluru", ["Best coffee in Bengaluru (Times Food Award 2024)"]) == []
    assert types(check_claims("ಬೆಂಗಳೂರಿನ ಅತ್ಯುತ್ತಮ ಕಾಫಿ", [])) == ["unsupported_claim"]


def test_missing_discount_is_warning_only():
    issues = missing_facts("Your weekend just got better", OFFER)
    assert issues and issues[0].severity == "low"


def test_whatsapp_template_rules():
    issues = check_format("whatsapp", "message", {"body": "Hi {{1}} {{2}} see bit.ly/x", "hashtags": ["#a"]})
    assert {i.type for i in issues} == {"format_violation"} and len(issues) == 3
