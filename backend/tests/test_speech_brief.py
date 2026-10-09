from datetime import date

from app.services.speech_brief import parse_speech

TODAY = date(2026, 10, 9)  # Friday
SHOP = "JP Nagar 5th Phase, Bengaluru"


def test_one_sentence_fills_the_blanks_it_actually_said():
    heard = parse_speech(
        "Steamed samosa, buy 2 get 3 free, this Saturday, college students in JP Nagar, Instagram, English.",
        SHOP, today=TODAY,
    )
    assert heard.product == "Steamed samosa"
    assert heard.offer == "buy 2 get 3 free"
    assert heard.offer_options == []
    assert heard.occasion == "this Saturday"
    assert heard.event_date is None
    assert heard.audience == "college students"
    assert heard.region_clash is False
    assert heard.languages == ["en"]
    assert heard.platforms_without_formats == ["instagram"]
    assert heard.unplaced is None


def test_offer_is_kept_as_spoken():
    heard = parse_speech("Cold cofee, 10% off for 70", SHOP, today=TODAY)
    assert heard.product == "Cold cofee"
    assert heard.offer == "10% off for 70"


def test_two_prices_stay_a_choice():
    heard = parse_speech("Samosa, 10% off for 70 or ₹49", SHOP, today=TODAY)
    assert heard.offer is None
    assert heard.offer_options == ["10% off for 70", "₹49"]
    assert heard.unplaced is None


def test_clashing_days_stay_a_choice():
    heard = parse_speech("Samosa this Saturday and 12 October", SHOP, today=TODAY)
    saturday = next(item for item in heard.date_options if item.label == "this Saturday")
    october = next(item for item in heard.date_options if "12 October" in item.label)
    assert saturday.event_date is None
    assert october.event_date == "2026-10-12"
    assert heard.event_date is None


def test_a_different_place_is_a_clash():
    heard = parse_speech("Samosa in Indiranagar", SHOP, today=TODAY)
    assert heard.region == "Indiranagar"
    assert heard.region_clash is True


def test_kannada_is_added_and_english_only_stays_english():
    both = parse_speech("Samosa in Kannada and English", SHOP, today=TODAY)
    assert both.languages == ["en", "kn"]
    assert both.region is None
    assert both.region_clash is False
    only = parse_speech("Samosa, English only", SHOP, today=TODAY)
    assert only.languages == ["en"]


def test_named_formats_do_not_ask_again():
    heard = parse_speech("Samosa on Instagram, a poster and a story", SHOP, today=TODAY)
    assert heard.formats["instagram"] == ["poster", "story"]
    assert heard.platforms_without_formats == []
