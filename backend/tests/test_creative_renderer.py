import re

import pytest

from app.services.creative_renderer import SIZES, CreativeCopy, _fit_middle, compose_image

LONG = CreativeCopy(
    brand="venkat baba clothes",
    headline="Festive in Cotton & Handloom: 15% Off at Launch for every college student in town",
    support="We're not here to do fast fashion. Our new festive line at 3rd cross old bank colony, "
            "BENGALURU is for those who know that a good weave has a story.",
    cta="Save the date: 2026-10-10. DM us now to reserve your size",
    discount="15% off", price="₹999", when="Festive collection launch · 2026-10-10",
    place="3rd cross old bank colony, BENGALURU",
)


@pytest.mark.parametrize("fmt", ["post", "offer_card", "poster", "story", "carousel"])
def test_middle_block_ends_above_the_bottom_band(fmt):
    w, h = SIZES[fmt]
    pad, tall = 80, h / w > 1.5
    bottom_y = h - pad - (220 if tall else 150)
    limit = bottom_y - 30 - 40 - 24
    m = _fit_middle(LONG, w, pad, tall, 200, limit)
    assert m.bottom <= limit
    assert m.head_lines, "the headline is never dropped"


@pytest.mark.parametrize("fmt", ["post", "poster", "story"])
def test_nothing_is_drawn_past_the_canvas(fmt):
    svg = compose_image(fmt, LONG)
    _, h = SIZES[fmt]
    for cy, r in re.findall(r'<circle cx="\d+" cy="(\d+)" r="(\d+)" fill="#', svg):
        if int(r) < 300:  # the badge, not the large decorative circles
            assert int(cy) + int(r) < h
    for y in re.findall(r'<text x="\d+" y="(\d+)"', svg):
        assert int(y) < h


def test_short_copy_keeps_full_size():
    short = CreativeCopy(brand="AVIS", headline="50% off", discount="50% off", cta="Book now", place="Wall Maria")
    m = _fit_middle(short, 1080, 80, False, 200, 800)
    assert m.head_size == 104
    assert m.badge_r == int(1080 * 0.15)
