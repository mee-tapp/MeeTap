#!/usr/bin/env node
/**
 * Meetap – load sea polygons (from fetch-water.py) into Supabase and recompute
 * every venue's distance to the shore.
 *
 * Usage:
 *   node --env-file=.env scripts/data/load-water.mjs Istanbul data/raw/water-istanbul.ndjson
 */

import { readFile } from "node:fs/promises";
import postgres from "postgres";

const [city, file] = process.argv.slice(2);
if (!city || !file) {
  console.error("Usage: load-water.mjs <City> <water.ndjson>");
  process.exit(1);
}

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1, prepare: false });
try {
  const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
  console.log(`${city}: ${lines.length} sea polygons`);
  let loaded = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    await sql`
      insert into public.water_bodies (source_id, city, subtype, name, geom)
      values (${row.id}, ${city}, ${row.subtype}, ${row.name},
              st_makevalid(st_geomfromwkb(decode(${row.wkb}, 'hex'), 4326))::geography)
      on conflict (source_id) do update set geom = excluded.geom, subtype = excluded.subtype, name = excluded.name`;
    loaded++;
    if (loaded % 25 === 0) process.stdout.write(`  loaded ${loaded}/${lines.length}\r`);
  }
  console.log(`  loaded ${loaded}/${lines.length}`);
  await sql`set statement_timeout = '600000'`;
  console.log("building shore line pieces …");
  const [{ refresh_shorelines: pieces }] = await sql`select public.refresh_shorelines(${city})`;
  console.log(`  ${pieces} shore pieces`);
  console.log("recomputing shore distance for every venue (chunked) …");
  const ids = (await sql`select id from public.venues where city = ${city} order by id`).map(
    (r) => r.id,
  );
  const CHUNK = 2000;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const [{ refresh_seaside_ids: n }] =
      await sql`select public.refresh_seaside_ids(${ids.slice(i, i + CHUNK)}::uuid[])`;
    updated += n;
    process.stdout.write(`  ${updated}/${ids.length}\r`);
  }
  console.log();
  const [{ n }] =
    await sql`select count(*)::int n from public.venues where city = ${city} and seaside`;
  console.log(`${city}: ${updated} venues updated, ${n} within 150 m of the sea`);
  const sample =
    await sql`select name, category, round(shore_distance_m) d from public.venues where city = ${city} and seaside order by random() limit 8`;
  for (const r of sample) console.log(`   ${r.name} [${r.category}] ${r.d} m`);
} finally {
  await sql.end();
}
