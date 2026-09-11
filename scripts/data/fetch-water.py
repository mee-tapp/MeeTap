#!/usr/bin/env python3
"""
Meetap – sea / ocean polygons from Overture Maps (base theme, type "water").

Usage:
    python3 scripts/data/fetch-water.py <city> <west> <south> <east> <north> [out.ndjson]

Streams water features for the bbox from S3 (free, no key), keeps the ones
that are sea-like (ocean, sea, bay, strait, lagoon, or a lake named like the
Caspian) and writes one JSON line per feature with the geometry as WKB hex,
ready for scripts/data/load-water.mjs → PostGIS.
"""

import json
import sys
from pathlib import Path

from overturemaps.core import record_batch_reader

if len(sys.argv) < 6:
    print(__doc__, file=sys.stderr)
    sys.exit(1)

city = sys.argv[1]
west, south, east, north = (float(x) for x in sys.argv[2:6])
out_path = Path(sys.argv[6]) if len(sys.argv) > 6 else Path("data/raw") / f"water-{city.lower()}.ndjson"

SEA_SUBTYPES = {"ocean", "sea", "bay", "strait", "lagoon", "fjord", "sound", "gulf"}
SEA_NAME_HINTS = ("caspian", "xəzər", "khazar", "marmara", "bosphorus", "boğaz", "karadeniz", "black sea", "golden horn", "haliç")


def main():
    print(f"Overture water for {city} bbox=({west},{south},{east},{north}) …", file=sys.stderr)
    reader = record_batch_reader("water", bbox=(west, south, east, north))
    if reader is None:
        sys.exit("no data returned")
    kept = 0
    scanned = 0
    subtypes = {}
    with out_path.open("w", encoding="utf-8") as f:
        for batch in reader:
            for r in batch.to_pylist():
                scanned += 1
                subtype = (r.get("subtype") or "").lower()
                names = r.get("names") or {}
                name = (names.get("primary") or "") if isinstance(names, dict) else ""
                subtypes[subtype] = subtypes.get(subtype, 0) + 1
                sea_like = subtype in SEA_SUBTYPES or any(h in name.lower() for h in SEA_NAME_HINTS)
                if not sea_like:
                    continue
                geom = r.get("geometry")
                if not geom:
                    continue
                f.write(json.dumps({"id": r.get("id"), "subtype": subtype, "name": name or None, "wkb": bytes(geom).hex()}) + "\n")
                kept += 1
    print(f"{city}: scanned {scanned:,} water features, kept {kept} sea-like → {out_path}")
    print("subtypes seen:", ", ".join(f"{k or '?'}:{v}" for k, v in sorted(subtypes.items(), key=lambda kv: -kv[1])[:12]))


if __name__ == "__main__":
    main()
