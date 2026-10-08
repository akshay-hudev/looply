"""Deterministic stand-in for Agnes used by DEMO_MODE and the test-suite.

It reads the agent marker + JSON payload that `agents.base.render_payload` sends and returns schema-valid
JSON built from the payload's own facts, so the whole pipeline can run offline.
"""

import hashlib
import json
import re

from app.agents.base import AGENT_MARKER
from app.services.model_gateway import ModelGateway, set_gateway
from app.services.model_gateway.base import ChatMessage
from app.services.model_gateway.fake import FakeProvider

CITIES = ["Bengaluru", "Bangalore", "Mysuru", "Chennai", "Hyderabad", "Mumbai", "Pune", "Delhi", "Kolkata",
          "Ahmedabad", "Kochi", "Jaipur", "Lucknow"]
LANG_WORDS = {"kannada": "kn", "hindi": "hi", "english": "en", "tamil": "ta", "telugu": "te", "marathi": "mr",
              "bengali": "bn", "malayalam": "ml", "gujarati": "gu", "punjabi": "pa", "urdu": "ur"}


def _h(text: str, lo: int, hi: int) -> int:
    return lo + int(hashlib.sha256(text.encode()).hexdigest(), 16) % (hi - lo + 1)


def _offer(p: dict) -> dict:
    return p.get("offer_locked") or p.get("offer") or {}


def _facts_line(o: dict) -> str:
    bits = [o.get("product") or "our special"]
    if o.get("price"):
        bits.append(f"at {o['price']}")
    if o.get("discount"):
        bits.append(f"with {o['discount']} off")
    if o.get("duration_text"):
        bits.append(o["duration_text"])
    return " ".join(bits)


def campaign_manager(p: dict) -> dict:
    msg = p["owner_message"]
    existing = p.get("existing_campaign") or {}
    offer = {}
    if m := re.search(r"(₹\s?\d+|rs\.?\s?\d+)", msg, re.I):
        offer["price"] = "₹" + re.sub(r"\D", "", m.group(1))
    if m := re.search(r"(\d+)\s?%", msg):
        offer["discount"] = f"{m.group(1)}%"
    if m := re.search(r"(?:new|our|the)\s+([a-z]+(?:\s[a-z]+)?)\s+(?:for|at|is)", msg, re.I):
        offer["product"] = m.group(1).title()
    for phrase in ("this weekend", "today", "tomorrow", "this week", "this month"):
        if phrase in msg.lower():
            offer["duration_text"] = phrase
    city = next((c for c in CITIES if c.lower() in msg.lower()), None)
    audience = None
    if m := re.search(r"more[ \t]+([a-z]+(?:[ \t]+[a-z]+)?)", msg, re.I):
        audience = m.group(1).rstrip(". ")
    if "student" in msg.lower():
        audience = "College students"
    objective = f"Increase {audience.lower()} visits" if audience else (existing.get("objective") or None)
    langs = [code for word, code in LANG_WORDS.items() if word in msg.lower()]
    is_change = bool(existing.get("offer", {}).get("discount")) and "discount" in offer and \
        offer["discount"] != existing["offer"]["discount"]
    has_product = offer.get("product") or (existing.get("offer") or {}).get("product")
    missing = [] if has_product else ["product"]
    if not objective:
        missing.append("objective")
    return {
        "summary": f"Campaign for {offer.get('product') or 'the business'}" + (f" targeting {audience}" if audience else ""),
        "input_language": "en",
        "business_category": None if p["business_record"].get("category") else ("Cafe" if "cafe" in msg.lower() else None),
        "location": {"city": city},
        "objective": objective,
        "target_audience": audience,
        "offer": offer,
        "languages_requested": langs,
        "is_change_request": is_change,
        "missing_info": missing,
        "clarifying_questions": ["What product or service is this campaign for?"] if "product" in missing else [],
    }


def business(p: dict) -> dict:
    prof = p.get("existing_profile") or {}
    product = _offer(p).get("product")
    return {
        "name": prof.get("name"), "category": prof.get("category") or "Local business",
        "description": f"A neighbourhood {prof.get('category') or 'business'}",
        "products": list(dict.fromkeys([*(prof.get("products") or []), *([product] if product else [])])),
        "personality": prof.get("personality") or ["Youthful", "Friendly", "Affordable"],
        "brand_voice": prof.get("brand_voice") or "Warm, playful and budget-friendly; talks like a friendly neighbour.",
        "preferred_languages": prof.get("preferred_languages") or ["en"],
    }


def locality(p: dict) -> dict:
    data = p["verified_locality"]
    insights = []
    for s in data.get("signals", [])[:4]:
        meaning = {"college": "Students are a highly relevant audience; evenings and weekends work well.",
                   "office": "Professionals nearby suggest lunch-time and after-work messaging.",
                   "residential": "Families nearby respond to community and weekend messaging."}.get(
            s["type"], f"{s['count']} {s['type'].replace('_', ' ')} places nearby shape foot traffic.")
        insights.append({"signal": s["type"], "interpretation": meaning, "relevance": "high" if s["count"] > 3 else "medium"})
    if data.get("language_signals"):
        insights.append({"signal": "language", "interpretation":
                         f"Local language {data['language_signals'][0]['language']} plus English fits this city.",
                         "relevance": "high"})
    return {"summary": f"{len(insights)} verified locality signals interpreted.", "insights": insights}


def audience(p: dict) -> dict:
    hint = p.get("owner_target_audience") or "Local residents"
    return {"segments": [
        {"name": hint, "priority": "primary", "motivation": "Affordable + trendy", "tone": "Fun",
         "platforms": ["instagram", "whatsapp"], "languages": ["en", "kn"], "formats": ["reel", "story"]},
        {"name": "Working professionals", "priority": "secondary", "motivation": "Convenience + quality",
         "tone": "Professional", "platforms": ["whatsapp", "linkedin"], "languages": ["en"], "formats": ["post"]},
    ]}


def strategy(p: dict) -> dict:
    req = p.get("owner_requested") or {}
    langs = req.get("languages") or [l["language"] for l in (p.get("locality") or {}).get("language_signals", [])[:1]] + ["en"]
    return {
        "objective": p.get("objective") or "Increase visits",
        "primary_audience": (p.get("audiences") or [{}])[0].get("name", "Local customers"),
        "secondary_audiences": [a["name"] for a in (p.get("audiences") or [])[1:]],
        "platforms": ["instagram", "whatsapp"],
        "formats": req.get("formats") or {"instagram": ["post", "story", "reel"], "whatsapp": ["message", "offer_card"]},
        "languages": list(dict.fromkeys(langs)),
        "code_switching": True, "code_switching_style": "Local language with natural English words",
        "tone": "Fun + youthful + local",
        "posting_schedule": [{"platform": "instagram", "day": "Friday", "time": "18:00", "reason": "Pre-weekend browsing"},
                             {"platform": "whatsapp", "day": "Saturday", "time": "10:00", "reason": "Weekend plans"}],
        "rationale": "Instagram reaches the primary audience visually; WhatsApp drives direct visits.",
    }


# Category-aware creative bank: lets offline/demo runs produce specific, sensory copy from thin briefs.
CREATIVE_BANK = {
    "food": {
        "keys": ("restaurant", "cafe", "café", "coffee", "bakery", "food", "kitchen", "bistro", "dhaba", "eatery",
                 "continental", "biryani", "pizza", "juice", "tea", "dessert", "sweet"),
        "sense": ("one bite and you'll be planning the next visit", "the aroma finds you before the menu does",
                  "plated fresh, every single time"),
        "hooks": ("Your new favourite table is in {place}", "Follow the aroma to {name}",
                  "{product}, the way it should taste"),
        "moments": ("the after-work catch-up", "a slow Sunday lunch", "that first-date dinner"),
        "hero": "{product} plated beautifully, steam rising, close-up at 45 degrees",
        "scenes": ("Steam rising off a fresh plate", "Hands passing a plate across the table",
                   "Friends laughing over the first bite"),
        "cta": ("Book your table", "Come hungry", "Tag who you'd bring"),
        "tags": ("Eats", "Foodie", "FoodScene"),
    },
    "beauty": {
        "keys": ("salon", "spa", "beauty", "barber", "hair", "nail", "makeup", "parlour", "grooming"),
        "sense": ("leave lighter than you walked in", "that second look in the mirror",
                  "an hour that is completely yours"),
        "hooks": ("That mirror moment, in {place}", "An hour that's all yours", "Walk in. Glow out."),
        "moments": ("before the big day", "a Saturday reset", "the post-work unwind"),
        "hero": "a confident client in the mirror, soft studio light, clean modern salon interior",
        "scenes": ("Close-up of scissors and a fresh fade", "Client's reveal in the mirror", "A confident smile walking out"),
        "cta": ("Book your slot", "Walk in today", "DM us to book"),
        "tags": ("Salon", "Glow", "SelfCare"),
    },
    "fitness": {
        "keys": ("gym", "fitness", "yoga", "studio", "crossfit", "dance", "martial", "pilates", "sports"),
        "sense": ("the hardest part is walking in, we'll handle the rest", "feel the difference by week two",
                  "coaches who actually know your name"),
        "hooks": ("Your first rep starts in {place}", "Stronger starts this week", "Show up. We'll do the rest."),
        "moments": ("the early-morning start", "the after-work reset", "the weekend challenge"),
        "hero": "people mid-workout with focused energy, dramatic side light, modern studio",
        "scenes": ("Chalked hands gripping a bar", "Group class moving in sync", "High-five after the last rep"),
        "cta": ("Book a trial class", "Start this week", "Bring a workout buddy"),
        "tags": ("Fitness", "Fit", "Workout"),
    },
    "retail": {
        "keys": ("store", "shop", "boutique", "fashion", "clothing", "jewel", "electronics", "mart", "books", "gift"),
        "sense": ("the kind of find you tell your friends about", "picked by people who care about the details",
                  "new pieces, worth the trip"),
        "hooks": ("Just landed in {place}", "The find you've been looking for", "{product}, picked for you"),
        "moments": ("the festive shopping list", "a gift that feels personal", "the weekend browse"),
        "hero": "{product} styled on a clean surface, soft natural light, premium editorial look",
        "scenes": ("Hands unwrapping a new find", "Close-up of textures and details", "A happy customer at the counter"),
        "cta": ("Visit the store", "DM to reserve", "Come browse"),
        "tags": ("Shopping", "Style", "Finds"),
    },
    "learning": {
        "keys": ("tuition", "coaching", "school", "academy", "class", "institute", "training", "course"),
        "sense": ("small batches, so every question gets answered", "the moment it finally clicks",
                  "progress you can see"),
        "hooks": ("That 'I get it now' moment", "Confidence starts in {place}", "Learn it properly. Finally."),
        "moments": ("exam season", "a new term", "the summer break"),
        "hero": "a focused learner with a mentor, warm classroom light, notebooks and a whiteboard",
        "scenes": ("A pen solving a problem", "Mentor explaining with a smile", "Student's proud moment"),
        "cta": ("Book a free demo", "Call to enquire", "Reserve a seat"),
        "tags": ("Learning", "Students", "Education"),
    },
    "general": {
        "keys": (),
        "sense": ("made with care, right around the corner", "the neighbourhood spot you'll keep coming back to",
                  "small details, done properly"),
        "hooks": ("Something new in {place}", "Meet {name}", "Right around the corner from you"),
        "moments": ("your weekend plans", "the everyday routine", "a quick stop on the way home"),
        "hero": "{product} presented beautifully, warm natural light, inviting neighbourhood setting",
        "scenes": ("A welcoming open door", "Close-up of the hero product", "A smiling customer"),
        "cta": ("Visit us", "Drop by today", "Message us"),
        "tags": ("Local", "SupportLocal", "Neighbourhood"),
    },
}


def _creative(p: dict) -> dict:
    """Merge the brief, business profile, offer and place into one creative fact sheet."""
    brief, prof, place, o = p.get("owner_brief") or {}, p.get("business_profile") or {}, p.get("place") or {}, _offer(p)
    name = prof.get("name") or (p.get("business") or {}).get("name") or "us"
    category = prof.get("category") or ""
    probe = " ".join(str(x) for x in (category, name, o.get("product"), brief.get("product"), prof.get("description")) if x).lower()
    kind = next((k for k, b in CREATIVE_BANK.items() if any(w in probe for w in b["keys"])), "general")
    area = place.get("area") or ""
    city = place.get("city") or ""
    region = brief.get("region") or ", ".join(x for x in (area, city) if x)
    return {
        "name": name, "kind": kind, "bank": CREATIVE_BANK[kind], "category": category or "local business",
        "product": o.get("product") or brief.get("product") or name,
        "audience": p.get("audience_hint") or brief.get("audience") or "",
        "place": area or city or region.split(",")[0].strip() or "your neighbourhood",
        "city": city, "tag_place": re.sub(r"[^A-Za-z]", "", area or city or "Local") or "Local",
        "occasion": p.get("occasion") or brief.get("occasion") or "",
        "highlights": brief.get("highlights") or "", "tone": brief.get("tone") or "",
        "price": o.get("price") or "", "discount": o.get("discount") or "", "when": o.get("duration_text") or "",
        "sparse": p.get("input_richness") == "sparse",
    }


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def _fill(tpl: str, c: dict) -> str:
    generic = {"food": "Good food", "beauty": "Great hair days", "fitness": "Real results", "retail": "The good stuff",
               "learning": "Learning", "general": "Something good"}[c["kind"]]
    return tpl.format(place=c["place"], name=c["name"], product=c["product"] if c["product"] != c["name"] else generic)


def _offer_line(c: dict) -> str:
    """The locked facts as a phrase, or '' when there is no offer (never invent one)."""
    deal = " ".join(b for b in (c["discount"] and f"{c['discount']} off", c["when"]) if b)
    if c["price"]:
        return f"{c['price']}, now {deal}" if c["discount"] else f"{c['price']} {c['when']}".strip()
    return deal


def content_director(p: dict) -> dict:
    c, must = _creative(p), (p.get("core_message") or {}).get("must_include") or []
    concept = _fill(c["bank"]["hooks"][0], c)
    hooks = {"reel": "Open on motion: a sensory close-up in the first second", "story": "One bold line, big type",
             "carousel": "Slide 1 asks a question the audience feels", "message": "Personal note from the owner",
             "offer_card": "The offer in one glance", "poster": "One hero visual, the campaign line, nothing else"}
    return {"briefs": [{"platform": a["platform"], "format": a["format"],
                        "angle": f"{concept}: {c['bank']['moments'][i % 3]}" + (f" for {c['audience']}" if c["audience"] else ""),
                        "hook_direction": hooks.get(a["format"], "Lead with the feeling, then the reason to visit"),
                        "visual_direction": f"{_fill(c['bank']['hero'], c)}; setting rooted in {c['place']}",
                        "key_points": must} for i, a in enumerate(p["assets_to_produce"])]}


def text(p: dict) -> dict:
    o, c = _offer(p), _creative(p)
    must = [v for v in (o.get("discount") and f"{o['discount']} off", o.get("price"), o.get("duration_text")) if v]
    offer = _offer_line(c)
    lead = c["name"] if c["product"] == c["name"] else f"{c['product']} at {c['name']}"
    key = f"{lead} in {c['place']}" + (f": {offer}." if offer else f", made for {c['bank']['moments'][0]}.")
    who = c["audience"] or "people nearby"
    return {"headline": _fill(c["bank"]["hooks"][0], c), "key_message": key,
            "value_props": [_cap(c["bank"]["sense"][0]), f"Made for {who.lower()} in {c['place']}",
                            f"Perfect for {c['bank']['moments'][1]}"],
            "must_include": must, "cta_options": list(c["bank"]["cta"])}


def _variant(label: str, fmt: str, c: dict) -> dict:
    i = "ABC".index(label)
    bank, offer = c["bank"], _offer_line(c)
    hook = _fill(bank["hooks"][i], c)
    moment, sense, cta = bank["moments"][i], bank["sense"][i % len(bank["sense"])], bank["cta"][i]
    who = f" for {c['audience'].lower()}" if c["audience"] else ""
    occasion = f" this {c['occasion']}" if c["occasion"] else ""
    offer_s = f" {_cap(offer)}." if offer else ""
    what = c["product"] if c["product"] != c["name"] else ""
    lead = f"{what} at {c['name']}" if what else c["name"]
    third = f"{what}{who}{occasion}. " if what else (f"Made{who}{occasion}. " if who or occasion else "")
    body = {
        0: f"{lead}{who}, made for {moment}{occasion}. {_cap(sense)}.{offer_s}",
        1: f"Where does {c['place']} go for {moment}? Now you know: {c['name']}. {_cap(sense)}.{offer_s}",
        2: f"New in {c['place']}: {c['name']}. {third}{_cap(sense)}.{offer_s}",
    }[i].replace("  ", " ").strip()
    v = {"label": label, "headline": hook, "hook": hook, "body": body, "cta": cta,
         "hashtags": [f"#{c['tag_place']}{bank['tags'][0]}", f"#{c['tag_place']}", f"#{bank['tags'][1]}",
                      f"#{bank['tags'][2]}", "#SupportLocal"] if fmt not in ("message", "offer_card") else [],
         "visual_brief": f"{_fill(bank['hero'], c)}, set in {c['place']}" + (f", '{offer}' badge" if offer else "")}
    if fmt == "story":
        v["body"] = _cap(offer) if offer else _cap(sense)
    if fmt == "reel":
        v["video_script"] = {"duration_s": 12, "aspect_ratio": "9:16", "scenes": [
            {"t": "0-2s", "visual": bank["scenes"][0], "overlay_text": hook},
            {"t": "2-6s", "visual": bank["scenes"][1], "overlay_text": _cap(moment)},
            {"t": "6-10s", "visual": bank["scenes"][2], "overlay_text": offer.upper() if offer else f"Only at {c['name']}"},
            {"t": "10-12s", "visual": "End card with the business name", "overlay_text": cta}]}
    if fmt == "carousel":
        v["slides"] = [hook, f"Made for {moment}", _cap(sense), *([_cap(offer)] if offer else []),
                       f"{cta} · {c['name']}, {c['place']}"]
    if fmt == "message":
        opener = ["Good news from", "Something new at", "A little note from"][i]
        v["body"] = (f"Hi {{{{1}}}}! {opener} {c['name']} in {c['place']}. {f'Our {what} is ready for you' if what else 'Our doors are open for you'}. "
                     f"{_cap(sense)}.{offer_s} Reply YES and we'll save you a spot!")
        v["cta"] = "Reply YES"
    if fmt == "offer_card":
        v["headline"] = offer.upper() if offer else hook
        v["body"] = lead
    return v


def platform(p: dict) -> dict:
    c = _creative(p)
    return {"assets": [{"format": f, "variants": [_variant(l, f, c) for l in "ABC"]} for f in p["formats"]]}


LOCAL = {
    "kn": ("ಈ ವೀಕೆಂಡ್ {product} ಕೇವಲ {price}!", "{discount} ರಿಯಾಯಿತಿ - ಬನ್ನಿ, ಎಂಜಾಯ್ ಮಾಡಿ!", "ಇಂದೇ ಬನ್ನಿ"),
    "hi": ("इस वीकेंड {product} सिर्फ {price} में!", "{discount} की छूट - आज ही आइए!", "आज ही आइए"),
    "ta": ("இந்த வீக்கெண்ட் {product} வெறும் {price}!", "{discount} தள்ளுபடி - வாங்க!", "இன்றே வாருங்கள்"),
    "te": ("ఈ వీకెండ్ {product} కేవలం {price}!", "{discount} తగ్గింపు - రండి!", "ఈరోజే రండి"),
}
LOCAL_NO_OFFER = {
    "kn": ("{product} - ನಿಮ್ಮ ಹೊಸ ಫೇವರಿಟ್ ಜಾಗ", "ಒಮ್ಮೆ ಬನ್ನಿ, ರುಚಿ ನೋಡಿ!", "ಇಂದೇ ಬನ್ನಿ"),
    "hi": ("{product} - आपकी नई पसंदीदा जगह", "एक बार आइए, फिर बार-बार आएंगे!", "आज ही आइए"),
    "ta": ("{product} - உங்கள் புதிய ஃபேவரிட்", "ஒருமுறை வாங்க, மீண்டும் வருவீங்க!", "இன்றே வாருங்கள்"),
    "te": ("{product} - మీ కొత్త ఫేవరెట్", "ఒక్కసారి రండి, మళ్ళీ మళ్ళీ వస్తారు!", "ఈరోజే రండి"),
}


def language_culture(p: dict) -> dict:
    o, code = _offer(p), p["target_language"]["code"]
    tpl = LOCAL.get(code)
    out = []
    for v in p["variants_to_adapt"]:
        src = v["original_english"]
        cands = []
        for i in range(3):
            if code in LOCAL_NO_OFFER and not (o.get("price") or o.get("discount")):
                head, body, cta = (t.format(product=o.get("product") or "", name=p.get("business_name") or "")
                                   for t in LOCAL_NO_OFFER[code])
            elif tpl:
                head, body, cta = (t.format(product=o.get("product") or "", price=o.get("price") or "",
                                            discount=o.get("discount") or "") for t in tpl)
            else:
                head, body, cta = f"[{code}] {src['headline']}", f"[{code}] {src['body']}", f"[{code}] {src['cta']}"
            copy = {**src, "headline": head, "hook": head, "body": body, "cta": cta}
            if src.get("video_script"):
                copy["video_script"] = src["video_script"]
            cands.append({"adaptation": copy, "scores": {
                "naturalness": 9 - i, "catchiness": 8 - i % 2, "cultural_fit": 9 - i, "meaning_preservation": 10 - i,
                "platform_fit": 8}})
        out.append({"label": v["label"], "candidates": cands,
                    "back_translation": f"This weekend {_facts_line(o)}. Come and enjoy!",
                    "cultural_notes": "Uses a friendly local register with common English words like 'weekend'."})
    return {"variants": out}


def truth(p: dict) -> dict:
    return {"results": [{"asset_id": a["asset_id"], "back_translation": a["text"][:300], "issues": [], "verdict": "PASS"}
                        for a in p["assets"]]}


def performance(p: dict) -> dict:
    scores = []
    for v in p["variants"]:
        s = _h(v["text"], 62, 88)
        scores.append({"asset_id": v["asset_id"], "predicted_score": s, "hook_strength": s, "clarity": min(s + 5, 100),
                       "cta_strength": s - 4, "platform_fit": min(s + 2, 100), "local_relevance": s,
                       "rationale": "Clear offer; hook strength drives the difference."})
    return {"scores": scores}


def optimizer(p: dict) -> dict:
    cur = p["current"]
    return {"critique": "CTA could be more specific.", "changes": ["Made the CTA more specific"],
            "improved": {**cur, "cta": (cur.get("cta") or "Visit us") + " ☕"}}


def visual(p: dict) -> dict:
    o, c = _offer(p), _creative(p)
    overlay = " | ".join(x for x in (o.get("discount") and f"{o['discount']} OFF", o.get("price")) if x)
    city = (p.get("locality") or {}).get("city") or c["city"]
    return {"prompt": f"{_fill(c['bank']['hero'], c)}, set in {c['place']}{', ' + city if city and city != c['place'] else ''}; "
                      f"rule of thirds with clean negative space at the top for the headline; warm golden-hour light; "
                      f"palette of deep brown, cream and saffron; editorial photography, premium but approachable",
            "negative_prompt": "distorted or misspelt text, watermarks, clutter, stereotypes, extra fingers, fake signage",
            "overlay_text": overlay, "aspect_ratio": p.get("default_aspect_ratio", "1:1"),
            "style_notes": "Bold rounded sans headline, cream on a dark band"}


def video(p: dict) -> dict:
    o, c = _offer(p), _creative(p)
    hook, scenes = _fill(c["bank"]["hooks"][0], c), c["bank"]["scenes"]
    offer = " | ".join(x for x in (o.get("discount") and f"{o['discount']} OFF", o.get("price")) if x)
    return {"prompt": f"12s vertical reel for {c['name']}: {scenes[0].lower()}, then {scenes[1].lower()}, "
                      f"then {scenes[2].lower()}; handheld, warm light, quick cuts on the beat, end card",
            "duration_s": 12, "aspect_ratio": "9:16", "hook": hook,
            "scenes": [{"t": "0-2s", "visual": scenes[0], "overlay_text": hook},
                       {"t": "2-6s", "visual": scenes[1], "overlay_text": _cap(c["bank"]["moments"][0])},
                       {"t": "6-10s", "visual": scenes[2], "overlay_text": offer or f"Only at {c['name']}"},
                       {"t": "10-12s", "visual": "End card with the business name", "overlay_text": c["bank"]["cta"][0]}],
            "cta": c["bank"]["cta"][0]}


def analytics(p: dict) -> dict:
    rows = p.get("actual_metrics") or []
    best = max(rows, key=lambda r: r.get("metrics", {}).get("engagement_rate", 0), default=None)
    learnings = []
    if best:
        learnings.append({"insight": f"{best['platform']} {best['format']} had the best engagement",
                          "evidence": json.dumps(best.get("metrics", {})),
                          "recommendation": f"Lead with {best['platform']} next time"})
    return {"summary": f"{len(rows)} published assets analysed.", "learnings": learnings,
            "prediction_accuracy": "Tentative: limited data."}


HANDLERS = {
    "campaign_manager": campaign_manager, "business": business, "locality": locality, "audience": audience,
    "strategy": strategy, "content_director": content_director, "text": text, "language_culture": language_culture,
    "truth": truth, "performance": performance, "optimizer": optimizer, "visual": visual, "video": video,
    "analytics": analytics,
}


def parse_request(messages: list[ChatMessage]) -> tuple[str, dict]:
    user = next(m for m in messages if m.role == "user")
    first, _, rest = str(user.content).partition("\n")
    return first.removeprefix(AGENT_MARKER).strip(), json.loads(rest)


def demo_responder(messages: list[ChatMessage]) -> str:
    agent, payload = parse_request(messages)
    handler = platform if agent.startswith("platform_") else HANDLERS[agent]
    return json.dumps(handler(payload), ensure_ascii=False)


def demo_gateway(responder=demo_responder) -> ModelGateway:
    fake = FakeProvider(responder, name="demo")
    return ModelGateway({"demo": fake}, {"text": ["demo"], "image": ["demo"], "video": ["demo"]},
                        requests_per_minute=100000, max_retries=0)


def install_demo_gateway() -> None:
    set_gateway(demo_gateway())
