#!/usr/bin/env node
/**
 * Meetap pilot catalog – step D: review depth. The official APIs give 5
 * reviews per place (Google) and 5 (Tripadvisor); the recommender needs 20–30
 * per venue to judge quality and to mine dishes/features (kabinet, karaoke…).
 *
 * Source: Apify's "Google Maps Reviews Scraper" actor (compass/google-maps-reviews-scraper),
 * a hosted third-party service Ali signs up for. Free plan: $5 credit/month,
 * pay-per-event ≈ $0.0006 per review → ~8,000 reviews/month for free, i.e.
 * ~25 reviews × 300 venues. Reviews go to venue_reviews_external(source='google')
 * next to the API ones; the LLM profile step reads them all.
 *
 * Usage:
 *   node --env-file=.env scripts/catalog/apify-reviews.mjs --city Baku --max-reviews 25
 *   node --env-file=.env scripts/catalog/apify-reviews.mjs --city Baku --max-reviews 25 --limit 3 --dry-run
 *   node --env-file=.env scripts/catalog/apify-reviews.mjs --venue-id <uuid> --max-reviews 40
 *
 * Needs APIFY_TOKEN in .env (Apify console → Settings → Integrations).
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
const city = args.city ?? "Baku";
const maxReviews = Number(args["max-reviews"] ?? 25);
const limit = args.limit ? Number(args.limit) : Infinity;
const dryRun = args["dry-run"] === true;
const batchSize = Number(args["batch"] ?? 20);
const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("APIFY_TOKEN is not set in .env");
  process.exit(1);
}
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });

// Pilot venues that still have fewer than maxReviews google reviews stored.
const venues = args["venue-id"]
  ? await sql`select id, name, google_place_id from venues where id = ${args["venue-id"]}`
  : await sql`
      select v.id, v.name, v.google_place_id
        from venues v
        left join lateral (select count(*)::int n from venue_reviews_external r where r.venue_id = v.id and r.source = 'google') r on true
       where v.city = ${city} and v.catalog_tier = 'pilot' and v.google_place_id is not null and r.n < ${maxReviews}
       order by v.external_review_count desc nulls last`;
const todo = venues.slice(0, limit);
console.log(`${todo.length} venues need reviews (max ${maxReviews} each)`);

const ACTOR = "compass~google-maps-reviews-scraper";
async function runActor(batch) {
  const input = {
    startUrls: batch.map((v) => ({
      url: `https://www.google.com/maps/place/?q=place_id:${v.google_place_id}`,
    })),
    maxReviews,
    reviewsSort: "newest",
    language: "en",
    personalData: false,
  };
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${TOKEN}&timeout=300&format=json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(`apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

let stored = 0;
for (let i = 0; i < todo.length; i += batchSize) {
  const batch = todo.slice(i, i + batchSize);
  const byPlace = new Map(batch.map((v) => [v.google_place_id, v]));
  const items = await runActor(batch);
  if (dryRun) {
    console.log(JSON.stringify(items.slice(0, 3), null, 1));
    console.log(`… ${items.length} review items in this batch`);
    continue;
  }
  for (const it of items) {
    const venue = byPlace.get(it.placeId);
    const body = it.text ?? it.textTranslated ?? null;
    if (!venue || !body) continue;
    const externalId = it.reviewId ?? `${it.placeId}:${it.publishedAtDate}:${it.name}`;
    await sql`
      insert into venue_reviews_external (venue_id, source, external_id, rating, body, lang, published_at, author, author_review_count, likes, raw)
      values (${venue.id}, 'google', ${externalId}, ${it.stars ?? null}, ${body}, ${it.language ?? it.originalLanguage ?? null},
              ${it.publishedAtDate ? String(it.publishedAtDate).slice(0, 10) : null}, ${it.name ?? null},
              ${it.reviewerNumberOfReviews ?? null}, ${it.likesCount ?? null}, ${sql.json(it)})
      on conflict (source, external_id) do nothing`;
    stored += 1;
  }
  console.log(`batch ${i / batchSize + 1}: ${items.length} items, ${stored} stored so far`);
}
console.log(`done · ${stored} reviews stored`);
await sql.end();
