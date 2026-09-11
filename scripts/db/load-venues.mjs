#!/usr/bin/env node
/**
 * Meetap – load a merged venue file (from merge-venues.mjs) into Supabase.
 *
 * Usage:
 *   node --env-file=.env scripts/db/load-venues.mjs data/venues-baku.json Baku AZN
 *   node --env-file=.env scripts/db/load-venues.mjs data/venues-istanbul.json Istanbul TRY
 *
 * Re-runnable: venues are matched by their open-data source ids (venue_sources),
 * so a monthly refresh updates existing rows instead of duplicating them.
 * Fields that users have corrected (ambiance_source = 'user'/'reviewed',
 * price_band_source = 'user') are never overwritten by open data.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";

const [file, city, currency = "TRY"] = process.argv.slice(2);
if (!file || !city) {
  console.error("Usage: load-venues.mjs <venues.json> <City> [currency]");
  process.exit(1);
}
const url = process.env.SUPABASE_DB_URL;
if (!url || url.includes("XXXX")) {
  console.error("SUPABASE_DB_URL is not set in .env");
  process.exit(1);
}

const TR = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  I: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};
function slugify(name, key) {
  const base = name
    .replace(/[çğıöşüÇĞİIÖŞÜ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 6);
  return `${base || "venue"}-${hash}`;
}

const data = JSON.parse(await readFile(file, "utf8"));
const rows = data.venues.map((v) => {
  const primary = v.sources[0];
  const key = `${primary.source}:${primary.source_id}`;
  return {
    slug: slugify(v.name, key),
    name: v.name,
    name_en: v.name_en ?? null,
    category: v.category,
    raw_type: v.raw_type ?? null,
    cuisines: v.cuisines ?? [],
    city,
    district: v.district ?? null,
    address: v.address ?? {},
    lat: v.lat,
    lon: v.lon,
    opening_hours: v.opening_hours ?? null,
    outdoor_seating: v.outdoor_seating ?? null,
    indoor_seating: v.indoor_seating ?? null,
    wifi: v.wifi ?? null,
    wheelchair: v.wheelchair ?? null,
    website: v.website ?? null,
    phone: v.phone ?? null,
    instagram: v.instagram ?? null,
    brand: v.brand ?? null,
    diet: v.diet ?? {},
    price_band: v.price_band_hint ?? null,
    price_band_source: v.price_band_hint ? "estimated" : null,
    currency,
    ambiance_tags: v.ambiance_hints ?? [],
    ambiance_source: v.ambiance_hints?.length ? "inferred" : null,
    confidence: v.confidence ?? null,
    sources: v.sources,
  };
});

const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
const CHUNK = 500;

try {
  console.log(`${city}: ${rows.length} venues from ${file}`);
  await sql`drop table if exists staging_venues`;
  await sql`
    create temp table staging_venues (
      slug text, name text, name_en text, category text, raw_type text, cuisines text[],
      city text, district text, address jsonb, lat double precision, lon double precision,
      opening_hours text, outdoor_seating boolean, indoor_seating boolean, wifi text, wheelchair text,
      website text, phone text, instagram text, brand text, diet jsonb,
      price_band smallint, price_band_source text, currency text,
      ambiance_tags text[], ambiance_source text, confidence real, sources jsonb
    )`;

  for (let i = 0; i < rows.length; i += CHUNK) {
    await sql`insert into staging_venues ${sql(rows.slice(i, i + CHUNK))}`;
    process.stdout.write(`  staged ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }
  console.log();

  await sql.begin(async (tx) => {
    // 1. Which staging rows already exist? Match on any open-data source id.
    await tx`
      create temp table staging_match as
      select s.slug as staging_slug, min(vs.venue_id::text)::uuid as venue_id
        from staging_venues s
        join lateral jsonb_array_elements(s.sources) src on true
        join public.venue_sources vs
          on vs.source = src->>'source' and vs.source_id = src->>'source_id'
       group by s.slug`;

    // 2. Insert brand-new venues.
    const inserted = await tx`
      insert into public.venues (
        slug, name, name_en, category, raw_type, cuisines, city, district, address, location, lat, lon,
        opening_hours, outdoor_seating, indoor_seating, wifi, wheelchair, website, phone, instagram, brand, diet,
        price_band, price_band_source, currency, ambiance_tags, ambiance_source, confidence)
      select s.slug, s.name, s.name_en, s.category, s.raw_type, s.cuisines, s.city, s.district, s.address,
             st_setsrid(st_makepoint(s.lon, s.lat), 4326)::geography, s.lat, s.lon,
             s.opening_hours, s.outdoor_seating, s.indoor_seating, s.wifi, s.wheelchair, s.website, s.phone, s.instagram, s.brand, s.diet,
             s.price_band, s.price_band_source, s.currency, s.ambiance_tags, s.ambiance_source, s.confidence
        from staging_venues s
        left join staging_match m on m.staging_slug = s.slug
       where m.venue_id is null
      on conflict (slug) do nothing
      returning id`;

    // 3. Refresh existing venues from open data, without touching user-corrected fields.
    const updated = await tx`
      update public.venues v
         set name = s.name,
             category = s.category,
             raw_type = s.raw_type,
             cuisines = case when cardinality(s.cuisines) > 0 then s.cuisines else v.cuisines end,
             district = coalesce(s.district, v.district),
             address = v.address || s.address,
             location = st_setsrid(st_makepoint(s.lon, s.lat), 4326)::geography,
             lat = s.lat, lon = s.lon,
             opening_hours = coalesce(s.opening_hours, v.opening_hours),
             outdoor_seating = coalesce(s.outdoor_seating, v.outdoor_seating),
             indoor_seating = coalesce(s.indoor_seating, v.indoor_seating),
             wifi = coalesce(s.wifi, v.wifi),
             website = coalesce(s.website, v.website),
             phone = coalesce(s.phone, v.phone),
             instagram = coalesce(s.instagram, v.instagram),
             brand = coalesce(s.brand, v.brand),
             price_band = case when v.price_band_source = 'user' then v.price_band else coalesce(s.price_band, v.price_band) end,
             price_band_source = case when v.price_band_source = 'user' then v.price_band_source else coalesce(s.price_band_source, v.price_band_source) end,
             ambiance_tags = case when v.ambiance_source in ('user','reviewed') then v.ambiance_tags
                                  when cardinality(s.ambiance_tags) > 0 then s.ambiance_tags else v.ambiance_tags end,
             ambiance_source = case when v.ambiance_source in ('user','reviewed') then v.ambiance_source else coalesce(s.ambiance_source, v.ambiance_source) end,
             confidence = coalesce(s.confidence, v.confidence),
             updated_at = now()
        from staging_venues s
        join staging_match m on m.staging_slug = s.slug
       where v.id = m.venue_id
      returning v.id`;

    // 4. Provenance rows for every source id (new + existing).
    await tx`
      insert into public.venue_sources (venue_id, source, source_id, raw)
      select coalesce(m.venue_id, v.id), src->>'source', src->>'source_id', src
        from staging_venues s
        join lateral jsonb_array_elements(s.sources) src on true
        left join staging_match m on m.staging_slug = s.slug
        left join public.venues v on v.slug = s.slug
       where coalesce(m.venue_id, v.id) is not null
      on conflict (source, source_id) do update set fetched_at = now()`;

    console.log(`inserted ${inserted.length} · updated ${updated.length}`);
  });

  const [{ count }] =
    await sql`select count(*)::int as count from public.venues where city = ${city}`;
  console.log(`${city} now has ${count} venues in Supabase`);
} finally {
  await sql.end();
}
