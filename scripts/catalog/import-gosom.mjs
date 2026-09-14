#!/usr/bin/env node
/**
 * Meetap pilot catalog – import the output of the open-source, locally run
 * gosom/google-maps-scraper (JSON lines, `-json`) into the catalog tables:
 * venues (catalog_tier='pilot'), venue_external(source='google') and
 * venue_reviews_external (user_reviews + user_reviews_extended).
 *
 * Same taxonomy mapping as the Apify path (category names, "About"
 * amenities → features / good_for / meals / ambiance).
 *
 * Usage:
 *   node --env-file=.env scripts/catalog/import-gosom.mjs data/catalog/baku-gosom.json --city Baku
 *   node --env-file=.env scripts/catalog/import-gosom.mjs data/catalog/baku-gosom.json --city Baku --dry-run --limit 3
 *   node --env-file=.env scripts/catalog/import-gosom.mjs data/catalog/baku-gosom-cafes.json --city Baku --min-reviews 30
 *
 * `--min-reviews N` skips places with fewer Google reviews (for query-based
 * runs that return everything on the map); URL-based runs keep every row.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  ESTABLISHMENT_CATEGORY,
  GOOGLE_AMENITY_MAP,
  GOOGLE_CATEGORY_NAME_MAP,
  GOOGLE_TYPE_MAP,
  NAME_HINTS,
} from "../../src/lib/catalog/taxonomy.ts";

const positional = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
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
const file = positional[0];
if (!file) {
  console.error(
    "Usage: import-gosom.mjs <results.json> --city Baku [--dry-run] [--limit N] [--min-reviews N]",
  );
  process.exit(1);
}
const city = args.city ?? "Baku";
const currency = args.currency ?? (city === "Baku" ? "AZN" : "TRY");
const dryRun = args["dry-run"] === true;
const limit = args.limit ? Number(args.limit) : Infinity;
const minReviews = Number(args["min-reviews"] ?? 0);

// gosom writes one JSON object per line (or a JSON array) – accept both.
const text = await readFile(file, "utf8");
let items;
try {
  items = JSON.parse(text);
  if (!Array.isArray(items)) items = [items];
} catch {
  items = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}
console.log(`${items.length} scraped places in ${file}`);

// Google serves Maps pages in the local language (Azerbaijani) regardless of
// -lang, so category names and amenities in the scrape may be in az. The
// Apify candidate list (English) is merged in by place_id when available.
const candidates = new Map();
try {
  for (const row of JSON.parse(
    await readFile(`data/catalog/${city.toLowerCase()}-candidates.json`, "utf8"),
  ))
    candidates.set(row.place_id, row);
  console.log(`${candidates.size} English candidates available for merging`);
} catch {
  /* no candidate file – rely on the scrape alone */
}

const PRICE = { $: 1, $$: 2, $$$: 3, $$$$: 4 };
const TR = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", ə: "e", İ: "i", I: "i" };
const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[çğıöşüəİI]/g, (c) => TR[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
function wordIn(name, w) {
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(name);
}
function priceBand(range) {
  if (!range) return null;
  if (PRICE[range]) return PRICE[range];
  const m = String(range).match(/(\d+)\s*[–-]\s*(\d+)/); // "20–40 ₼"
  if (!m) return null;
  const mid = (Number(m[1]) + Number(m[2])) / 2;
  const table = currency === "AZN" ? [15, 30, 60] : [300, 700, 1400];
  return mid < table[0] ? 1 : mid < table[1] ? 2 : mid < table[2] ? 3 : 4;
}

export function mapEntry(e, cand = null) {
  const name = e.title ?? "";
  const categoryNames = [
    cand?.raw?.categoryName,
    ...(cand?.raw?.categories ?? []),
    e.category,
    ...(e.categories ?? []),
  ]
    .filter(Boolean)
    .map((c) => c.toLowerCase());
  let establishment = null;
  const cuisines = new Set();
  const features = new Set();
  const goodFor = new Set();
  const meals = new Set();
  const ambiance = new Set();
  for (const hint of NAME_HINTS) {
    if (hint.words.some((w) => wordIn(name, w))) {
      if (hint.type && !establishment) establishment = hint.type;
      if (hint.feature) features.add(hint.feature);
    }
  }
  for (const c of categoryNames) {
    const m = GOOGLE_CATEGORY_NAME_MAP[c] ?? GOOGLE_TYPE_MAP[c.replace(/[^a-z]+/g, "_")];
    if (!m) continue;
    if (m.type && !establishment) establishment = m.type;
    if (m.cuisine) cuisines.add(m.cuisine);
  }
  if (!establishment) establishment = "restaurant";
  // about: [{ id, name: "Offerings", options: [{ name: "Halal food", enabled: true }] }]
  for (const group of e.about ?? []) {
    for (const opt of group.options ?? []) {
      if (!opt.enabled) continue;
      const m = GOOGLE_AMENITY_MAP[String(opt.name).toLowerCase()];
      if (!m) continue;
      if (m.feature) features.add(m.feature);
      if (m.good_for) goodFor.add(m.good_for);
      if (m.meal) meals.add(m.meal);
      if (m.ambiance) ambiance.add(m.ambiance);
    }
  }
  // English amenities from the Apify candidate row (additionalInfo groups).
  for (const group of Object.values(cand?.raw?.additionalInfo ?? {})) {
    for (const entry of group ?? []) {
      for (const [label, on] of Object.entries(entry)) {
        if (!on) continue;
        const m = GOOGLE_AMENITY_MAP[label.toLowerCase()];
        if (!m) continue;
        if (m.feature) features.add(m.feature);
        if (m.good_for) goodFor.add(m.good_for);
        if (m.meal) meals.add(m.meal);
        if (m.ambiance) ambiance.add(m.ambiance);
      }
    }
  }
  if (e.reservations) features.add("reservations");
  if (e.credit_cards_accepted) features.add("card_payment");
  const hoursObj = e.open_hours && typeof e.open_hours === "object" ? e.open_hours : null;
  const hours = hoursObj
    ? Object.entries(hoursObj)
        .map(([day, h]) => `${day}: ${Array.isArray(h) ? h.join(", ") : h}`)
        .join("; ")
    : null;
  if (hours && /(11|12)(:\d\d)?\s*PM|[1-4](:\d\d)?\s*AM/i.test(hours)) {
    meals.add("late_night");
    features.add("late_open");
  }
  const reviews = [...(e.user_reviews ?? []), ...(e.user_reviews_extended ?? [])];
  const seen = new Set();
  const mapped = [];
  for (const r of reviews) {
    const body = r.text_original || r.text_translated || r.Description || null;
    const id =
      r.review_id ??
      `${e.place_id}:${r.posted_at_unix_micros ?? r.When ?? ""}:${(body ?? "").slice(0, 20)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const micros = Number(r.posted_at_unix_micros ?? 0);
    mapped.push({
      external_id: id,
      rating: r.rating_float ?? r.Rating ?? null,
      body,
      lang: r.language ?? null,
      published_at: micros
        ? new Date(micros / 1000).toISOString().slice(0, 10)
        : (r.published_at ?? null),
      author: r.Name ?? null,
      raw: r,
    });
  }
  return {
    name,
    slug: slugify(name),
    establishment_type: establishment,
    category: ESTABLISHMENT_CATEGORY[establishment],
    raw_type: (e.category ?? "").toLowerCase().replace(/[^a-z]+/g, "_") || null,
    cuisines: [...cuisines],
    features: [...features],
    good_for: [...goodFor],
    meals: [...meals],
    ambiance_tags: [...ambiance],
    price_band: priceBand(e.price_range),
    lat: e.latitude ?? null,
    lon: e.longtitude ?? e.longitude ?? null,
    address: e.address ?? null,
    district: e.complete_address?.borough || cand?.raw?.neighborhood || null,
    website: e.web_site ?? null,
    phone: e.phone ?? null,
    opening_hours: hours,
    editorial_summary: e.description || cand?.raw?.description || null,
    google_place_id: e.place_id ?? null,
    google_maps_url: e.link ?? null,
    rating: e.review_rating ?? null,
    review_count: e.review_count ?? null,
    closed: /closed/i.test(e.status ?? "") && !/open/i.test(e.status ?? ""),
    reviews: mapped,
  };
}

const sql = dryRun ? null : postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
let done = 0;
let reviewsStored = 0;
let skipped = 0;
for (const e of items.slice(0, limit)) {
  const v = mapEntry(e, candidates.get(e.place_id) ?? candidates.get(e.input_id) ?? null);
  if (!v.google_place_id || v.lat == null || (v.review_count ?? 0) < minReviews) {
    skipped += 1;
    continue;
  }
  if (dryRun) {
    console.log(
      JSON.stringify(
        { ...v, reviews: v.reviews.length, sample_review: v.reviews[0]?.body?.slice(0, 80) },
        null,
        1,
      ),
    );
    done += 1;
    continue;
  }
  await sql.begin(async (tx) => {
    const [venue] = await tx`
      insert into venues (slug, name, category, raw_type, cuisines, city, district, address, location, lat, lon,
                          opening_hours, website, phone, price_band, price_band_source, currency,
                          catalog_tier, establishment_type, meals, features, good_for, ambiance_tags, ambiance_source,
                          google_place_id, google_maps_url, editorial_summary, external_rating, external_review_count,
                          rating_avg, rating_count, is_active, catalog_updated_at)
      values (${v.slug + "-" + v.google_place_id.slice(-6).toLowerCase()}, ${v.name}, ${v.category}, ${v.raw_type}, ${v.cuisines}, ${city}, ${v.district}, ${v.address},
              st_setsrid(st_makepoint(${v.lon}, ${v.lat}), 4326)::geography, ${v.lat}, ${v.lon},
              ${v.opening_hours}, ${v.website}, ${v.phone}, ${v.price_band}, ${v.price_band ? "google" : null}, ${currency},
              'pilot', ${v.establishment_type}, ${v.meals}, ${v.features}, ${v.good_for}, ${v.ambiance_tags}, ${v.ambiance_tags.length ? "source" : null},
              ${v.google_place_id}, ${v.google_maps_url}, ${v.editorial_summary}, ${v.rating}, ${v.review_count},
              null, 0, ${!v.closed}, now())
      on conflict (google_place_id) where google_place_id is not null do update set
        name = excluded.name, category = excluded.category, raw_type = excluded.raw_type,
        cuisines = case when venues.catalog_notes is null then excluded.cuisines else venues.cuisines end,
        establishment_type = case when venues.catalog_notes is null then excluded.establishment_type else venues.establishment_type end,
        district = coalesce(excluded.district, venues.district), address = excluded.address, location = excluded.location, lat = excluded.lat, lon = excluded.lon,
        opening_hours = coalesce(excluded.opening_hours, venues.opening_hours), website = coalesce(excluded.website, venues.website), phone = coalesce(excluded.phone, venues.phone),
        price_band = coalesce(venues.price_band, excluded.price_band),
        meals = (select array(select distinct unnest(venues.meals || excluded.meals))),
        features = (select array(select distinct unnest(venues.features || excluded.features))),
        good_for = (select array(select distinct unnest(venues.good_for || excluded.good_for))),
        ambiance_tags = (select array(select distinct unnest(venues.ambiance_tags || excluded.ambiance_tags))),
        google_maps_url = excluded.google_maps_url, editorial_summary = coalesce(excluded.editorial_summary, venues.editorial_summary),
        external_rating = excluded.external_rating, external_review_count = excluded.external_review_count,
        is_active = excluded.is_active, catalog_updated_at = now()
      returning id`;
    const { user_reviews, user_reviews_extended, images, ...raw } = e;
    await tx`
      insert into venue_external (venue_id, source, external_id, match_score, rating, review_count, price_level, cuisines, features, web_url, raw)
      values (${venue.id}, 'google', ${v.google_place_id}, 1, ${v.rating}, ${v.review_count}, ${e.price_range ?? null}, ${v.cuisines}, ${v.features}, ${v.google_maps_url}, ${sql.json(raw)})
      on conflict (venue_id, source) do update set rating = excluded.rating, review_count = excluded.review_count,
        price_level = excluded.price_level, cuisines = excluded.cuisines, features = excluded.features, raw = excluded.raw, fetched_at = now()`;
    for (const r of v.reviews) {
      if (!r.body) continue;
      const res = await tx`
        insert into venue_reviews_external (venue_id, source, external_id, rating, body, lang, published_at, author, raw)
        values (${venue.id}, 'google', ${r.external_id}, ${r.rating}, ${r.body}, ${r.lang}, ${r.published_at}, ${r.author}, ${sql.json(r.raw)})
        on conflict (source, external_id) do nothing`;
      reviewsStored += res.count;
    }
  });
  done += 1;
  process.stdout.write(`\r${done} venues · ${reviewsStored} reviews   `);
}
console.log(
  `\n${done} venues ${dryRun ? "previewed" : "loaded"}, ${reviewsStored} reviews stored, ${skipped} skipped`,
);
if (sql) await sql.end();
