#!/usr/bin/env python3
"""
Meetap – Overture Maps Places fetcher (streaming, category-filtered).

Usage:
    python3 scripts/data/fetch-overture.py <area-name> <west> <south> <east> <north> [out.geojson]

Streams the Overture "place" dataset for a bounding box straight from S3
(free, no key; `pip install overturemaps`), keeps only the venue categories
listed in scripts/data/normalize-overture.mjs, and writes a small GeoJSON that
normalize-overture.mjs then turns into Meetap's raw venue shape.

Unlike `overturemaps download`, this never writes the full city dump to disk
(a whole Istanbul dump would be hundreds of MB of barbers and parking lots).
"""

import json
import re
import struct
import sys
from pathlib import Path

from overturemaps.core import record_batch_reader

if len(sys.argv) < 6:
    print(__doc__, file=sys.stderr)
    sys.exit(1)

area = sys.argv[1]
west, south, east, north = (float(x) for x in sys.argv[2:6])
out_path = Path(sys.argv[6]) if len(sys.argv) > 6 else Path("data/raw") / f"overture-{area}.geojson"

# Single source of truth for accepted categories: the JS normaliser's CAT map.
js = (Path(__file__).parent / "normalize-overture.mjs").read_text(encoding="utf-8")
cat_block = js[js.index("const CAT = {") : js.index("};", js.index("const CAT = {"))]
ACCEPTED = set(re.findall(r"^\s+([a-z_]+):\s*\[", cat_block, flags=re.M))
if not ACCEPTED:
    sys.exit("could not read category list from normalize-overture.mjs")


def wkb_point(blob):
    """Decode a WKB Point (little or big endian) → (lon, lat)."""
    if blob is None or len(blob) < 21:
        return None
    endian = "<" if blob[0] == 1 else ">"
    geom_type = struct.unpack(endian + "I", blob[1:5])[0]
    if geom_type & 0xFF != 1:  # not a point (multipolygons etc.)
        return None
    x, y = struct.unpack(endian + "dd", blob[5:21])
    return x, y


def main():
    print(f"Overture places for {area} bbox=({west},{south},{east},{north}) …", file=sys.stderr)
    reader = record_batch_reader("place", bbox=(west, south, east, north))
    if reader is None:
        sys.exit("no data returned")

    features = []
    scanned = 0
    for batch in reader:
        rows = batch.to_pylist()
        scanned += len(rows)
        for r in rows:
            cats = r.get("categories") or {}
            primary = cats.get("primary")
            if primary not in ACCEPTED:
                continue
            pt = wkb_point(r.get("geometry"))
            if pt is None:
                continue
            names = r.get("names") or {}
            if not names.get("primary"):
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [pt[0], pt[1]]},
                    "properties": {
                        "id": r.get("id"),
                        "names": {"primary": names.get("primary")},
                        "categories": {"primary": primary, "alternate": cats.get("alternate") or []},
                        "confidence": r.get("confidence"),
                        "websites": r.get("websites") or [],
                        "socials": r.get("socials") or [],
                        "phones": r.get("phones") or [],
                        "brand": r.get("brand"),
                        "addresses": r.get("addresses") or [],
                    },
                }
            )
        print(f"  scanned {scanned:,} → kept {len(features):,}", file=sys.stderr)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    print(f"{area}: scanned {scanned:,} places, kept {len(features):,} venues → {out_path}")


if __name__ == "__main__":
    main()
