#!/usr/bin/env node
/**
 * Dev-only recommendation debugger: same as recommend-live.mjs but with
 * `debug: true` so the exclusion breakdown / fallback tier / mode are visible.
 * Never wired into the public server function or the UI.
 *
 * Usage:
 *   node --env-file=.env scripts/recommend-debug.mjs Istanbul "cümle" [lat] [lon]
 */
import { recommend } from "../src/lib/recommend/engine.ts";

const [city, query, latArg, lonArg] = process.argv.slice(2);
if (!city || !query) {
  console.error('Usage: recommend-debug.mjs <City> "<sentence>" [lat] [lon]');
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
  debug: true,
});
console.log(`mode=${out.mode} · parser=${out.parser} · ${Date.now() - t0} ms`);
console.log("intent :", JSON.stringify(out.intent));
if (out.debug) {
  console.log("debug  :", JSON.stringify(out.debug, null, 2));
} else {
  console.log("debug  : (none – named-venue short-circuit skips discovery debug)");
}
console.log(`origin : ${out.origin.source} (${out.origin.lat}, ${out.origin.lon})\n`);
for (const r of out.results) {
  const v = r.venue;
  console.log(
    `${String(Math.round(r.score * 100)).padStart(3)}  ${v.name}  [${v.category}${v.cuisines.length ? " · " + v.cuisines.join("/") : ""}]  ${Math.round(v.distance_m)} m`,
  );
  console.log(`     ${r.explanation || "(no explanation)"}`);
}
