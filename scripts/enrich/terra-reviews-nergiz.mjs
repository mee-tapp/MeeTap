#!/usr/bin/env node
/**
 * Meetap – one-off Terra reviews fetch for a single, already-confirmed venue:
 * Nergiz Restaurant (Baku), Tripadvisor location id 4188325 (see
 * scripts/enrich/terra-smoke.mjs, which found this venue via /locations/search).
 *
 * Writes NOTHING to the database. Saves the raw reviews to a local JSON file
 * as prep material for the future review-intelligence pipeline. Never prints
 * the API key.
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/terra-reviews-nergiz.mjs
 */

const LOCATION_ID = "4188325";
const SIZE = 10;
// Prep data only, not a repo artifact – written outside the project tree.
const OUT_DIR = process.env.TERRA_REVIEWS_OUT_DIR ?? "/tmp";
const OUT_FILE = `${OUT_DIR}/terra-reviews-nergiz-4188325.json`;

const KEY = process.env.TERRA_API_KEY;
if (!KEY) {
  console.error("Missing TERRA_API_KEY in .env");
  process.exit(1);
}

const BASE = "https://terra.tripadvisor.com/api";

function pick(obj, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

/** Terra returns "title"/"text" as arrays of localized entries, like "names" on
 * a location search hit (see terra-smoke.mjs) – prefer the primary one. */
function localized(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length) {
    const primary = value.find((v) => v?.primary) ?? value[0];
    return primary?.value ?? null;
  }
  return null;
}

function printReview(r, index) {
  const author = pick(r, ["user.username", "author.username", "author_name", "author"]);
  const rating = pick(r, ["rating", "review_rating"]);
  const title = localized(pick(r, ["title"]));
  const text = localized(pick(r, ["text", "review_text", "body"]));
  const date = pick(r, ["publish_ts", "published_date", "date", "travel_date"]);
  const subratings = pick(r, ["subratings"]);
  console.log(`\n  [${index + 1}]`);
  if (author != null) console.log(`    Author : ${author}`);
  if (rating != null) console.log(`    Rating : ${rating}`);
  if (date != null) console.log(`    Date   : ${date}`);
  if (title != null) console.log(`    Title  : ${title}`);
  if (text != null)
    console.log(`    Text   : ${String(text).slice(0, 200)}${String(text).length > 200 ? "…" : ""}`);
  if (Array.isArray(subratings) && subratings.length) {
    console.log(
      `    Subratings: ${subratings.map((s) => `${s.type_name ?? s.type}=${s.rating}`).join(", ")}`,
    );
  }
  if (author == null && rating == null && text == null) {
    console.log(`    (no recognizable fields; raw keys: ${Object.keys(r ?? {}).join(", ") || "none"})`);
  }
}

function extractList(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.reviews)) return json.reviews;
  if (Array.isArray(json?.results)) return json.results;
  return null;
}

async function main() {
  const url = new URL(`${BASE}/locations/${LOCATION_ID}/reviews`);
  url.searchParams.set("size", String(SIZE));

  console.log(`Terra reviews fetch – Nergiz Restaurant (location ${LOCATION_ID})`);
  console.log(`  GET ${url.origin}${url.pathname}?${url.searchParams.toString()}`);

  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "X-API-Key": KEY },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      console.error("Request timed out after 15s.");
    } else {
      console.error(`Network error: ${err?.message ?? err}`);
    }
    process.exit(1);
  }

  if (res.status !== 200) {
    let bodyText = "";
    try {
      bodyText = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    if (res.status === 400) console.error(`400 Bad Request.\n${bodyText}`);
    else if (res.status === 401 || res.status === 403)
      console.error(`${res.status} — authentication or access problem.\n${bodyText}`);
    else if (res.status === 404) console.error(`404 — endpoint or location not found.\n${bodyText}`);
    else if (res.status === 429) console.error(`429 — rate limited by Terra.\n${bodyText}`);
    else console.error(`Unexpected HTTP ${res.status}.\n${bodyText}`);
    process.exit(1);
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    console.error(`200 OK but response body was not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const list = extractList(json);
  if (list == null) {
    console.log(
      `200 OK, but no recognizable list of reviews was found. Top-level keys: ${
        json && typeof json === "object" ? Object.keys(json).join(", ") || "(none)" : typeof json
      }`,
    );
    process.exit(1);
  }

  console.log(`Found ${list.length} review(s):`);
  list.slice(0, SIZE).forEach(printReview);

  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify({ location_id: LOCATION_ID, fetched_at: new Date().toISOString(), reviews: list.slice(0, SIZE) }, null, 2),
  );
  console.log(`\nSaved ${Math.min(list.length, SIZE)} review(s) to ${OUT_FILE} (local file only, no DB write).`);
  console.log("\nTERRA REVIEWS FETCH OK");
}

main().catch((err) => {
  console.error(`Unhandled error: ${err?.message ?? err}`);
  process.exit(1);
});
