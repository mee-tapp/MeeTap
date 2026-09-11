#!/usr/bin/env node
/**
 * Meetap – OpenStreetMap (Overpass) venue importer.
 *
 * Usage:
 *   node scripts/data/fetch-osm.mjs <area-name> <south> <west> <north> <east> [out.json]
 *
 * Pulls real cafés / restaurants / bars / activities inside a bounding box,
 * normalises them to Meetap's raw venue shape and writes JSON.
 * Free, no API key. Data © OpenStreetMap contributors, ODbL.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Public Overpass instances; rotated when one refuses or rate-limits us.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const [areaName, south, west, north, east, outArg] = process.argv.slice(2);
if (!areaName || !south || !west || !north || !east) {
  console.error("Usage: fetch-osm.mjs <area-name> <south> <west> <north> <east> [out.json]");
  process.exit(1);
}
const bbox = [south, west, north, east].map(Number).join(",");
const outPath = outArg ?? path.join("data", "raw", `osm-${areaName}.json`);

// Category normalisation → Meetap's four UI categories.
const CATEGORY_MAP = {
  cafe: "Cafés",
  coffee_shop: "Cafés",
  ice_cream: "Cafés",
  restaurant: "Restaurants",
  fast_food: "Restaurants",
  food_court: "Restaurants",
  bar: "Bars",
  pub: "Bars",
  nightclub: "Bars",
  biergarten: "Bars",
  attraction: "Activities",
  museum: "Activities",
  viewpoint: "Activities",
  gallery: "Activities",
  park: "Activities",
  garden: "Activities",
  cinema: "Activities",
  theatre: "Activities",
  bowling_alley: "Activities",
  escape_game: "Activities",
};

// Big areas (a whole city) are fetched as tiles so Overpass never times out.
const TILE_DEG = Number(process.env.OSM_TILE_DEG ?? 0.2);
const TILE_PAUSE_MS = 3000;

const buildQuery = (box) => `
[out:json][timeout:120];
(
  nwr["amenity"~"^(cafe|restaurant|bar|pub|fast_food|food_court|ice_cream|nightclub|biergarten|cinema|theatre)$"]["name"](${box});
  nwr["tourism"~"^(attraction|museum|viewpoint|gallery)$"]["name"](${box});
  nwr["leisure"~"^(park|garden|bowling_alley|escape_game)$"]["name"](${box});
);
out center tags;
`;

function splitList(value) {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function toBool(value) {
  if (value == null) return null;
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function normalise(el) {
  const t = el.tags ?? {};
  const rawType = t.amenity ?? t.tourism ?? t.leisure ?? "";
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  return {
    source: "osm",
    source_id: `${el.type}/${el.id}`,
    name: t.name,
    name_en: t["name:en"] ?? null,
    category: CATEGORY_MAP[rawType] ?? "Activities",
    raw_type: rawType,
    cuisines: splitList(t.cuisine),
    lat,
    lon,
    address: {
      street: t["addr:street"] ?? null,
      housenumber: t["addr:housenumber"] ?? null,
      district: t["addr:district"] ?? t["addr:suburb"] ?? null,
      city: t["addr:city"] ?? null,
    },
    opening_hours: t.opening_hours ?? null,
    outdoor_seating: toBool(t.outdoor_seating),
    indoor_seating: toBool(t.indoor_seating),
    wheelchair: t.wheelchair ?? null,
    wifi: t.internet_access ?? null,
    website: t.website ?? t["contact:website"] ?? null,
    phone: t.phone ?? t["contact:phone"] ?? null,
    instagram: t["contact:instagram"] ?? null,
    diet: {
      vegetarian: toBool(t["diet:vegetarian"]),
      vegan: toBool(t["diet:vegan"]),
      halal: toBool(t["diet:halal"]),
    },
    smoking: t.smoking ?? null,
    brand: t.brand ?? null,
    fetched_at: new Date().toISOString(),
  };
}

function tiles() {
  const [s, w, n, e] = [south, west, north, east].map(Number);
  const out = [];
  for (let lat = s; lat < n; lat += TILE_DEG) {
    for (let lon = w; lon < e; lon += TILE_DEG) {
      const top = Math.min(lat + TILE_DEG, n);
      const right = Math.min(lon + TILE_DEG, e);
      out.push([lat, lon, top, right].map((x) => x.toFixed(4)).join(","));
    }
  }
  return out;
}

const MAX_ATTEMPTS = 6;

async function fetchTile(box, attempt = 1) {
  const url = OVERPASS_URLS[(attempt - 1) % OVERPASS_URLS.length];
  const retry = async (why) => {
    if (attempt >= MAX_ATTEMPTS) throw new Error(`Overpass gave up on ${box}: ${why}`);
    const wait = 10000 * attempt;
    console.error(`  ${why} (${url}); waiting ${wait / 1000}s, then trying next mirror…`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchTile(box, attempt + 1);
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Meetap venue importer (github.com/nihatguliyevitu/MeeTap)",
      },
      body: "data=" + encodeURIComponent(buildQuery(box)),
    });
  } catch (err) {
    return retry(`network error ${err.cause?.code ?? err.message}`);
  }
  if (res.status === 429 || res.status === 504 || res.status === 502 || res.status === 503) {
    return retry(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`Overpass error ${res.status}: ${await res.text()}`);
  try {
    return (await res.json()).elements;
  } catch (err) {
    return retry(`bad JSON ${err.message}`);
  }
}

async function main() {
  const boxes = tiles();
  console.error(`Overpass: ${areaName} bbox=${bbox} in ${boxes.length} tile(s) …`);
  const seen = new Map();
  for (const [i, box] of boxes.entries()) {
    const elements = await fetchTile(box);
    let added = 0;
    for (const el of elements) {
      const v = normalise(el);
      if (v && !seen.has(v.source_id)) {
        seen.set(v.source_id, v);
        added++;
      }
    }
    console.error(`  tile ${i + 1}/${boxes.length}: +${added} (total ${seen.size})`);
    if (i < boxes.length - 1) await new Promise((r) => setTimeout(r, TILE_PAUSE_MS));
  }
  const venues = [...seen.values()];

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        area: areaName,
        bbox,
        source: "OpenStreetMap contributors (ODbL)",
        fetched_at: new Date().toISOString(),
        count: venues.length,
        venues,
      },
      null,
      2,
    ),
  );

  // Coverage summary – tells us how much each field can be trusted.
  const pct = (n) => `${Math.round((100 * n) / venues.length)}%`;
  const byCat = {};
  for (const v of venues) byCat[v.category] = (byCat[v.category] ?? 0) + 1;
  const cuisineCounts = {};
  for (const v of venues)
    for (const c of v.cuisines) cuisineCounts[c] = (cuisineCounts[c] ?? 0) + 1;
  const topCuisines = Object.entries(cuisineCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([c, n]) => `${c}:${n}`)
    .join(", ");

  console.log(`\n${areaName}: ${venues.length} named venues → ${outPath}`);
  console.log("by category:", byCat);
  console.log("has cuisine:", pct(venues.filter((v) => v.cuisines.length).length));
  console.log("has opening_hours:", pct(venues.filter((v) => v.opening_hours).length));
  console.log("has website:", pct(venues.filter((v) => v.website).length));
  console.log("has outdoor_seating:", pct(venues.filter((v) => v.outdoor_seating != null).length));
  console.log("top cuisines:", topCuisines || "(none)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
