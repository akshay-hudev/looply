"""Claude poster design: SVG checks, PNG rendering, and the visual agent's Claude path (no network)."""

import asyncio
from types import SimpleNamespace

import pytest

from app.agents import visual
from app.graph.state import CampaignBrain
from app.services import claude_designer as cd

GOOD = ('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 1080 1080">'
        '<rect width="1080" height="1080" fill="#7c2d12"/>'
        '<text x="80" y="200" font-size="80" fill="#fff">15% off</text></svg>')


def test_extracts_every_svg_from_a_reply():
    reply = f"Here you go:\n{GOOD}\nand slide two\n{GOOD}"
    assert len(cd.extract_svgs(reply)) == 2
    assert cd.extract_svgs("no markup here") == []


def test_sanitize_strips_anything_that_runs_or_loads_from_outside():
    dirty = ('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'
             '<script>alert(1)</script><foreignObject><div/></foreignObject>'
             '<style>@import url(https://evil.example/x.css);</style>'
             '<image href="https://evil.example/x.png"/><image href="{{LOGO}}"/>'
             '<image href="data:image/png;base64,AAAA"/><use href="#a"/>'
             '<rect style="fill:url(https://evil.example/p)" onclick="x()"/>'
             '<animate attributeName="opacity" dur="2s" repeatCount="indefinite"/></svg>')
    out = cd.sanitize_svg(dirty, 1080, 1350)
    for bad in ("onload", "<script", "foreignObject", "@import", "evil.example", "onclick"):
        assert bad not in out
    assert "{{LOGO}}" in out and "data:image/png" in out and 'href="#a"' in out
    assert "<animate" in out  # storyboards keep their SMIL animation
    assert 'width="1080"' in out and 'height="1350"' in out


def test_sanitize_drops_the_logo_placeholder_when_no_logo_was_given():
    out = cd.sanitize_svg('<svg xmlns="http://www.w3.org/2000/svg"><image href="{{LOGO}}"/></svg>', 100, 100, allow_logo=False)
    assert "{{LOGO}}" not in out


def test_sanitize_rejects_markup_that_is_not_svg():
    with pytest.raises(cd.DesignError):
        cd.sanitize_svg("<svg><rect></svg>", 10, 10)
    with pytest.raises(cd.DesignError):
        cd.sanitize_svg("<html/>", 10, 10)


def test_rasterize_returns_a_png_at_the_canvas_size():
    png = cd.rasterize(cd.sanitize_svg(GOOD, 1080, 1080), 1080, 1080)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert int.from_bytes(png[16:20], "big") == 1080  # IHDR width


class FakeDesigner(cd.ClaudeDesigner):
    """The real designer with the API call replaced by canned replies."""

    def __init__(self, replies):
        self.model = "claude-sonnet-5-5"
        self.replies = list(replies)
        self.asks = []

    async def _ask(self, system, content, *, max_tokens):
        self.asks.append(content)
        return self.replies.pop(0)


def test_poster_retries_once_with_the_error_then_succeeds():
    d = FakeDesigner(["sorry, no svg", GOOD])
    (svg,) = asyncio.run(d.poster({"headline": "15% off"}, width=1080, height=1080))
    assert 'width="1080"' in svg
    assert "rejected" in d.asks[1][-1]["text"]


def test_poster_gives_up_after_two_bad_answers():
    d = FakeDesigner(["nothing", "<svg>broken"])
    with pytest.raises(cd.DesignError):
        asyncio.run(d.poster({"headline": "x"}, width=1080, height=1080))


def test_poster_embeds_the_logo_as_a_data_uri():
    logo_svg = GOOD.replace("</svg>", '<image href="{{LOGO}}" x="0" y="0" width="80" height="80"/></svg>')
    d = FakeDesigner([logo_svg])
    (svg,) = asyncio.run(d.poster({"headline": "x"}, width=1080, height=1080, logo_uri="data:image/png;base64,QUJD"))
    assert "data:image/png;base64,QUJD" in svg and "{{LOGO}}" not in svg


class FakeMedia:
    def __init__(self):
        self.files = []

    def put(self, data, *, org_id, ext):
        self.files.append((ext, data))
        return f"http://test/media/{org_id}/{len(self.files)}.{ext}"


def _ctx(tmp_path):
    brain = CampaignBrain()
    brain.business.name = "Ravi Cafe"
    brain.offer.discount = "15% off"
    return SimpleNamespace(brain=lambda: brain, settings=SimpleNamespace(local_media_dir=str(tmp_path)))


def _asset(fmt="post", **content):
    return SimpleNamespace(id="a1", org_id="org1", format=fmt, platform="instagram", language="en", media_prompt="x",
                           media_url=None, media_status=None, content={"headline": "Fresh filter coffee", "cta": "Visit today", **content})


def test_visual_agent_stores_the_svg_and_publishes_a_png(tmp_path):
    asset, media = _asset(), FakeMedia()
    asyncio.run(visual.generate_with_claude(_ctx(tmp_path), asset, FakeDesigner([GOOD]), media))
    assert asset.media_url.endswith(".png") and asset.media_status == "ready"
    assert asset.content["media_source"] == "claude"
    assert asset.content["svg_url"].endswith(".svg")
    assert [ext for ext, _ in media.files] == ["svg", "png"]


def test_visual_agent_designs_every_carousel_slide(tmp_path):
    asset = _asset("carousel", slides=["Cover", "Middle", "Visit us"])
    asyncio.run(visual.generate_with_claude(_ctx(tmp_path), asset, FakeDesigner([GOOD * 3]), FakeMedia()))
    assert len(asset.content["slide_urls"]) == 3
    assert all(u.endswith(".png") for u in asset.content["slide_urls"])


def test_visual_agent_falls_back_to_the_composed_poster(tmp_path):
    asset = _asset()
    asyncio.run(visual.generate_with_claude(_ctx(tmp_path), asset, FakeDesigner(["no", "still no"]), FakeMedia()))
    assert asset.content["media_source"] == "composed"
    assert asset.media_url.endswith(".svg")
    assert "Claude couldn't design" in asset.content["media_note"]


def test_no_designer_without_a_key_or_in_demo_mode():
    assert cd.get_designer(SimpleNamespace(demo_mode=False, anthropic_api_key="")) is None
    assert cd.get_designer(SimpleNamespace(demo_mode=True, anthropic_api_key="sk-test")) is None
