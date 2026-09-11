#!/usr/bin/env node
/**
 * Live end-to-end test against Supabase + DeepSeek + Open-Meteo.
 *
 * Usage:
 *   node --env-file=.env scripts/recommend-live.mjs Baku "cümle" [lat] [lon]
 */
import { recommend } from "../src/lib/recommend/engine.ts";

const [city, query, latArg, lonArg] = process.argv.slice(2);
if (!city || !query) {
  console.error('Usage: recommend-live.mjs <City> "<sentence>" [lat] [lon]');
  process.exit(1);
}

const t0 = Date.now();
const out = await recommend({
  query,
  city,
  lat: latArg ? Number(latArg) : null,
  lon: lonArg ? Number(lonArg) : null,
  locale: "tr",
  limit: 6,
});
console.log(`parser=${out.parser} · ${out.candidates} candidates · ${Date.now() - t0} ms`);
console.log("intent :", JSON.stringify(out.intent));
console.log(
  "weather:",
  out.weather
    ? `${out.weather.label_tr}, ${out.weather.temp_c}°C, raining=${out.weather.is_raining}`
    : "n/a",
);
console.log(`origin : ${out.origin.source} (${out.origin.lat}, ${out.origin.lon})\n`);
for (const r of out.results) {
  const v = r.venue;
  console.log(
    `${String(Math.round(r.score * 100)).padStart(3)}  ${v.name}  [${v.category}${v.cuisines.length ? " · " + v.cuisines.join("/") : ""}]  band=${v.price_band ?? "?"}  ${Math.round(v.distance_m)} m`,
  );
  console.log(`     ${r.explanation || "(no explanation)"}`);
}
