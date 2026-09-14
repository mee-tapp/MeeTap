#!/usr/bin/env node
/**
 * Meetap pilot catalog – step C: Google Place Details for every selected
 * venue → venues (catalog_tier = 'pilot') + venue_external(source='google')
 * + the 5 Google reviews into venue_reviews_external.
 *
 * One Enterprise-tier call per venue (reviews + atmosphere booleans):
 * 1,000 free per month, so 300 venues fit with room for a monthly refresh.
 * Google content other than place IDs may be cached at most 30 days: re-run
 * monthly; profiles derived by our own LLM step are our content.
 *
 * Usage:
 *   node --env-file=.env scripts/catalog/google-details.mjs --city Baku --currency AZN
 *   node --env-file=.env scripts/catalog/google-details.mjs --city Baku --currency AZN --limit 5 --dry-run
 *   node --env-file=.env scripts/catalog/google-details.mjs --city Baku --refresh-days 30
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  ESTABLISHMENT_CATEGORY,
  GOOGLE_FEATURE_MAP,
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
const currency = args.currency ?? (city === "Baku" ? "AZN" : "TRY");
const limit = args.limit ? Number(args.limit) : Infinity;
const dryRun = args["dry-run"] === true;
const refreshDays = args["refresh-days"] ? Number(args["refresh-days"]) : null;
const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) {
  console.error("GOOGLE_PLACES_API_KEY is not set in .env");
  process.exit(1);
}
const sql = dryRun ? null : postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });

// ---- selection CSV -----------------------------------------------------------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines
    .slice(1)
    .map((l) => Object.fromEntries(splitCsvLine(l).map((v, i) => [header[i], v])));
}
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
const selected = parseCsv(await readFile(`data/catalog/${city.toLowerCase()}-pilot.csv`, "utf8"))
  .filter((r) => String(r.keep).trim() === "1")
  .slice(0, limit);
console.log(`${selected.length} venues selected (keep = 1)`);

// ---- Google Place Details ------------------------------------------------------
const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "types",
  "primaryType",
  "rating",
  "userRatingCount",
  "priceLevel",
  "businessStatus",
  "googleMapsUri",
  "websiteUri",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "editorialSummary",
  "reviews",
  "outdoorSeating",
  "liveMusic",
  "reservable",
  "servesBreakfast",
  "servesBrunch",
  "servesLunch",
  "servesDinner",
  "servesDessert",
  "servesCoffee",
  "servesBeer",
  "servesWine",
  "servesCocktails",
  "servesVegetarianFood",
  "goodForChildren",
  "goodForGroups",
  "goodForWatchingSports",
  "menuForChildren",
  "allowsDogs",
  "delivery",
  "takeout",
  "dineIn",
  "parkingOptions",
  "accessibilityOptions",
  "paymentOptions",
].join(",");

async function details(placeId) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS, "Accept-Language": "en" },
    },
  );
  if (!res.ok) throw new Error(`details ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const PRICE = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};
const TR = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", ə: "e", İ: "i", I: "i" };
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[çğıöşüəİI]/g, (c) => TR[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function wordIn(name, w) {
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(name);
}

/** Google payload → our catalog fields (taxonomy keys only). */
export function mapPlace(p) {
  const name = p.displayName?.text ?? "";
  const types = [p.primaryType, ...(p.types ?? [])].filter(Boolean);
  let establishment = null;
  const cuisines = new Set();
  const features = new Set();
  for (const hint of NAME_HINTS) {
    if (hint.words.some((w) => wordIn(name, w))) {
      if (hint.type && !establishment) establishment = hint.type;
      if (hint.feature) features.add(hint.feature);
    }
  }
  for (const t of types) {
    const m = GOOGLE_TYPE_MAP[t];
    if (!m) continue;
    if (m.type && !establishment) establishment = m.type;
    if (m.cuisine) cuisines.add(m.cuisine);
  }
  if (!establishment) establishment = cuisines.size ? "restaurant" : "restaurant";
  for (const [field, feature] of Object.entries(GOOGLE_FEATURE_MAP))
    if (p[field] === true) features.add(feature);
  if (p.parkingOptions && Object.values(p.parkingOptions).some(Boolean)) features.add("parking");
  if (p.accessibilityOptions?.wheelchairAccessibleEntrance) features.add("wheelchair");
  if (p.paymentOptions?.acceptsCreditCards) features.add("card_payment");
  const meals = [];
  if (p.servesBreakfast) meals.push("breakfast");
  if (p.servesBrunch) meals.push("brunch");
  if (p.servesLunch) meals.push("lunch");
  if (p.servesDinner) meals.push("dinner");
  const closesLate = (p.regularOpeningHours?.periods ?? []).some(
    (per) => per.close && (per.close.hour >= 23 || per.close.hour < 5),
  );
  if (closesLate) {
    meals.push("late_night");
    features.add("late_open");
  }
  const goodFor = [];
  if (p.goodForChildren) goodFor.push("family_kids");
  if (p.goodForGroups) goodFor.push("friends_groups");
  const district =
    (p.addressComponents ?? []).find(
      (c) => c.types?.includes("sublocality") || c.types?.includes("neighborhood"),
    )?.longText ?? null;
  return {
    name,
    slug: slugify(name),
    establishment_type: establishment,
    category: ESTABLISHMENT_CATEGORY[establishment],
    raw_type: p.primaryType ?? null,
    cuisines: [...cuisines],
    features: [...features],
    meals,
    good_for: goodFor,
    price_band: PRICE[p.priceLevel] ?? null,
    lat: p.location?.latitude,
    lon: p.location?.longitude,
    address: p.formattedAddress ?? null,
    district,
    website: p.websiteUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    opening_hours: p.regularOpeningHours?.weekdayDescriptions?.join("; ") ?? null,
    editorial_summary: p.editorialSummary?.text ?? null,
    google_place_id: p.id,
    google_maps_url: p.googleMapsUri ?? null,
    outdoor_seating: p.outdoorSeating ?? null,
    rating: p.rating ?? null,
    review_count: p.userRatingCount ?? null,
    reviews: (p.reviews ?? []).map((r) => ({
      external_id:
        r.name ??
        createHash("sha1")
          .update(`${p.id}:${r.publishTime}:${r.authorAttribution?.displayName}`)
          .digest("hex"),
      rating: r.rating ?? null,
      body: r.originalText?.text ?? r.text?.text ?? null,
      lang: r.originalText?.languageCode ?? r.text?.languageCode ?? null,
      published_at: r.publishTime ? r.publishTime.slice(0, 10) : null,
      author: r.authorAttribution?.displayName ?? null,
    })),
  };
}

let done = 0;
for (const row of selected) {
  if (sql && refreshDays) {
    const fresh =
      await sql`select 1 from venue_external where source='google' and external_id=${row.place_id} and fetched_at > now() - (${refreshDays} || ' days')::interval`;
    if (fresh.length) continue;
  }
  const p = await details(row.place_id);
  const v = mapPlace(p);
  if (dryRun) {
    console.log(JSON.stringify({ ...v, reviews: v.reviews.length }, null, 1));
    done += 1;
    continue;
  }
  await sql.begin(async (tx) => {
    const [venue] = await tx`
      insert into venues (slug, name, category, raw_type, cuisines, city, district, address, location, lat, lon,
                          opening_hours, outdoor_seating, website, phone, price_band, price_band_source, currency,
                          catalog_tier, establishment_type, meals, features, good_for,
                          google_place_id, google_maps_url, editorial_summary, external_rating, external_review_count,
                          rating_avg, rating_count, catalog_updated_at)
      values (${v.slug + "-" + v.google_place_id.slice(-6).toLowerCase()}, ${v.name}, ${v.category}, ${v.raw_type}, ${v.cuisines}, ${city}, ${v.district}, ${v.address},
              st_setsrid(st_makepoint(${v.lon}, ${v.lat}), 4326)::geography, ${v.lat}, ${v.lon},
              ${v.opening_hours}, ${v.outdoor_seating}, ${v.website}, ${v.phone}, ${v.price_band}, ${v.price_band ? "google" : null}, ${currency},
              'pilot', ${v.establishment_type}, ${v.meals}, ${v.features}, ${v.good_for},
              ${v.google_place_id}, ${v.google_maps_url}, ${v.editorial_summary}, ${v.rating}, ${v.review_count},
              null, 0, now())
      on conflict (google_place_id) where google_place_id is not null do update set
        name = excluded.name, category = excluded.category, raw_type = excluded.raw_type,
        cuisines = case when venues.catalog_notes is null then excluded.cuisines else venues.cuisines end,
        district = excluded.district, address = excluded.address, location = excluded.location,
        lat = excluded.lat, lon = excluded.lon, opening_hours = excluded.opening_hours,
        outdoor_seating = excluded.outdoor_seating, website = excluded.website, phone = excluded.phone,
        price_band = coalesce(venues.price_band, excluded.price_band),
        establishment_type = case when venues.catalog_notes is null then excluded.establishment_type else venues.establishment_type end,
        meals = (select array(select distinct unnest(venues.meals || excluded.meals))),
        features = (select array(select distinct unnest(venues.features || excluded.features))),
        good_for = (select array(select distinct unnest(venues.good_for || excluded.good_for))),
        google_maps_url = excluded.google_maps_url, editorial_summary = excluded.editorial_summary,
        external_rating = excluded.external_rating, external_review_count = excluded.external_review_count,
        catalog_updated_at = now()
      returning id`;
    await tx`
      insert into venue_external (venue_id, source, external_id, match_score, rating, review_count, price_level, cuisines, features, web_url, raw)
      values (${venue.id}, 'google', ${v.google_place_id}, 1, ${v.rating}, ${v.review_count}, ${p.priceLevel ?? null}, ${v.cuisines}, ${v.features}, ${v.google_maps_url}, ${sql.json(p)})
      on conflict (venue_id, source) do update set rating = excluded.rating, review_count = excluded.review_count,
        price_level = excluded.price_level, cuisines = excluded.cuisines, features = excluded.features, raw = excluded.raw, fetched_at = now()`;
    for (const r of v.reviews) {
      await tx`
        insert into venue_reviews_external (venue_id, source, external_id, rating, body, lang, published_at, author)
        values (${venue.id}, 'google', ${r.external_id}, ${r.rating}, ${r.body}, ${r.lang}, ${r.published_at}, ${r.author})
        on conflict (source, external_id) do nothing`;
    }
  });
  done += 1;
  process.stdout.write(`\r${done}/${selected.length} ${v.name.padEnd(40).slice(0, 40)}`);
}
console.log(`\n${done} venues ${dryRun ? "previewed" : "loaded"}`);
if (sql) await sql.end();
