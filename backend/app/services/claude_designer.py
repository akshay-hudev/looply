"""Claude designs posters, carousel slides and reel storyboards as SVG.

Claude does not output raster images, so the design is SVG code: layout, illustration, typography
and the locked offer facts. Every poster is checked (it must parse, and anything that could load
or run outside the file is stripped), then rendered to PNG so the platforms can publish it.
Reel storyboards stay animated SVG (SMIL); they are previews, not video files.
"""

import asyncio
import base64
import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree as ET

import anthropic
import resvg_py

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

FONT_STACK = ("'Segoe UI', 'Nirmala UI', 'Noto Sans', 'Noto Sans Kannada', 'Noto Sans Devanagari', "
              "'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Malayalam', 'Noto Sans Bengali', "
              "'Noto Sans Gujarati', 'Noto Sans Gurmukhi', Arial, sans-serif")
LOGO_TOKEN = "{{LOGO}}"
BANNED_TAGS = {"script", "foreignObject", "iframe", "object", "embed", "audio", "video", "handler", "listener"}
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
MAX_REFERENCE_BYTES = 4_000_000

POSTER_SYSTEM = f"""You are LOOPLY's poster designer for small local businesses in India. You design social media \
creatives as SVG code.

Output: only SVG markup. Each poster is one complete <svg> element with xmlns="{SVG_NS}" and the exact width, \
height and viewBox you are given. When asked for several slides, return that many <svg> elements in order and \
nothing between them.

Hard rules:
- Self-contained. No external URLs, <script>, <foreignObject>, event attributes, CSS @import or web fonts. Use \
shapes, paths, gradients, patterns, clip paths and filters (feGaussianBlur, feDropShadow) and <text>.
- Set font-family to {FONT_STACK} on every text element (or on a parent <g>).
- Write all customer-facing text in the requested language and script.
- The locked facts (offer, price, dates, times, place) must appear exactly as given. Never invent a number, price, \
date, discount, claim or contact detail.
- SVG has no automatic line wrapping: break long text into separate lines yourself (<tspan> with x and dy). \
Estimate about 0.55em per Latin character and 0.7em per Indic character. Keep every glyph at least 64px inside \
the canvas, and never let two text blocks or a text block and the badge overlap.
- High contrast: text on busy areas gets a solid or gradient panel behind it.

Design: one clear hierarchy - small brand name at the top, the headline as the hero, the offer as a bold badge or \
ribbon, the call to action as a pill button near the bottom, the place as a small line under it. Add one simple, \
relevant illustration built from shapes (a coffee cup for a cafe, a garment for a clothes shop) and a background \
that suits the brand palette and mood. Flat, modern, warm, uncluttered.

If a logo is provided, place it once with <image href="{LOGO_TOKEN}" .../> in a corner at a modest size \
(preserveAspectRatio="xMidYMid meet"). Owner photos you are shown are style references for colour and mood; do \
not try to embed them. Owner correction notes override your defaults but never the locked facts."""

STORYBOARD_SYSTEM = f"""You are LOOPLY's reel designer. You design a vertical reel storyboard as one animated SVG \
(SMIL) that loops.

Output: only one <svg> element with xmlns="{SVG_NS}", width="1080" height="1920" viewBox="0 0 1080 1920".

Hard rules:
- Self-contained: no external URLs, <script>, <foreignObject>, event attributes, CSS @import or web fonts.
- Animate only with SMIL (<animate>, <animateTransform>, <set>), every animation with repeatCount="indefinite" \
and the same total dur, so the scenes stay in sync on every loop.
- Each scene is a <g> that is visible only during its time slice (opacity animation with calcMode="discrete" \
keyTimes). Within a scene, add gentle motion: text sliding or scaling in, a shape drifting.
- Set font-family to {FONT_STACK} on every text element. Overlay text is short and readable with the sound off; \
break lines yourself, at least 80px from every edge.
- Keep the locked facts exactly as given; never invent numbers, prices, dates or claims.
- Show the brand name throughout, a thin progress bar along the bottom that fills over the full duration, and end \
on a call-to-action card with the offer."""


class DesignError(Exception):
    """Claude could not produce a usable design; the caller falls back to the built-in poster."""


def extract_svgs(text: str) -> list[str]:
    return re.findall(r"<svg\b.*?</svg>", text, flags=re.S | re.I)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def sanitize_svg(svg: str, width: int, height: int, *, allow_logo: bool = True) -> str:
    """Parse, drop anything that can run code or load from outside, and pin the canvas size."""
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as e:
        raise DesignError(f"not valid SVG: {e}") from e
    if _local(root.tag) != "svg":
        raise DesignError("the root element is not <svg>")
    for parent in list(root.iter()):
        for child in list(parent):
            if _local(child.tag) in BANNED_TAGS:
                parent.remove(child)
            elif _local(child.tag) == "style" and child.text and re.search(r"@import|url\(\s*['\"]?(?:https?:|//)", child.text, re.I):
                parent.remove(child)
    for el in root.iter():
        for name in list(el.attrib):
            local = _local(name).lower()
            value = el.attrib[name].strip()
            if local.startswith("on"):
                del el.attrib[name]
            elif local == "href" and not (value.startswith("#") or value.startswith("data:image/")
                                          or (allow_logo and value == LOGO_TOKEN)):
                del el.attrib[name]
            elif local == "style" and re.search(r"url\(\s*['\"]?(?:https?:|//)", value, re.I):
                del el.attrib[name]
    root.set("width", str(width))
    root.set("height", str(height))
    if "viewBox" not in root.attrib:
        root.set("viewBox", f"0 0 {width} {height}")
    return ET.tostring(root, encoding="unicode")


def rasterize(svg: str, width: int, height: int) -> bytes:
    """PNG for publishing. resvg shapes Indic scripts with the fonts installed on the server."""
    return bytes(resvg_py.svg_to_bytes(svg_string=svg, width=width, height=height))


def media_path(url: str, media_dir: str) -> Path | None:
    """Local file behind one of our own media URLs (…/media/<org>/<file>)."""
    if "/media/" not in url:
        return None
    path = (Path(media_dir) / url.split("/media/", 1)[1]).resolve()
    root = Path(media_dir).resolve()
    return path if root in path.parents and path.is_file() else None


def image_block(url: str, media_dir: str) -> dict | None:
    path = media_path(url, media_dir)
    if path is None or path.suffix.lower() not in IMAGE_TYPES or path.stat().st_size > MAX_REFERENCE_BYTES:
        return None
    data = base64.standard_b64encode(path.read_bytes()).decode("ascii")
    return {"type": "image", "source": {"type": "base64", "media_type": IMAGE_TYPES[path.suffix.lower()], "data": data}}


def data_uri(url: str, media_dir: str) -> str | None:
    block = image_block(url, media_dir)
    return f"data:{block['source']['media_type']};base64,{block['source']['data']}" if block else None


class ClaudeDesigner:
    def __init__(self, s: Settings):
        self.s = s
        self.model = s.claude_design_model
        self.client = anthropic.AsyncAnthropic(api_key=s.anthropic_api_key, max_retries=3, timeout=600.0)
        self.limit = asyncio.Semaphore(max(1, s.claude_design_concurrency))

    async def _ask(self, system: str, content: list[dict], *, max_tokens: int) -> str:
        async with self.limit:
            try:
                async with self.client.beta.messages.stream(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                    messages=[{"role": "user", "content": content}],
                    output_config={"effort": self.s.claude_design_effort},
                    # A policy decline is re-run server-side on Anthropic's recommended fallback model.
                    betas=["server-side-fallback-2026-07-01"],
                    fallbacks="default",
                ) as stream:
                    message = await stream.get_final_message()
            except anthropic.AuthenticationError as e:
                raise DesignError("Claude rejected the API key (check ANTHROPIC_API_KEY)") from e
            except anthropic.RateLimitError as e:
                raise DesignError("Claude rate limit reached") from e
            except anthropic.APIStatusError as e:
                raise DesignError(f"Claude API error {e.status_code}: {e.message}") from e
            except anthropic.APIConnectionError as e:
                raise DesignError("could not reach the Claude API") from e
        if message.stop_reason == "refusal":
            category = getattr(message.stop_details, "category", None) if message.stop_details else None
            raise DesignError(f"Claude declined the design ({category or 'no category'})")
        if message.stop_reason == "max_tokens":
            raise DesignError("the design ran past the output limit")
        return "".join(b.text for b in message.content if b.type == "text")

    async def _design(self, system: str, content: list[dict], count: int, width: int, height: int,
                      *, max_tokens: int, allow_logo: bool) -> list[str]:
        """Ask once; if the SVG doesn't parse, ask once more with the error."""
        error = ""
        for _ in range(2):
            parts = content if not error else [*content, {"type": "text", "text": f"Your previous answer was rejected: {error}. Return only corrected SVG."}]
            text = await self._ask(system, parts, max_tokens=max_tokens)
            svgs = extract_svgs(text)
            try:
                if len(svgs) < count:
                    raise DesignError(f"expected {count} <svg> element(s), got {len(svgs)}")
                return [sanitize_svg(s, width, height, allow_logo=allow_logo) for s in svgs[:count]]
            except DesignError as e:
                error = str(e)
                log.warning("claude design rejected, retrying: %s", error)
        raise DesignError(error)

    async def poster(self, brief: dict, *, width: int, height: int, slides: list[str] | None = None,
                     references: list[dict] | None = None, logo_uri: str | None = None) -> list[str]:
        count = len(slides) if slides else 1
        ask = {
            **brief,
            "canvas": {"width": width, "height": height},
            "logo": "provided - use the {{LOGO}} placeholder" if logo_uri else "none",
        }
        if slides:
            ask["slides"] = [{"slide": i + 1, "of": count, "text": t} for i, t in enumerate(slides)]
            ask["slide_rules"] = ("One <svg> per slide, in order, sharing one visual system. Slide 1 is the cover "
                                  "with the headline and offer; the last slide carries the call to action.")
        content: list[dict] = list(references or [])
        content.append({"type": "text", "text": "Design brief (JSON):\n" + json.dumps(ask, ensure_ascii=False, indent=1)})
        svgs = await self._design(POSTER_SYSTEM, content, count, width, height,
                                  max_tokens=16000 + 12000 * (count - 1), allow_logo=bool(logo_uri))
        return [s.replace(LOGO_TOKEN, logo_uri) if logo_uri else s for s in svgs]

    async def storyboard(self, brief: dict, scenes: list[dict], duration_s: int) -> str:
        ask = {**brief, "duration_seconds": duration_s, "scenes": scenes}
        content = [{"type": "text", "text": "Reel brief (JSON):\n" + json.dumps(ask, ensure_ascii=False, indent=1)}]
        (svg,) = await self._design(STORYBOARD_SYSTEM, content, 1, 1080, 1920, max_tokens=24000, allow_logo=False)
        return svg


@lru_cache
def _designer(key: str, model: str, effort: str, concurrency: int) -> ClaudeDesigner:
    return ClaudeDesigner(get_settings())


def get_designer(s: Settings | None = None) -> ClaudeDesigner | None:
    """The Claude designer when a key is set; None in offline demo mode or without a key."""
    s = s or get_settings()
    if s.demo_mode or not s.anthropic_api_key:
        return None
    return _designer(s.anthropic_api_key, s.claude_design_model, s.claude_design_effort, s.claude_design_concurrency)
