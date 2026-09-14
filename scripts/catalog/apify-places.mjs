#!/usr/bin/env node
/**
 * Meetap pilot catalog – Google Maps via Apify's "Google Maps Scraper"
 * (compass/crawler-google-places). No Google Cloud account or API key needed:
 * only APIFY_TOKEN (free plan, $5 credit per month, no card).
 *
 * Two modes:
 *
 *   --search   Step A: candidates. Runs the search terms over the city areas
 *              and writes data/catalog/<city>-candidates.json/.csv with
 *              rating, review count, price, category, place id.
 *              Cost ≈ $0.004 per place (no detail page). 600 places ≈ $2.4.
 *
 *   --details  Step C+D: for every `keep = 1` row of data/catalog/<city>-pilot.csv,
 *              opens the place page (hours, amenities, description) and pulls
 *              up to --max-reviews reviews → venues (catalog_tier='pilot'),
 *              venue_external(source='google'), venue_reviews_external.
 *              Cost ≈ $0.006 per place + $0.0005 per review.
 *              300 places × 10 reviews ≈ $1.8 + $1.5 = $3.3.
 *
 * Usage:
 *   node --env-file=.env scripts/catalog/apify-places.mjs --search --city Baku
 *   node --env-file=.env scripts/catalog/apify-places.mjs --search --city Baku --max-per-search 20 --dry-run
 *   node --env-file=.env scripts/catalog/apify-places.mjs --details --city Baku --max-reviews 10
 *   node --env-file=.env scripts/catalog/apify-places.mjs --details --city Baku --limit 3 --dry-run
 *
 * The free credit is a hard stop on Apify's side (runs fail when it is gone),
 * so a run can never cost money by accident.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import {
  ESTABLISHMENT_CATEGORY,
  GOOGLE_AMENITY_MAP,
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
const currency = args.currency ?? (city === "Baku" ? "AZN" : "TRY");
const dryRun = args["dry-run"] === true;
const limit = args.limit ? Number(args.limit) : Infinity;
const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("APIFY_TOKEN is not set in .env (apify.com → Settings → Integrations)");
  process.exit(1);
}
if (!args.search && !args.details) {
  console.error("pass --search or --details");
  process.exit(1);
}

// ---- Apify -------------------------------------------------------------------
const ACTOR = "compass~crawler-google-places";
async function runActor(input, label) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}&timeout=1800&format=json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(`apify ${label} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

// ---- city config ---------------------------------------------------------------
const AREAS = {
  Baku: {
    query: "Baku, Azerbaijan",
    // "worth the trip" places outside the centre – searched separately, small quota
    outside: ["Bilgah, Baku", "Mardakan, Baku", "Novkhani, Azerbaijan", "Nardaran, Baku"],
  },
  Istanbul: { query: "Kadıköy, Istanbul", outside: [] },
};
const SEARCHES = [
  "restaurant",
  "Azerbaijani restaurant",
  "national cuisine restaurant",
  "fine dining restaurant",
  "romantic restaurant",
  "family restaurant",
  "steak house",
  "seafood restaurant",
  "Georgian restaurant",
  "Turkish restaurant",
  "Italian restaurant",
  "pizza",
  "sushi restaurant",
  "Asian restaurant",
  "Indian restaurant",
  "burger",
  "breakfast",
  "cafe",
  "coffee shop",
  "tea house",
  "dessert",
  "bakery",
  "cheesecake",
  "bar",
  "pub",
  "cocktail bar",
  "lounge",
  "hookah lounge",
  "karaoke",
  "live music restaurant",
  "restaurant with private rooms",
  "sea view restaurant",
  "rooftop restaurant",
  "late night restaurant",
  "kebab",
  "qutab",
];
const OUTSIDE_SEARCHES = ["restaurant", "seaside restaurant", "cafe"];

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

/** Scraped item → catalog fields. Works for search items (few fields) and detail items. */
export function mapItem(it) {
  const name = it.title ?? "";
  const categoryNames = [it.categoryName, ...(it.categories ?? [])]
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
  // additionalInfo: { "Offerings": [{ "Halal food": true }, …], "Atmosphere": [{ "Romantic": true }], … }
  for (const group of Object.values(it.additionalInfo ?? {})) {
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
  const hours = (it.openingHours ?? []).map((h) => `${h.day}: ${h.hours}`).join("; ") || null;
  if (
    /(11|12):\d\d\s*(AM|PM)?\s*$|(1|2|3|4)\s*AM/i.test(hours ?? "") &&
    /PM|AM/i.test(hours ?? "")
  ) {
    // closes at 11 PM or later somewhere in the week
    const late = (it.openingHours ?? []).some((h) =>
      /(11|12)(:\d\d)?\s*PM|[1-4](:\d\d)?\s*AM/i.test(h.hours ?? ""),
    );
    if (late) {
      meals.add("late_night");
      features.add("late_open");
    }
  }
  return {
    name,
    slug: slugify(name),
    establishment_type: establishment,
    category: ESTABLISHMENT_CATEGORY[establishment],
    raw_type: (it.categoryName ?? "").toLowerCase().replace(/[^a-z]+/g, "_") || null,
    cuisines: [...cuisines],
    features: [...features],
    good_for: [...goodFor],
    meals: [...meals],
    ambiance_tags: [...ambiance],
    price_band: PRICE[it.price] ?? null,
    lat: it.location?.lat ?? null,
    lon: it.location?.lng ?? null,
    address: it.address ?? null,
    district: it.neighborhood ?? null,
    website: it.website ?? null,
    phone: it.phone ?? null,
    opening_hours: hours,
    editorial_summary: it.description ?? null,
    google_place_id: it.placeId,
    google_maps_url: it.url ?? null,
    rating: it.totalScore ?? null,
    review_count: it.reviewsCount ?? null,
    closed: Boolean(it.permanentlyClosed || it.temporarilyClosed),
    reviews: (it.reviews ?? []).map((r) => ({
      external_id: r.reviewId ?? `${it.placeId}:${r.publishedAtDate}:${r.name}`,
      rating: r.stars ?? null,
      body: r.text ?? r.textTranslated ?? null,
      lang: r.language ?? r.originalLanguage ?? null,
      published_at: r.publishedAtDate ? String(r.publishedAtDate).slice(0, 10) : null,
      author: r.name ?? null,
      author_review_count: r.reviewerNumberOfReviews ?? null,
      likes: r.likesCount ?? null,
      raw: r,
    })),
  };
}

// ---- --search ------------------------------------------------------------------
if (args.search) {
  const cfg = AREAS[city];
  if (!cfg) {
    console.error(`No config for ${city}`);
    process.exit(1);
  }
  const maxPer = Number(args["max-per-search"] ?? 20);
  const runs = [
    {
      label: "centre",
      input: {
        searchStringsArray: SEARCHES,
        locationQuery: cfg.query,
        maxCrawledPlacesPerSearch: maxPer,
      },
    },
    ...cfg.outside.map((loc) => ({
      label: loc,
      input: {
        searchStringsArray: OUTSIDE_SEARCHES,
        locationQuery: loc,
        maxCrawledPlacesPerSearch: 10,
      },
    })),
  ];
  const common = {
    language: "en",
    skipClosedPlaces: true,
    scrapePlaceDetailPage: false,
    maxReviews: 0,
    maxImages: 0,
  };
  const estimate = runs.reduce(
    (n, r) => n + r.input.searchStringsArray.length * r.input.maxCrawledPlacesPerSearch,
    0,
  );
  console.log(
    `${runs.length} runs, up to ${estimate} places ≈ $${(estimate * 0.004).toFixed(2)} of Apify credit`,
  );
  if (dryRun) {
    for (const r of runs) console.log(r.label, JSON.stringify({ ...common, ...r.input }));
    process.exit(0);
  }
  const byId = new Map();
  for (const r of runs) {
    const items = await runActor({ ...common, ...r.input }, r.label);
    for (const it of items) {
      if (!it.placeId || it.permanentlyClosed) continue;
      const row = byId.get(it.placeId) ?? {
        place_id: it.placeId,
        name: it.title,
        address: it.address ?? "",
        lat: it.location?.lat,
        lon: it.location?.lng,
        types: [it.categoryName, ...(it.categories ?? [])].filter(Boolean),
        primary_type: it.categoryName ?? null,
        rating: it.totalScore ?? null,
        review_count: it.reviewsCount ?? 0,
        price_level: PRICE[it.price] ?? null,
        maps_url: it.url ?? null,
        areas: [],
        queries: [],
      };
      if (!row.areas.includes(r.label)) row.areas.push(r.label);
      if (it.searchString && !row.queries.includes(it.searchString))
        row.queries.push(it.searchString);
      byId.set(it.placeId, row);
    }
    console.log(`${r.label}: ${items.length} items → ${byId.size} unique places`);
  }
  const rows = [...byId.values()].sort(
    (a, b) => b.review_count - a.review_count || (b.rating ?? 0) - (a.rating ?? 0),
  );
  await mkdir("data/catalog", { recursive: true });
  const base = `data/catalog/${city.toLowerCase()}-candidates`;
  await writeFile(`${base}.json`, JSON.stringify(rows, null, 1));
  const csv = [
    "keep,place_id,name,rating,review_count,price_level,primary_type,types,areas,queries,address,maps_url",
    ...rows.map((r) =>
      [
        "",
        r.place_id,
        r.name,
        r.rating ?? "",
        r.review_count,
        r.price_level ?? "",
        r.primary_type ?? "",
        r.types.join("|"),
        r.areas.join("|"),
        r.queries.join("|"),
        r.address,
        r.maps_url ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ].join("\n");
  await writeFile(`${base}.csv`, csv);
  console.log(
    `${rows.length} candidates → ${base}.json / .csv · next: node scripts/catalog/select-pilot.mjs --city ${city}`,
  );
  process.exit(0);
}

// ---- --details -----------------------------------------------------------------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [header[i], v])));
  function split(line) {
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
}
const maxReviews = Number(args["max-reviews"] ?? 10);
const selected = parseCsv(await readFile(`data/catalog/${city.toLowerCase()}-pilot.csv`, "utf8"))
  .filter((r) => String(r.keep).trim() === "1")
  .slice(0, limit);
console.log(
  `${selected.length} venues (keep = 1) × up to ${maxReviews} reviews ≈ $${(selected.length * 0.006 + selected.length * maxReviews * 0.0005).toFixed(2)} of Apify credit`,
);
const sql = dryRun ? null : postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
const batchSize = Number(args.batch ?? 25);
let done = 0;
for (let i = 0; i < selected.length; i += batchSize) {
  const batch = selected.slice(i, i + batchSize);
  const input = {
    placeIds: batch.map((r) => r.place_id),
    language: "en",
    scrapePlaceDetailPage: true,
    maxReviews,
    reviewsSort: "newest",
    scrapeReviewsPersonalData: false,
    maxImages: 0,
    maxQuestions: 0,
  };
  if (dryRun && i === 0) console.log("input:", JSON.stringify(input));
  const items = await runActor(input, `details ${i / batchSize + 1}`);
  for (const it of items) {
    const v = mapItem(it);
    if (!v.google_place_id || !v.lat) continue;
    if (dryRun) {
      console.log(JSON.stringify({ ...v, reviews: v.reviews.length }, null, 1));
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
          district = excluded.district, address = excluded.address, location = excluded.location, lat = excluded.lat, lon = excluded.lon,
          opening_hours = excluded.opening_hours, website = excluded.website, phone = excluded.phone,
          price_band = coalesce(venues.price_band, excluded.price_band),
          meals = (select array(select distinct unnest(venues.meals || excluded.meals))),
          features = (select array(select distinct unnest(venues.features || excluded.features))),
          good_for = (select array(select distinct unnest(venues.good_for || excluded.good_for))),
          ambiance_tags = (select array(select distinct unnest(venues.ambiance_tags || excluded.ambiance_tags))),
          google_maps_url = excluded.google_maps_url, editorial_summary = excluded.editorial_summary,
          external_rating = excluded.external_rating, external_review_count = excluded.external_review_count,
          is_active = excluded.is_active, catalog_updated_at = now()
        returning id`;
      const { reviews, ...raw } = it;
      await tx`
        insert into venue_external (venue_id, source, external_id, match_score, rating, review_count, price_level, cuisines, features, web_url, raw)
        values (${venue.id}, 'google', ${v.google_place_id}, 1, ${v.rating}, ${v.review_count}, ${it.price ?? null}, ${v.cuisines}, ${v.features}, ${v.google_maps_url}, ${sql.json(raw)})
        on conflict (venue_id, source) do update set rating = excluded.rating, review_count = excluded.review_count,
          price_level = excluded.price_level, cuisines = excluded.cuisines, features = excluded.features, raw = excluded.raw, fetched_at = now()`;
      for (const r of v.reviews) {
        if (!r.body) continue;
        await tx`
          insert into venue_reviews_external (venue_id, source, external_id, rating, body, lang, published_at, author, author_review_count, likes, raw)
          values (${venue.id}, 'google', ${r.external_id}, ${r.rating}, ${r.body}, ${r.lang}, ${r.published_at}, ${r.author}, ${r.author_review_count}, ${r.likes}, ${sql.json(r.raw)})
          on conflict (source, external_id) do nothing`;
      }
    });
    done += 1;
    process.stdout.write(`\r${done}/${selected.length} ${v.name.padEnd(40).slice(0, 40)}`);
  }
}
console.log(`\n${done} venues ${dryRun ? "previewed" : "loaded"}`);
if (sql) await sql.end();
