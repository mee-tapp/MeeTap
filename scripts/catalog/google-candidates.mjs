#!/usr/bin/env node
/**
 * Meetap pilot catalog – step A: candidate venues from Google Places API (New).
 *
 * Runs Text Search per (query × area) over the city, keeps one row per place
 * and writes a ranked candidate list for the manual selection in step B.
 * Uses the Pro field tier only (rating, userRatingCount, priceLevel, types):
 * 5,000 free Text Search calls per month; a full Baku run is ~150 calls.
 *
 * Usage:
 *   node --env-file=.env scripts/catalog/google-candidates.mjs --city Baku
 *   node --env-file=.env scripts/catalog/google-candidates.mjs --city Baku --dry-run   # prints the queries only
 *
 * Output: data/catalog/<city>-candidates.json  (+ .csv for a spreadsheet)
 */
import { mkdir, writeFile } from "node:fs/promises";

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
const dryRun = args["dry-run"] === true;
const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY && !dryRun) {
  console.error("GOOGLE_PLACES_API_KEY is not set in .env");
  process.exit(1);
}

/** Search areas: centre districts get a tight radius, "worth the trip" spots a wide one. */
const AREAS = {
  Baku: [
    { name: "İçərişəhər / Fountains", lat: 40.3667, lon: 49.8352, radius: 1500 },
    { name: "Sahil / Bulvar", lat: 40.3705, lon: 49.8445, radius: 1500 },
    { name: "Nizami / 28 May", lat: 40.3795, lon: 49.8465, radius: 1500 },
    { name: "Nəsimi / Gənclik", lat: 40.3985, lon: 49.8515, radius: 2000 },
    { name: "Yasamal", lat: 40.383, lon: 49.818, radius: 2000 },
    { name: "Xətai / Ağ Şəhər", lat: 40.381, lon: 49.873, radius: 2000 },
    { name: "Bayıl / Badamdar", lat: 40.352, lon: 49.83, radius: 2500 },
    { name: "Bilgəh / Nardaran", lat: 40.575, lon: 49.94, radius: 6000 },
    { name: "Mərdəkan / Şüvəlan", lat: 40.493, lon: 50.14, radius: 6000 },
    { name: "Novxanı", lat: 40.525, lon: 49.79, radius: 5000 },
  ],
  Istanbul: [
    { name: "Kadıköy / Moda", lat: 40.9905, lon: 29.025, radius: 2000 },
    { name: "Beyoğlu / Cihangir", lat: 41.032, lon: 28.977, radius: 2000 },
    { name: "Beşiktaş / Nişantaşı", lat: 41.045, lon: 29.0, radius: 2500 },
    { name: "Karaköy / Sultanahmet", lat: 41.015, lon: 28.975, radius: 2500 },
  ],
};
/** Text Search queries: each becomes "<query> in <area>, <city>". */
const QUERIES = [
  "restaurants",
  "Azerbaijani cuisine restaurant",
  "national cuisine restaurant",
  "fine dining restaurant",
  "romantic restaurant",
  "family restaurant",
  "steakhouse",
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
  "specialty coffee",
  "tea house",
  "dessert",
  "bakery pastry",
  "cheesecake",
  "bar",
  "pub",
  "cocktail bar",
  "wine bar",
  "lounge",
  "hookah lounge",
  "karaoke",
  "live music restaurant",
  "restaurant with private rooms",
  "sea view restaurant",
  "rooftop restaurant",
  "late night food",
  "kebab",
  "qutab doner fast food",
];

const areas = AREAS[city];
if (!areas) {
  console.error(`No search areas defined for ${city}`);
  process.exit(1);
}

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.businessStatus",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

async function textSearch(textQuery, area, pageToken) {
  const body = {
    textQuery,
    pageSize: 20,
    languageCode: "en",
    locationBias: {
      circle: { center: { latitude: area.lat, longitude: area.lon }, radius: area.radius },
    },
    ...(pageToken ? { pageToken } : {}),
  };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const PRICE = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const byId = new Map();
let calls = 0;
for (const area of areas) {
  for (const q of QUERIES) {
    const textQuery = `${q} in ${area.name.split(" / ")[0]}, ${city}`;
    if (dryRun) {
      console.log(textQuery);
      continue;
    }
    let pageToken;
    let pages = 0;
    do {
      const json = await textSearch(textQuery, area, pageToken);
      calls += 1;
      for (const p of json.places ?? []) {
        if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
        const prev = byId.get(p.id);
        const row = prev ?? {
          place_id: p.id,
          name: p.displayName?.text ?? "",
          address: p.formattedAddress ?? "",
          lat: p.location?.latitude,
          lon: p.location?.longitude,
          types: p.types ?? [],
          primary_type: p.primaryType ?? null,
          rating: p.rating ?? null,
          review_count: p.userRatingCount ?? 0,
          price_level: PRICE[p.priceLevel] ?? null,
          maps_url: p.googleMapsUri ?? null,
          areas: [],
          queries: [],
        };
        if (!row.areas.includes(area.name)) row.areas.push(area.name);
        if (!row.queries.includes(q)) row.queries.push(q);
        byId.set(p.id, row);
      }
      pageToken = json.nextPageToken;
      pages += 1;
    } while (pageToken && pages < 2); // 2 pages × 20 = 40 per query/area is plenty
    process.stdout.write(`\r${calls} calls · ${byId.size} places   `);
  }
}
if (dryRun) process.exit(0);

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
console.log(`\n${rows.length} candidates → ${base}.json / .csv (${calls} Text Search calls)`);
