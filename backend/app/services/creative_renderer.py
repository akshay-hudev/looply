"""Composes finished creatives as SVG from the asset's copy and locked offer facts.

Used when no image/video model is available (demo mode, outages) so the owner always sees a real,
readable poster, story card, offer card, carousel slide or reel storyboard. All text comes from the
verified copy; nothing is invented here.
"""

from dataclasses import dataclass
from xml.sax.saxutils import escape

FONT = "'Segoe UI', 'Nirmala UI', 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Kannada', Arial, sans-serif"

SIZES = {
    "post": (1080, 1080), "offer_card": (1080, 1080), "carousel": (1080, 1350), "story": (1080, 1920),
    "poster": (1080, 1440), "reel": (1080, 1920), "message": (1080, 1080),
}


@dataclass(frozen=True)
class Palette:
    bg1: str
    bg2: str
    ink: str
    accent: str
    accent_ink: str
    soft: str


PALETTES = {
    "food": Palette("#3b1f0e", "#8a3b12", "#fff7ed", "#fbbf24", "#3b1f0e", "#fde68a"),
    "cafe": Palette("#2b1a12", "#6f4e37", "#fffaf0", "#f59e0b", "#2b1a12", "#fcd9a8"),
    "beauty": Palette("#4a1d3f", "#be185d", "#fff1f7", "#fbcfe8", "#4a1d3f", "#f9a8d4"),
    "health": Palette("#063a3a", "#0f766e", "#f0fdfa", "#5eead4", "#063a3a", "#99f6e4"),
    "education": Palette("#1e1b4b", "#4338ca", "#eef2ff", "#facc15", "#1e1b4b", "#c7d2fe"),
    "fitness": Palette("#111827", "#b91c1c", "#fef2f2", "#f97316", "#111827", "#fecaca"),
    "retail": Palette("#0b2545", "#13315c", "#f8fafc", "#f43f5e", "#ffffff", "#bfdbfe"),
    "default": Palette("#1f2937", "#ea580c", "#fff7ed", "#fde047", "#1f2937", "#fed7aa"),
}
KEYWORDS = {
    "cafe": ("cafe", "café", "coffee", "tea", "bakery", "dessert"),
    "food": ("restaurant", "food", "kitchen", "biryani", "dhaba", "continental", "arabian", "menu", "dine", "pizza"),
    "beauty": ("salon", "spa", "beauty", "parlour", "parlor", "makeup", "boutique"),
    "health": ("clinic", "doctor", "dental", "hospital", "pharmacy", "physio", "health"),
    "education": ("tuition", "tutor", "class", "academy", "school", "coaching", "course"),
    "fitness": ("gym", "fitness", "yoga", "dance", "sports"),
    "retail": ("store", "shop", "mart", "fashion", "electronics", "jewel", "sale"),
}


def palette_for(*hints: str | None) -> Palette:
    text = " ".join(h for h in hints if h).lower()
    for name, words in KEYWORDS.items():
        if any(w in text for w in words):
            return PALETTES[name]
    return PALETTES["default"]


def _wrap(text: str, max_chars: int, max_lines: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > max_chars and cur:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(".,;: ") + "…"
    return lines


def _text_block(lines: list[str], x: int, y: int, size: int, color: str, weight: int = 700,
                anchor: str = "middle", leading: float = 1.15) -> tuple[str, int]:
    out = []
    for i, line in enumerate(lines):
        out.append(f'<text x="{x}" y="{y + int(i * size * leading)}" font-family="{FONT}" font-size="{size}" '
                   f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{escape(line)}</text>')
    return "".join(out), y + int(len(lines) * size * leading)


def _fit(text: str, width: int, base: int, max_lines: int) -> tuple[list[str], int]:
    """Largest font size (down to 40% of base) at which the text fits in max_lines."""
    size = base
    while size > base * 0.4:
        chars = max(8, int(width / (size * 0.55)))
        lines = _wrap(text, chars, 99)
        if len(lines) <= max_lines:
            return lines, size
        size = int(size * 0.88)
    chars = max(8, int(width / (size * 0.55)))
    return _wrap(text, chars, max_lines), size


@dataclass
class CreativeCopy:
    brand: str
    headline: str
    support: str = ""
    cta: str = ""
    discount: str = ""
    price: str = ""
    when: str = ""
    place: str = ""
    category: str = ""
    slide_label: str = ""


def _decor(w: int, h: int, p: Palette) -> str:
    return (f'<circle cx="{int(w * 0.92)}" cy="{int(h * 0.08)}" r="{int(w * 0.28)}" fill="{p.soft}" opacity="0.10"/>'
            f'<circle cx="{int(w * 0.05)}" cy="{int(h * 0.9)}" r="{int(w * 0.35)}" fill="{p.accent}" opacity="0.08"/>'
            f'<path d="M0 {int(h * 0.62)} Q {w // 2} {int(h * 0.55)} {w} {int(h * 0.64)} L {w} {h} L 0 {h} Z" '
            f'fill="#000" opacity="0.18"/>')


def _badge(cx: int, cy: int, r: int, p: Palette, top: str, bottom: str) -> str:
    top_size = int(r * (0.62 if len(top) <= 4 else 0.42))
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{p.accent}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{int(r * 0.88)}" fill="none" stroke="{p.accent_ink}" stroke-width="3" '
            f'stroke-dasharray="6 8" opacity="0.5"/>'
            f'<text x="{cx}" y="{cy + int(top_size * 0.3)}" font-family="{FONT}" font-size="{top_size}" font-weight="900" '
            f'fill="{p.accent_ink}" text-anchor="middle">{escape(top)}</text>'
            f'<text x="{cx}" y="{cy + int(r * 0.55)}" font-family="{FONT}" font-size="{int(r * 0.22)}" font-weight="800" '
            f'fill="{p.accent_ink}" text-anchor="middle" letter-spacing="3">{escape(bottom)}</text>')


@dataclass
class _Middle:
    top: int
    head_lines: list[str]
    head_size: int
    sup_lines: list[str]
    sup_size: int
    badge_r: int
    bottom: int  # y where the middle block ends


def _fit_middle(copy: CreativeCopy, w: int, pad: int, tall: bool, top: int, limit: int) -> _Middle:
    """Headline, support line and offer badge sized to end above `limit`.

    Gives up space in this order: support lines, then headline and badge size together.
    """
    head_base, head_max = (120, 4) if tall else (104, 3)
    badge_ratio = 0.17 if tall else 0.15
    has_badge = bool(copy.discount or copy.price)
    price_line = 60 if copy.discount and copy.price else 0
    plan = None
    for sup_max in ([3, 2, 1, 0] if copy.support else [0]):
        for scale in (1.0, 0.86, 0.74, 0.64, 0.55):
            lines_max = head_max if scale > 0.7 else max(2, head_max - 1)
            head_lines, head_size = _fit(copy.headline, w - 2 * pad, int(head_base * scale), lines_max)
            y = top + head_size + int(len(head_lines) * head_size * 1.08)
            sup_lines, sup_size = [], 0
            if sup_max:
                sup_lines, sup_size = _fit(copy.support, w - 2 * pad - 40, int(46 * max(scale, 0.75)), sup_max)
                y += 30 + int(len(sup_lines) * sup_size * 1.3)
            r = int(w * badge_ratio * max(scale, 0.6)) if has_badge else 0
            if r:
                y += 2 * r + 40 + price_line  # badge bottom edge (+ the price line under it)
            plan = _Middle(top, head_lines, head_size, sup_lines, sup_size, r, y)
            if y <= limit:
                return plan
    return plan


def compose_image(fmt: str, copy: CreativeCopy) -> str:
    w, h = SIZES.get(fmt, (1080, 1080))
    p = palette_for(copy.category, copy.brand, copy.headline)
    pad = 80
    tall = h / w > 1.5
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" overflow="hidden">',
             f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{p.bg1}"/>'
             f'<stop offset="1" stop-color="{p.bg2}"/></linearGradient></defs>',
             f'<rect width="{w}" height="{h}" fill="url(#g)"/>', _decor(w, h, p)]

    y = pad + 40
    brand_lines, _ = _fit(copy.brand.upper(), w - 2 * pad, 44, 1)
    block, y = _text_block(brand_lines, w // 2, y, 44, p.soft, 800)
    parts.append(block.replace('text-anchor="middle"', 'text-anchor="middle" letter-spacing="6"'))
    parts.append(f'<rect x="{w // 2 - 60}" y="{y - 10}" width="120" height="6" rx="3" fill="{p.accent}"/>')
    if copy.slide_label:
        parts.append(f'<text x="{w - pad}" y="{pad + 40}" font-family="{FONT}" font-size="30" font-weight="700" '
                     f'fill="{p.soft}" text-anchor="end">{escape(copy.slide_label)}</text>')

    # The bottom band (date, CTA, place) is pinned to the bottom edge. The middle (headline, support,
    # badge) must end above it, so shrink the middle until it fits instead of letting it run over.
    bottom_y = h - pad - (220 if tall else 150)
    when_lines, when_size = _fit(copy.when, w - 2 * pad, 40, 1) if copy.when else ([], 0)
    limit = (bottom_y - 30 - when_size - 24) if copy.when else bottom_y - 24
    m = _fit_middle(copy, w, pad, tall, y + int(h * (0.10 if tall else 0.06)), limit)

    block, y = _text_block(m.head_lines, w // 2, m.top + m.head_size, m.head_size, p.ink, 900, leading=1.08)
    parts.append(block)

    if m.sup_lines:
        block, y = _text_block(m.sup_lines, w // 2, y + 30, m.sup_size, p.soft, 500, leading=1.3)
        parts.append(block)

    if m.badge_r:
        cy = y + m.badge_r + 40
        top = copy.discount.replace(" off", "").replace(" OFF", "") if copy.discount else copy.price
        bottom = "OFF" if copy.discount and "%" in copy.discount else ("ONLY" if not copy.discount else "OFFER")
        parts.append(_badge(w // 2, cy, m.badge_r, p, top, bottom))
        y = cy + m.badge_r + 30
        if copy.discount and copy.price:
            parts.append(f'<text x="{w // 2}" y="{y + 40}" font-family="{FONT}" font-size="44" font-weight="800" '
                         f'fill="{p.ink}" text-anchor="middle">{escape(copy.price)}</text>')
            y += 60

    if when_lines:
        block, _ = _text_block(when_lines, w // 2, bottom_y - 30, when_size, p.accent, 700)
        parts.append(block)
    if copy.cta:
        cta = copy.cta if len(copy.cta) <= 34 else copy.cta[:33] + "…"
        bw = min(w - 2 * pad, int(len(cta) * 30 + 140))
        parts.append(f'<rect x="{(w - bw) // 2}" y="{bottom_y + 10}" width="{bw}" height="96" rx="48" fill="{p.accent}"/>'
                     f'<text x="{w // 2}" y="{bottom_y + 72}" font-family="{FONT}" font-size="42" font-weight="800" '
                     f'fill="{p.accent_ink}" text-anchor="middle">{escape(cta)}</text>')
    if copy.place:
        parts.append(f'<text x="{w // 2}" y="{h - pad + 10}" font-family="{FONT}" font-size="32" font-weight="600" '
                     f'fill="{p.soft}" text-anchor="middle" opacity="0.85">📍 {escape(copy.place)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def compose_storyboard(copy: CreativeCopy, scenes: list[dict], duration_s: int = 10) -> str:
    """Animated vertical storyboard (SVG/SMIL): each scene's on-screen text, in sequence, looping."""
    w, h = SIZES["reel"]
    p = palette_for(copy.category, copy.brand, copy.headline)
    scenes = [s for s in scenes if (s.get("overlay_text") or s.get("visual"))] or [{"overlay_text": copy.headline}]
    if copy.cta and not any(copy.cta == s.get("overlay_text") for s in scenes):
        scenes = [*scenes, {"overlay_text": copy.cta, "visual": "End card"}]
    n = len(scenes)
    dur = max(duration_s, 2 * n)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" overflow="hidden">',
             f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{p.bg1}"/>'
             f'<stop offset="1" stop-color="{p.bg2}"/></linearGradient></defs>',
             f'<rect width="{w}" height="{h}" fill="url(#g)"/>', _decor(w, h, p),
             f'<text x="{w // 2}" y="150" font-family="{FONT}" font-size="44" font-weight="800" fill="{p.soft}" '
             f'text-anchor="middle" letter-spacing="6">{escape(copy.brand.upper())}</text>']
    for i, s in enumerate(scenes):
        a, b = i / n, (i + 1) / n
        if i == 0:
            key_times, values = [0.0, b], ["1", "0"]
        elif i == n - 1:
            key_times, values = [0.0, a], ["0", "1"]
        else:
            key_times, values = [0.0, a, b], ["0", "1", "0"]
        anim = (f'<animate attributeName="opacity" dur="{dur}s" repeatCount="indefinite" calcMode="discrete" '
                f'keyTimes="{";".join(f"{t:.4f}" for t in key_times)}" values="{";".join(values)}"/>')
        text = s.get("overlay_text") or s.get("visual") or ""
        lines, size = _fit(text, w - 160, 110, 4)
        block, y = _text_block(lines, w // 2, int(h * 0.42), size, p.ink, 900, leading=1.08)
        visual = s.get("visual") or ""
        vis = ""
        if visual and visual != text:
            vlines, vsize = _fit(f"🎬 {visual}", w - 200, 36, 2)
            vis, _ = _text_block(vlines, w // 2, y + 60, vsize, p.soft, 500, leading=1.3)
        parts.append(f'<g opacity="{"1" if i == 0 else "0"}">{anim}{block}{vis}'
                     f'<text x="{w // 2}" y="{h - 260}" font-family="{FONT}" font-size="30" fill="{p.soft}" '
                     f'text-anchor="middle" opacity="0.8">Scene {i + 1} of {n}{" · " + escape(s["t"]) if s.get("t") else ""}</text></g>')
    if copy.discount or copy.price:
        disc = copy.discount if not copy.discount or "off" in copy.discount.lower() else f"{copy.discount} OFF"
        label = " | ".join(x for x in (disc, copy.price) if x)
        parts.append(f'<rect x="{w // 2 - 260}" y="{h - 420}" width="520" height="100" rx="50" fill="{p.accent}"/>'
                     f'<text x="{w // 2}" y="{h - 352}" font-family="{FONT}" font-size="48" font-weight="900" '
                     f'fill="{p.accent_ink}" text-anchor="middle">{escape(label)}</text>')
    parts.append(f'<rect x="80" y="{h - 140}" width="{w - 160}" height="10" rx="5" fill="{p.soft}" opacity="0.25"/>'
                 f'<rect x="80" y="{h - 140}" width="0" height="10" rx="5" fill="{p.accent}">'
                 f'<animate attributeName="width" from="0" to="{w - 160}" dur="{dur}s" repeatCount="indefinite"/></rect>')
    if copy.place:
        parts.append(f'<text x="{w // 2}" y="{h - 70}" font-family="{FONT}" font-size="32" fill="{p.soft}" '
                     f'text-anchor="middle" opacity="0.85">📍 {escape(copy.place)}</text>')
    parts.append("</svg>")
    return "".join(parts)
