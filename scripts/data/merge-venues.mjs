#!/usr/bin/env node
/**
 * Meetap – merge OSM + Overture venue lists into one deduplicated set.
 *
 * Usage:
 *   node scripts/data/merge-venues.mjs <area-name> <osm.json> <overture.json> [out.json]
 *
 * Matching rule: same place if within 80 m AND names are similar
 * (token overlap ≥ 0.5 or one normalised name contains the other).
 * Overture wins for name / category / website / phone; OSM adds
 * opening_hours, seating, diet, wifi, cuisine. Unmatched records from
 * either side are kept – they are real places too.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [areaName, osmPath, overturePath, outArg] = process.argv.slice(2);
if (!areaName || !osmPath || !overturePath) {
  console.error("Usage: merge-venues.mjs <area-name> <osm.json> <overture.json> [out.json]");
  process.exit(1);
}
const outPath = outArg ?? path.join("data", `venues-${areaName}.json`);

const TR = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  I: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};
const STOP = new Set([
  "cafe",
  "kafe",
  "restaurant",
  "restoran",
  "bar",
  "pub",
  "the",
  "and",
  "ve",
  "&",
  "coffee",
  "kahve",
  "lokantasi",
  "lokanta",
  "moda",
  "kadikoy",
  "istanbul",
  "baku",
  "baki",
]);

function norm(s) {
  return (s ?? "")
    .replace(/[çğıöşüâîûÇĞİIÖŞÜ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(s) {
  return new Set(
    norm(s)
      .split(" ")
      .filter((t) => t && !STOP.has(t)),
  );
}
function similar(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size) >= 0.5;
}
function metres(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function slugify(name, i) {
  const base = norm(name).replace(/ /g, "-").replace(/-+/g, "-").slice(0, 60) || "venue";
  return `${base}-${i}`;
}

// simple spatial grid for candidate lookup
function grid(list, cell = 0.001) {
  const g = new Map();
  for (const v of list) {
    const key = `${Math.floor(v.lat / cell)}:${Math.floor(v.lon / cell)}`;
    (g.get(key) ?? g.set(key, []).get(key)).push(v);
  }
  return {
    near(v) {
      const out = [];
      const x = Math.floor(v.lat / cell);
      const y = Math.floor(v.lon / cell);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) out.push(...(g.get(`${x + i}:${y + j}`) ?? []));
      return out;
    },
  };
}

/** Collapse OSM node/way duplicates (same name within 50 m). */
function dedupeOsm(list) {
  const kept = [];
  const idx = grid(kept);
  const g = new Map();
  for (const v of list) {
    const key = `${Math.floor(v.lat / 0.001)}:${Math.floor(v.lon / 0.001)}`;
    const neighbours = [];
    const x = Math.floor(v.lat / 0.001);
    const y = Math.floor(v.lon / 0.001);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) neighbours.push(...(g.get(`${x + i}:${y + j}`) ?? []));
    const dup = neighbours.find((k) => metres(k, v) < 50 && norm(k.name) === norm(v.name));
    if (dup) {
      // merge richer fields into the kept record
      for (const f of [
        "opening_hours",
        "website",
        "phone",
        "instagram",
        "outdoor_seating",
        "indoor_seating",
        "wifi",
        "wheelchair",
        "brand",
      ])
        if (dup[f] == null && v[f] != null) dup[f] = v[f];
      dup.cuisines = [...new Set([...dup.cuisines, ...v.cuisines])];
      dup.duplicate_ids = [...(dup.duplicate_ids ?? []), v.source_id];
      continue;
    }
    kept.push(v);
    (g.get(key) ?? g.set(key, []).get(key)).push(v);
  }
  void idx;
  return kept;
}

async function main() {
  const osm = JSON.parse(await readFile(osmPath, "utf8"));
  const ovt = JSON.parse(await readFile(overturePath, "utf8"));
  const osmVenues = dedupeOsm(osm.venues);
  const osmGrid = grid(osmVenues);
  const usedOsm = new Set();
  const merged = [];

  for (const o of ovt.venues) {
    const match = osmGrid
      .near(o)
      .filter((s) => !usedOsm.has(s.source_id) && metres(s, o) <= 80 && similar(s.name, o.name))
      .sort((a, b) => metres(a, o) - metres(b, o))[0];

    const rec = {
      name: o.name,
      name_en: match?.name_en ?? null,
      category: o.category,
      raw_type: o.raw_type,
      cuisines: [...new Set([...(match?.cuisines ?? []), ...o.cuisines])],
      lat: o.lat,
      lon: o.lon,
      address: { ...(match?.address ?? {}), ...o.address },
      district: o.address.district ?? match?.address?.district ?? null,
      opening_hours: match?.opening_hours ?? null,
      outdoor_seating: match?.outdoor_seating ?? null,
      indoor_seating: match?.indoor_seating ?? null,
      wifi: match?.wifi ?? null,
      wheelchair: match?.wheelchair ?? null,
      diet: match?.diet ?? {},
      smoking: match?.smoking ?? null,
      website: o.website ?? match?.website ?? null,
      phone: o.phone ?? match?.phone ?? null,
      instagram: match?.instagram ?? (o.socials ?? []).find((s) => s.includes("instagram")) ?? null,
      socials: o.socials ?? [],
      brand: o.brand ?? match?.brand ?? null,
      confidence: o.confidence,
      price_band_hint: o.price_band_hint,
      ambiance_hints: [
        ...new Set([
          ...o.ambiance_hints,
          ...(match?.outdoor_seating === true ? ["outdoor"] : []),
          ...(match?.indoor_seating === true ? ["indoor"] : []),
          ...(match?.wifi && match.wifi !== "no" ? ["work_friendly"] : []),
        ]),
      ],
      sources: [
        { source: "overture", source_id: o.source_id },
        ...(match ? [{ source: "osm", source_id: match.source_id }] : []),
      ],
    };
    if (match) usedOsm.add(match.source_id);
    merged.push(rec);
  }

  // OSM-only places
  let osmOnly = 0;
  for (const s of osmVenues) {
    if (usedOsm.has(s.source_id)) continue;
    osmOnly++;
    merged.push({
      name: s.name,
      name_en: s.name_en,
      category: s.category,
      raw_type: s.raw_type,
      cuisines: s.cuisines,
      lat: s.lat,
      lon: s.lon,
      address: s.address,
      district: s.address?.district ?? null,
      opening_hours: s.opening_hours,
      outdoor_seating: s.outdoor_seating,
      indoor_seating: s.indoor_seating,
      wifi: s.wifi,
      wheelchair: s.wheelchair,
      diet: s.diet,
      smoking: s.smoking,
      website: s.website,
      phone: s.phone,
      instagram: s.instagram,
      socials: [],
      brand: s.brand,
      confidence: null,
      price_band_hint: null,
      ambiance_hints: [
        ...new Set([
          ...(s.outdoor_seating === true ? ["outdoor"] : []),
          ...(s.indoor_seating === true ? ["indoor"] : []),
          ...(s.wifi && s.wifi !== "no" ? ["work_friendly"] : []),
        ]),
      ],
      sources: [{ source: "osm", source_id: s.source_id }],
    });
  }

  merged.forEach((v, i) => (v.slug = slugify(v.name, i + 1)));

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        area: areaName,
        generated_at: new Date().toISOString(),
        count: merged.length,
        venues: merged,
      },
      null,
      2,
    ),
  );

  const both = merged.filter((v) => v.sources.length === 2).length;
  const byCat = {};
  for (const v of merged) byCat[v.category] = (byCat[v.category] ?? 0) + 1;
  const pct = (n) => `${Math.round((100 * n) / merged.length)}%`;
  console.log(
    `${areaName}: ${ovt.venues.length} overture + ${osm.venues.length} osm (${osmVenues.length} after osm dedupe) → ${merged.length} venues → ${outPath}`,
  );
  console.log(
    `matched in both sources: ${both} · overture-only: ${ovt.venues.length - both} · osm-only: ${osmOnly}`,
  );
  console.log("by category:", byCat);
  console.log("has cuisine:", pct(merged.filter((v) => v.cuisines.length).length));
  console.log("has opening_hours:", pct(merged.filter((v) => v.opening_hours).length));
  console.log("has website:", pct(merged.filter((v) => v.website).length));
  console.log("has ambiance hint:", pct(merged.filter((v) => v.ambiance_hints.length).length));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
