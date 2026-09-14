#!/usr/bin/env node
/**
 * Meetap – wipe ALL venues (and everything hanging off them) before loading
 * the curated pilot catalog. Decision of 2026-09-14: the 87k open-data
 * records are confusing and are replaced by a 250–300 venue catalog.
 *
 * Deletes (via ON DELETE CASCADE): venues, venue_sources, reviews,
 * venue_external, venue_reviews_external, venue_intelligence, venue_photos,
 * menu_items, saved_venues, visits, venue_reports.
 * Keeps: query_logs (clicked_venue_id is set to null), profiles, intent_cache.
 *
 * The open data can be reloaded any time from data/venues-*.json with
 * scripts/db/load-venues.mjs, so no separate backup is taken.
 *
 * Usage (asks for the word RESET unless --yes is passed):
 *   node --env-file=.env scripts/db/reset-venues.mjs
 *   node --env-file=.env scripts/db/reset-venues.mjs --yes
 */
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env");
  process.exit(1);
}
const sql = postgres(url, { ssl: "require", max: 1 });

const before = await sql`select count(*)::int as n from public.venues`;
console.log(`venues in database: ${before[0].n}`);

if (!process.argv.includes("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Type RESET to delete every venue and dependent row: ");
  rl.close();
  if (answer.trim() !== "RESET") {
    console.log("aborted");
    await sql.end();
    process.exit(0);
  }
}

await sql.begin(async (tx) => {
  await tx`update public.query_logs set clicked_venue_id = null where clicked_venue_id is not null`;
  await tx`truncate table public.venues cascade`;
});

for (const t of [
  "venues",
  "venue_sources",
  "reviews",
  "venue_external",
  "venue_reviews_external",
  "venue_intelligence",
  "venue_photos",
  "menu_items",
  "saved_venues",
]) {
  const r = await sql
    .unsafe(`select count(*)::int as n from public.${t}`)
    .catch(() => [{ n: "-" }]);
  console.log(`${t.padEnd(24)} ${r[0].n}`);
}
const q = await sql`select count(*)::int as n from public.query_logs`;
console.log(`query_logs kept: ${q[0].n}`);
await sql.end();
