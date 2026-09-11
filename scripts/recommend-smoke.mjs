#!/usr/bin/env node
/**
 * Smoke test: parse a real Turkish sentence with the rule parser and rank
 * REAL OSM venues from a fetched JSON file. No DB, no LLM, no keys.
 *
 * Usage: node scripts/recommend-smoke.mjs <osm.json> "<sentence>" [lat] [lon] [raining]
 */
import { readFileSync } from "node:fs";
import { parseIntentWithRules } from "../src/lib/recommend/rule-parser.ts";
import { rankCandidates, explain } from "../src/lib/recommend/scoring.ts";

const [file, sentence, latArg, lonArg, rainArg] = process.argv.slice(2);
if (!file || !sentence) {
  console.error('Usage: recommend-smoke.mjs <osm.json> "<sentence>" [lat] [lon] [raining]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, "utf8"));
const userLat = Number(latArg ?? 40.9905);
const userLon = Number(lonArg ?? 29.025);
const raining = rainArg === "true" || rainArg === "1";

// --- Temporary enrichment heuristics (Etap 1 will replace these with real tagging) ---
const CHAINS = [
  "starbucks",
  "kahve dünyası",
  "kahve dunyasi",
  "espressolab",
  "gloria jeans",
  "burger king",
  "mcdonald",
  "kfc",
  "dominos",
  "domino's",
  "simit sarayı",
  "simit sarayi",
];
function priceBand(v) {
  const n = v.name.toLowerCase();
  if (CHAINS.some((c) => n.includes(c))) return 2;
  if (v.raw_type === "fast_food" || v.raw_type === "ice_cream") return 1;
  if (v.category === "Cafés") return 2;
  if (v.category === "Bars") return 3;
  if (v.category === "Activities") return 1;
  if (
    v.cuisines.includes("steak_house") ||
    v.cuisines.includes("sushi") ||
    v.cuisines.includes("fine_dining")
  )
    return 4;
  return 3;
}
function ambiance(v) {
  const tags = new Set();
  if (v.outdoor_seating === true) tags.add("outdoor");
  if (v.indoor_seating === true || v.outdoor_seating === false) tags.add("indoor");
  if (v.category === "Bars") tags.add("lively");
  if (v.category === "Cafés" && v.wifi && v.wifi !== "no") tags.add("work_friendly");
  if (v.cuisines.includes("breakfast")) tags.add("breakfast");
  return [...tags];
}

// Works on both raw OSM files and merged files (which carry hints from Overture).
const candidates = data.venues.map((v) => ({
  id: v.source_id ?? v.slug,
  name: v.name,
  category: v.category,
  cuisines: v.cuisines,
  lat: v.lat,
  lon: v.lon,
  price_band: v.price_band_hint ?? priceBand(v),
  price_estimate: null,
  ambiance_tags: v.ambiance_hints?.length ? v.ambiance_hints : ambiance(v),
  outdoor_seating: v.outdoor_seating,
  indoor_seating: v.indoor_seating,
  wifi: v.wifi,
  rating_avg: null,
  rating_count: 0,
  open_now: null,
}));

const parsed = parseIntentWithRules(sentence);
console.log("SENTENCE:", sentence);
console.log("PARSED  :", JSON.stringify(parsed.intent));
console.log("confidence:", parsed.confidence.toFixed(2), "\n");

const ranked = rankCandidates(parsed.intent, candidates, {
  user_lat: userLat,
  user_lon: userLon,
  weather: { is_raining: raining, temp_c: raining ? 14 : 24 },
  locale: "tr",
});
console.log(`${ranked.length} of ${candidates.length} candidates passed hard filters. Top 8:\n`);
for (const s of ranked.slice(0, 8)) {
  const c = s.candidate;
  console.log(
    `${(s.score * 100).toFixed(0).padStart(3)}  ${c.name}  [${c.category}${c.cuisines.length ? " · " + c.cuisines.join("/") : ""}]  band=${c.price_band}`,
  );
  console.log(`     ${explain(s, "tr") || "(no explanation)"}`);
}
