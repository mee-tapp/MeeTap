#!/usr/bin/env python3
"""
Meetap – OpenStreetMap venue extractor from a Geofabrik .osm.pbf file.

Usage:
    python3 scripts/data/fetch-osm-pbf.py <area-name> <pbf> <south> <west> <north> <east> [out.json]

Same output shape as fetch-osm.mjs (Overpass), but works offline from a
country extract, so it never depends on public Overpass servers:

    curl -L -o data/raw/turkey-latest.osm.pbf https://download.geofabrik.de/europe/turkey-latest.osm.pbf
    python3 scripts/data/fetch-osm-pbf.py istanbul data/raw/turkey-latest.osm.pbf 40.80 27.95 41.35 29.95

Needs `pip install osmium`. Data © OpenStreetMap contributors, ODbL.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import osmium

if len(sys.argv) < 7:
    print(__doc__, file=sys.stderr)
    sys.exit(1)

area, pbf = sys.argv[1], sys.argv[2]
south, west, north, east = (float(x) for x in sys.argv[3:7])
out_path = Path(sys.argv[7]) if len(sys.argv) > 7 else Path("data/raw") / f"osm-{area}.json"

CATEGORY_MAP = {
    "cafe": "Cafés", "coffee_shop": "Cafés", "ice_cream": "Cafés",
    "restaurant": "Restaurants", "fast_food": "Restaurants", "food_court": "Restaurants",
    "bar": "Bars", "pub": "Bars", "nightclub": "Bars", "biergarten": "Bars",
    "attraction": "Activities", "museum": "Activities", "viewpoint": "Activities", "gallery": "Activities",
    "park": "Activities", "garden": "Activities", "cinema": "Activities", "theatre": "Activities",
    "bowling_alley": "Activities", "escape_game": "Activities",
}
AMENITY = {"cafe", "restaurant", "bar", "pub", "fast_food", "food_court", "ice_cream", "nightclub", "biergarten", "cinema", "theatre"}
TOURISM = {"attraction", "museum", "viewpoint", "gallery"}
LEISURE = {"park", "garden", "bowling_alley", "escape_game"}


def wanted(tags):
    if "name" not in tags:
        return None
    if tags.get("amenity") in AMENITY:
        return tags["amenity"]
    if tags.get("tourism") in TOURISM:
        return tags["tourism"]
    if tags.get("leisure") in LEISURE:
        return tags["leisure"]
    return None


def in_bbox(lat, lon):
    return south <= lat <= north and west <= lon <= east


def split_list(v):
    return [s.strip().lower() for s in v.split(";") if s.strip()] if v else []


def to_bool(v):
    return True if v == "yes" else False if v == "no" else None


def normalise(kind, osm_id, tags, lat, lon):
    raw_type = wanted(tags)
    return {
        "source": "osm",
        "source_id": f"{kind}/{osm_id}",
        "name": tags["name"],
        "name_en": tags.get("name:en"),
        "category": CATEGORY_MAP.get(raw_type, "Activities"),
        "raw_type": raw_type,
        "cuisines": split_list(tags.get("cuisine")),
        "lat": lat,
        "lon": lon,
        "address": {
            "street": tags.get("addr:street"),
            "housenumber": tags.get("addr:housenumber"),
            "district": tags.get("addr:district") or tags.get("addr:suburb"),
            "city": tags.get("addr:city"),
        },
        "opening_hours": tags.get("opening_hours"),
        "outdoor_seating": to_bool(tags.get("outdoor_seating")),
        "indoor_seating": to_bool(tags.get("indoor_seating")),
        "wheelchair": tags.get("wheelchair"),
        "wifi": tags.get("internet_access"),
        "website": tags.get("website") or tags.get("contact:website"),
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "instagram": tags.get("contact:instagram"),
        "diet": {
            "vegetarian": to_bool(tags.get("diet:vegetarian")),
            "vegan": to_bool(tags.get("diet:vegan")),
            "halal": to_bool(tags.get("diet:halal")),
        },
        "smoking": tags.get("smoking"),
        "brand": tags.get("brand"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.venues = []
        self.seen = 0

    def node(self, n):
        self.seen += 1
        tags = dict(n.tags)
        if wanted(tags) and n.location.valid() and in_bbox(n.location.lat, n.location.lon):
            self.venues.append(normalise("node", n.id, tags, n.location.lat, n.location.lon))

    def way(self, w):
        tags = dict(w.tags)
        if not wanted(tags):
            return
        lats, lons = [], []
        for nd in w.nodes:
            if nd.location.valid():
                lats.append(nd.location.lat)
                lons.append(nd.location.lon)
        if not lats:
            return
        lat, lon = sum(lats) / len(lats), sum(lons) / len(lons)
        if in_bbox(lat, lon):
            self.venues.append(normalise("way", w.id, tags, lat, lon))


def main():
    print(f"scanning {pbf} for {area} bbox=({south},{west},{north},{east}) …", file=sys.stderr)
    h = Handler()
    h.apply_file(pbf, locations=True, idx="flex_mem")
    venues = h.venues
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {
                "area": area,
                "bbox": f"{south},{west},{north},{east}",
                "source": "OpenStreetMap contributors (ODbL)",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "count": len(venues),
                "venues": venues,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    by_cat = {}
    for v in venues:
        by_cat[v["category"]] = by_cat.get(v["category"], 0) + 1
    pct = lambda n: f"{round(100 * n / max(1, len(venues)))}%"
    print(f"{area}: {len(venues)} named venues → {out_path}")
    print("by category:", by_cat)
    print("has cuisine:", pct(sum(1 for v in venues if v["cuisines"])))
    print("has opening_hours:", pct(sum(1 for v in venues if v["opening_hours"])))
    print("has website:", pct(sum(1 for v in venues if v["website"])))


if __name__ == "__main__":
    main()
