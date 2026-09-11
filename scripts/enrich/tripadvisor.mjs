#!/usr/bin/env node
/**
 * Meetap – pull ratings, features and the latest reviews for our venues from the
 * official Tripadvisor Content API (https://developer-tripadvisor.com/content-api/).
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/tripadvisor.mjs --city Baku --radius-km 3 --limit 300
 *   node --env-file=.env scripts/enrich/tripadvisor.mjs --city Istanbul --district Kadıköy --limit 500
 *   node --env-file=.env scripts/enrich/tripadvisor.mjs --city Baku --limit 20 --dry-run
 *
 * Per venue: 1 search call (+1 details, +1 reviews when a match is found), so
 * the free 5,000 calls/month cover roughly 1,600 venues. Venues already
 * enriched are skipped; "--refresh-days 30" re-pulls old ones.
 *
 * Matching: Tripadvisor search by name near the venue's coordinates; we accept a
 * hit only when the name is similar and it is within 250 m.
 */

import postgres from "postgres";

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
const city = args.city;
if (!city) {
  console.error("--city is required");
  process.exit(1);
}
const KEY = process.env.TRIPADVISOR_API_KEY;
if (!KEY) {
  console.error("TRIPADVISOR_API_KEY is not set in .env");
  process.exit(1);
}
const LIMIT = Number(args.limit ?? 300);
const RADIUS_KM = args["radius-km"] ? Number(args["radius-km"]) : null;
const DISTRICT = typeof args.district === "string" ? args.district : null;
const DRY = args["dry-run"] === true;
const REFRESH_DAYS = Number(args["refresh-days"] ?? 0);
const MAX_CALLS = Number(args["max-calls"] ?? 4500); // stay under the free tier by default

const BASE = "https://api.content.tripadvisor.com/api/v1";
const CENTERS = { Istanbul: [41.0369, 28.985], Baku: [40.3777, 49.852] };
const LANG = city === "Baku" ? "en" : "tr";

let calls = 0;
async function ta(path, params) {
  if (calls >= MAX_CALLS) throw new Error(`call budget (${MAX_CALLS}) reached`);
  const url = new URL(BASE + path);
  url.searchParams.set("key", KEY);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  calls++;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 5000));
    return ta(path, params);
  }
  if (!res.ok)
    throw new Error(`Tripadvisor ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
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
  ə: "e",
  Ə: "e",
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
  "coffee",
  "kahve",
  "lokantasi",
  "istanbul",
  "baku",
]);
const norm = (s) =>
  (s ?? "")
    .replace(/[çğıöşüÇĞİIÖŞÜəƏ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function similarity(a, b) {
  const ta = new Set(
    norm(a)
      .split(" ")
      .filter((t) => t && !STOP.has(t)),
  );
  const tb = new Set(
    norm(b)
      .split(" ")
      .filter((t) => t && !STOP.has(t)),
  );
  if (!ta.size || !tb.size) return norm(a) === norm(b) ? 1 : 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
function metres(lat1, lon1, lat2, lon2) {
  const R = 6371000,
    toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function main() {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1, prepare: false });
  const [lat, lon] = CENTERS[city] ?? CENTERS.Istanbul;
  const rows = await sql`
    select v.id, v.name, v.category, v.lat, v.lon
      from public.venues v
      left join public.venue_external e on e.venue_id = v.id and e.source = 'tripadvisor'
     where v.city = ${city} and v.is_active and v.category <> 'Activities'
       and (e.venue_id is null ${REFRESH_DAYS ? sql`or e.fetched_at < now() - (${REFRESH_DAYS} || ' days')::interval` : sql``})
       ${DISTRICT ? sql`and v.district = ${DISTRICT}` : sql``}
       ${RADIUS_KM ? sql`and st_dwithin(v.location, st_setsrid(st_makepoint(${lon}, ${lat}), 4326)::geography, ${RADIUS_KM * 1000})` : sql``}
     order by v.confidence desc nulls last, v.rating_count desc
     limit ${LIMIT}`;
  console.log(
    `${city}: ${rows.length} venues to enrich (${DRY ? "dry run" : "writing"}), call budget ${MAX_CALLS}`,
  );

  let matched = 0,
    unmatched = 0,
    reviewsSaved = 0;
  for (const [i, v] of rows.entries()) {
    try {
      const search = await ta("/location/search", {
        searchQuery: v.name,
        category:
          v.category === "Bars"
            ? "restaurants"
            : v.category === "Cafés"
              ? "restaurants"
              : "restaurants",
        latLong: `${v.lat},${v.lon}`,
        radius: 400,
        radiusUnit: "m",
        language: LANG,
      });
      const candidates = (search.data ?? []).map((c) => ({
        id: c.location_id,
        name: c.name,
        sim: similarity(v.name, c.name),
        dist:
          c.latitude && c.longitude
            ? metres(v.lat, v.lon, Number(c.latitude), Number(c.longitude))
            : 9999,
      }));
      const best = candidates
        .filter((c) => c.sim >= 0.5)
        .sort((a, b) => b.sim - a.sim || a.dist - b.dist)[0];
      if (!best) {
        unmatched++;
        if (DRY)
          console.log(
            `  ✗ ${v.name} → no match (${
              candidates
                .slice(0, 2)
                .map((c) => c.name)
                .join(" / ") || "nothing nearby"
            })`,
          );
        continue;
      }
      const details = await ta(`/location/${best.id}/details`, {
        language: LANG,
        currency: city === "Baku" ? "AZN" : "TRY",
      });
      const reviewCount = Number(details.num_reviews ?? 0);
      const reviews =
        reviewCount > 0
          ? ((await ta(`/location/${best.id}/reviews`, { language: LANG })).data ?? [])
          : [];
      matched++;
      if (DRY) {
        console.log(
          `  ✓ ${v.name} → ${details.name} ★${details.rating ?? "-"} (${reviewCount} reviews) ${details.price_level ?? ""} ${(
            details.cuisine ?? []
          )
            .map((c) => c.localized_name ?? c.name)
            .slice(0, 3)
            .join(", ")}`,
        );
        for (const r of reviews.slice(0, 2))
          console.log(
            `       "${(r.title ?? "").slice(0, 60)}" ★${r.rating}: ${(r.text ?? "").slice(0, 110)}…`,
          );
        continue;
      }
      await sql`
        insert into public.venue_external (venue_id, source, external_id, match_score, rating, review_count, price_level, cuisines, features, ranking_text, web_url, raw, fetched_at)
        values (${v.id}, 'tripadvisor', ${String(best.id)}, ${best.sim}, ${details.rating ?? null}, ${reviewCount},
                ${details.price_level ?? null},
                ${(details.cuisine ?? []).map((c) => c.localized_name ?? c.name)},
                ${(details.features ?? []).map(String)},
                ${details.ranking_data?.ranking_string ?? null}, ${details.web_url ?? null}, ${JSON.stringify(details)}, now())
        on conflict (venue_id, source) do update set
          external_id = excluded.external_id, match_score = excluded.match_score, rating = excluded.rating,
          review_count = excluded.review_count, price_level = excluded.price_level, cuisines = excluded.cuisines,
          features = excluded.features, ranking_text = excluded.ranking_text, web_url = excluded.web_url,
          raw = excluded.raw, fetched_at = now()`;
      await sql`update public.venues set external_rating = ${details.rating ?? null}, external_review_count = ${reviewCount}, updated_at = now() where id = ${v.id}`;
      for (const r of reviews) {
        await sql`
          insert into public.venue_reviews_external (venue_id, source, external_id, rating, title, body, lang, trip_type, published_at)
          values (${v.id}, 'tripadvisor', ${String(r.id)}, ${r.rating ?? null}, ${r.title ?? null}, ${r.text ?? null}, ${r.lang ?? LANG}, ${r.trip_type ?? null}, ${r.published_date ? r.published_date.slice(0, 10) : null})
          on conflict (source, external_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body, fetched_at = now()`;
        reviewsSaved++;
      }
    } catch (err) {
      console.error(`\n  ${v.name}: ${err.message}`);
      if (/call budget/.test(err.message)) break;
    }
    process.stdout.write(
      `  ${i + 1}/${rows.length} · matched ${matched} · unmatched ${unmatched} · reviews ${reviewsSaved} · calls ${calls}\r`,
    );
  }
  console.log(
    `\nfinished: matched ${matched}, unmatched ${unmatched}, reviews saved ${reviewsSaved}, API calls used ${calls}`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
