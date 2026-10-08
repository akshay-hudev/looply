"""Verified locality facts from places data. The LLM only interprets what this returns."""

import logging
import math

import httpx

from app.core.config import Settings, get_settings
from app.graph.state import LocalityContext, LocalitySignal

log = logging.getLogger(__name__)
USER_AGENT = "LocalMind/0.1 (local business marketing assistant)"

# OSM tag filters per signal type (Overpass QL fragments, applied to nodes/ways within radius).
OSM_SIGNALS: dict[str, list[str]] = {
    "college": ['["amenity"~"^(college|university)$"]'],
    "school": ['["amenity"="school"]'],
    "office": ['["office"]', '["landuse"="commercial"]["name"]', '["building"="office"]'],
    "residential": ['["landuse"="residential"]', '["building"="apartments"]'],
    "shopping": ['["shop"="mall"]', '["amenity"="marketplace"]', '["shop"="supermarket"]'],
    "transit": ['["railway"="station"]', '["amenity"="bus_station"]', '["station"="subway"]'],
    "cafe_restaurant": ['["amenity"~"^(cafe|restaurant|fast_food)$"]'],
    "hospital": ['["amenity"~"^(hospital|clinic)$"]'],
    "gym_sports": ['["leisure"~"^(fitness_centre|sports_centre)$"]'],
    "worship": ['["amenity"="place_of_worship"]'],
    "entertainment": ['["amenity"~"^(cinema|theatre)$"]', '["leisure"="park"]["name"]'],
}

GOOGLE_TYPES: dict[str, list[str]] = {
    "college": ["university"],
    "school": ["school", "primary_school", "secondary_school"],
    "office": ["corporate_office"],
    "shopping": ["shopping_mall", "market", "supermarket"],
    "transit": ["train_station", "bus_station", "subway_station"],
    "cafe_restaurant": ["cafe", "restaurant"],
    "hospital": ["hospital"],
    "gym_sports": ["gym"],
    "worship": ["hindu_temple", "mosque", "church"],
    "entertainment": ["movie_theater", "park"],
}

# City -> languages commonly used there (deterministic, not model-generated).
CITY_LANGUAGES: dict[str, list[str]] = {
    "bengaluru": ["kn", "en", "hi", "ta", "te"], "bangalore": ["kn", "en", "hi", "ta", "te"],
    "mysuru": ["kn", "en"], "mysore": ["kn", "en"], "mangaluru": ["kn", "en"], "hubli": ["kn", "en"],
    "chennai": ["ta", "en"], "coimbatore": ["ta", "en"], "madurai": ["ta", "en"],
    "hyderabad": ["te", "ur", "hi", "en"], "vijayawada": ["te", "en"], "visakhapatnam": ["te", "en"],
    "mumbai": ["mr", "hi", "en"], "pune": ["mr", "hi", "en"], "nagpur": ["mr", "hi", "en"],
    "delhi": ["hi", "en", "pa"], "new delhi": ["hi", "en", "pa"], "noida": ["hi", "en"], "gurugram": ["hi", "en"],
    "lucknow": ["hi", "ur", "en"], "jaipur": ["hi", "en"], "bhopal": ["hi", "en"], "patna": ["hi", "en"],
    "kolkata": ["bn", "hi", "en"], "ahmedabad": ["gu", "hi", "en"], "surat": ["gu", "hi", "en"],
    "kochi": ["ml", "en"], "thiruvananthapuram": ["ml", "en"], "kozhikode": ["ml", "en"],
    "chandigarh": ["pa", "hi", "en"], "amritsar": ["pa", "hi", "en"], "bhubaneswar": ["or", "en"],
    "guwahati": ["as", "en"],
}


def language_signals_for(city: str | None) -> list[dict]:
    langs = CITY_LANGUAGES.get((city or "").strip().lower(), [])
    return [
        {"language": code, "reason": "commonly used in " + (city or ""), "source": "city_language_map", "rank": i + 1}
        for i, code in enumerate(langs)
    ]


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


class LocalityService:
    def __init__(self, settings: Settings | None = None, client: httpx.AsyncClient | None = None):
        self.s = settings or get_settings()
        self._client = client

    def _http(self) -> httpx.AsyncClient:
        return self._client or httpx.AsyncClient(timeout=40, headers={"User-Agent": USER_AGENT})

    async def geocode(self, query: str) -> tuple[float, float] | None:
        if self.s.locality_provider == "google" and self.s.google_places_api_key:
            async with self._http() as c:
                r = await c.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    json={"textQuery": query},
                    headers={"X-Goog-Api-Key": self.s.google_places_api_key, "X-Goog-FieldMask": "places.location"},
                )
                places = (r.json().get("places") or []) if r.status_code == 200 else []
                if places:
                    loc = places[0]["location"]
                    return loc["latitude"], loc["longitude"]
                return None
        async with self._http() as c:
            r = await c.get(f"{self.s.nominatim_url}/search", params={"q": query, "format": "json", "limit": 1})
            data = r.json() if r.status_code == 200 else []
            return (float(data[0]["lat"]), float(data[0]["lon"])) if data else None

    async def _osm_signals(self, lat: float, lng: float, radius: int) -> list[LocalitySignal]:
        parts = []
        for sig, filters in OSM_SIGNALS.items():
            for f in filters:
                parts.append(f'nwr{f}(around:{radius},{lat},{lng});')
        # One query; tag each element client-side by re-matching its tags.
        query = f"[out:json][timeout:30];({''.join(parts)});out center tags 400;"
        async with self._http() as c:
            r = await c.post(self.s.overpass_url, data={"data": query})
            r.raise_for_status()
            elements = r.json().get("elements", [])
        buckets: dict[str, LocalitySignal] = {}
        for el in elements:
            tags = el.get("tags", {})
            sig = _classify_osm(tags)
            if not sig:
                continue
            elat = el.get("lat") or (el.get("center") or {}).get("lat")
            elng = el.get("lon") or (el.get("center") or {}).get("lon")
            dist = _distance_m(lat, lng, elat, elng) if elat and elng else None
            b = buckets.setdefault(sig, LocalitySignal(type=sig, source="openstreetmap"))
            b.count += 1
            name = tags.get("name:en") or tags.get("name")
            if name and name not in b.examples and len(b.examples) < 5:
                b.examples.append(name)
            if dist is not None and (b.nearest_m is None or dist < b.nearest_m):
                b.nearest_m = dist
        return sorted(buckets.values(), key=lambda s: -s.count)

    async def _google_signals(self, lat: float, lng: float, radius: int) -> list[LocalitySignal]:
        out = []
        async with self._http() as c:
            for sig, types in GOOGLE_TYPES.items():
                r = await c.post(
                    "https://places.googleapis.com/v1/places:searchNearby",
                    json={"includedTypes": types, "maxResultCount": 20, "locationRestriction": {
                        "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius)}}},
                    headers={"X-Goog-Api-Key": self.s.google_places_api_key,
                             "X-Goog-FieldMask": "places.displayName,places.location"},
                )
                if r.status_code != 200:
                    continue
                places = r.json().get("places") or []
                if not places:
                    continue
                dists = [_distance_m(lat, lng, p["location"]["latitude"], p["location"]["longitude"]) for p in places]
                out.append(LocalitySignal(
                    type=sig, count=len(places), nearest_m=min(dists), source="google_places",
                    examples=[p["displayName"]["text"] for p in places[:5]],
                ))
        return sorted(out, key=lambda s: -s.count)

    async def gather(self, *, lat: float | None, lng: float | None, address: str | None, city: str | None,
                     area: str | None) -> LocalityContext:
        ctx = LocalityContext(city=city, area=area, radius_m=self.s.locality_radius_m,
                              language_signals=language_signals_for(city))
        try:
            if lat is None or lng is None:
                query = ", ".join(p for p in (address, area, city) if p)
                coords = await self.geocode(query) if query else None
                if coords is None:
                    ctx.summary = "Location could not be geocoded; no verified locality data."
                    return ctx
                lat, lng = coords
            ctx.lat, ctx.lng = lat, lng
            use_google = self.s.locality_provider == "google" and self.s.google_places_api_key
            ctx.signals = await (self._google_signals if use_google else self._osm_signals)(lat, lng, self.s.locality_radius_m)
            ctx.data_source = "google_places" if use_google else "openstreetmap"
            ctx.verified = bool(ctx.signals)
        except (httpx.HTTPError, ValueError, KeyError) as e:
            log.warning("locality lookup failed: %s", e)
            ctx.summary = "Places data source unavailable; no verified locality data."
        return ctx


def _classify_osm(tags: dict) -> str | None:
    amenity, shop, leisure, landuse = tags.get("amenity"), tags.get("shop"), tags.get("leisure"), tags.get("landuse")
    if amenity in ("college", "university"):
        return "college"
    if amenity == "school":
        return "school"
    if tags.get("office") or tags.get("building") == "office" or (landuse == "commercial" and tags.get("name")):
        return "office"
    if landuse == "residential" or tags.get("building") == "apartments":
        return "residential"
    if shop in ("mall", "supermarket") or amenity == "marketplace":
        return "shopping"
    if tags.get("railway") == "station" or amenity == "bus_station" or tags.get("station") == "subway":
        return "transit"
    if amenity in ("cafe", "restaurant", "fast_food"):
        return "cafe_restaurant"
    if amenity in ("hospital", "clinic"):
        return "hospital"
    if leisure in ("fitness_centre", "sports_centre"):
        return "gym_sports"
    if amenity == "place_of_worship":
        return "worship"
    if amenity in ("cinema", "theatre") or (leisure == "park" and tags.get("name")):
        return "entertainment"
    return None
