#!/usr/bin/env node
/**
 * Meetap pilot catalog – step B: propose the 250–300 pilot venues from the
 * candidate list, per establishment type, by review volume and rating.
 * Writes a CSV with a `keep` column (1 = proposed) that Ali/Nihat edit by
 * hand; step C (google-details.mjs) loads every row with keep = 1.
 *
 * Usage:
 *   node scripts/catalog/select-pilot.mjs --city Baku
 *   node scripts/catalog/select-pilot.mjs --city Baku --restaurants 150 --cafes 50 --bars 40 --desserts 25 --tea 15 --quick 20
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  GOOGLE_CATEGORY_NAME_MAP,
  GOOGLE_TYPE_MAP,
  NAME_HINTS,
} from "../../src/lib/catalog/taxonomy.ts";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith("--")
        ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]
        : null,
    )
    .filter(Boolean),
);
const city = args.city ?? "Baku";
const TARGET = {
  restaurant: Number(args.restaurants ?? 150),
  cafe_coffee: Number(args.cafes ?? 50),
  bar_pub: Number(args.bars ?? 40),
  dessert_bakery: Number(args.desserts ?? 25),
  tea_house: Number(args.tea ?? 15),
  lounge_hookah: Number(args.lounges ?? 10),
  quick_bites: Number(args.quick ?? 20),
};
const MIN_REVIEWS = {
  restaurant: Number(args["min-restaurant"] ?? 120),
  cafe_coffee: 50,
  bar_pub: 50,
  dessert_bakery: 50,
  tea_house: 40,
  lounge_hookah: 50,
  quick_bites: 80,
};
const MIN_RATING = Number(args["min-rating"] ?? 4.0);
/** "Worth the trip" areas outside the centre get a guaranteed quota. */
const OUTSIDE_AREAS = ["Bilgəh / Nardaran", "Mərdəkan / Şüvəlan", "Novxanı"];
const OUTSIDE_QUOTA = 15;

function wordIn(name, w) {
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(name);
}

/** Establishment type from Google types + name hints (same rules the loader uses). */
export function establishmentTypeOf(row) {
  for (const hint of NAME_HINTS) {
    if (hint.type && hint.words.some((w) => wordIn(row.name, w))) return hint.type;
  }
  // Candidates carry Google's human category names ("Azerbaijani restaurant")
  // or, from the Places API path, snake_case types ("azerbaijani_restaurant").
  const ordered = [row.primary_type, ...row.types].filter(Boolean).map((t) => t.toLowerCase());
  const lookup = (t) => GOOGLE_CATEGORY_NAME_MAP[t] ?? GOOGLE_TYPE_MAP[t.replace(/[^a-z]+/g, "_")];
  for (const t of ordered) {
    const m = lookup(t);
    if (m?.type) return m.type;
  }
  if (ordered.some((t) => lookup(t)?.cuisine || /restaurant/.test(t))) return "restaurant";
  return null;
}

const rows = JSON.parse(
  await readFile(`data/catalog/${city.toLowerCase()}-candidates.json`, "utf8"),
);
for (const r of rows) r.establishment_type = establishmentTypeOf(r);

const picked = new Set();
const perType = {};
for (const [type, target] of Object.entries(TARGET)) {
  const pool = rows
    .filter(
      (r) =>
        r.establishment_type === type &&
        r.review_count >= MIN_REVIEWS[type] &&
        (r.rating ?? 0) >= MIN_RATING,
    )
    .sort((a, b) => b.review_count - a.review_count);
  perType[type] = pool.slice(0, target);
  for (const r of perType[type]) picked.add(r.place_id);
}
// Outside-the-centre quota (restaurants/cafés only), regardless of the per-type cut.
const outside = rows
  .filter(
    (r) =>
      r.areas.some((a) => OUTSIDE_AREAS.includes(a)) &&
      r.review_count >= 100 &&
      (r.rating ?? 0) >= MIN_RATING,
  )
  .sort((a, b) => b.review_count - a.review_count)
  .slice(0, OUTSIDE_QUOTA);
for (const r of outside) picked.add(r.place_id);

const out = rows
  .map((r) => ({ keep: picked.has(r.place_id) ? 1 : "", ...r }))
  .sort((a, b) => (b.keep === 1) - (a.keep === 1) || b.review_count - a.review_count);
const csv = [
  "keep,place_id,name,establishment_type,rating,review_count,price_level,primary_type,areas,address,maps_url",
  ...out.map((r) =>
    [
      r.keep,
      r.place_id,
      r.name,
      r.establishment_type ?? "",
      r.rating ?? "",
      r.review_count,
      r.price_level ?? "",
      r.primary_type ?? "",
      r.areas.join("|"),
      r.address,
      r.maps_url ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  ),
].join("\n");
const file = `data/catalog/${city.toLowerCase()}-pilot.csv`;
await writeFile(file, csv);
console.log(`proposed ${picked.size} venues → ${file}`);
for (const [type, list] of Object.entries(perType))
  console.log(`  ${type.padEnd(16)} ${list.length}/${TARGET[type]}`);
console.log(`  outside centre   ${outside.length}/${OUTSIDE_QUOTA}`);
console.log("Edit the keep column (1 = in, blank = out), then run apify-places.mjs --details.");
