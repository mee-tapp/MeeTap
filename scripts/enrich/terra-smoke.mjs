#!/usr/bin/env node
/**
 * Meetap – connectivity smoke test for the Tripadvisor Terra API
 * (https://terra.tripadvisor.com/api). Proves auth + one search call work;
 * does NOT write anything to the database and does NOT touch venue_external
 * or venue_reviews_external. See scripts/enrich/tripadvisor.mjs for the
 * (separate, unrelated) official Content API pipeline this does not replace.
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/terra-smoke.mjs --query "restaurant name"
 *   node --env-file=.env scripts/enrich/terra-smoke.mjs --query "Nizami" --geo Baku --country AZ --category RESTAURANT
 *
 * Sends exactly ONE request to GET /locations/search and prints a compact,
 * defensive inspection of the response. Never prints the API key.
 */

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

const QUERY = typeof args.query === "string" ? args.query : null;
if (!QUERY) {
  console.error(
    '--query is required. Usage: node --env-file=.env scripts/enrich/terra-smoke.mjs --query "restaurant name" [--geo Baku] [--country AZ] [--category RESTAURANT]',
  );
  process.exit(1);
}

const KEY = process.env.TERRA_API_KEY;
if (!KEY) {
  console.error("Missing TERRA_API_KEY in .env");
  process.exit(1);
}

const GEO = typeof args.geo === "string" ? args.geo : "Baku";
const COUNTRY = typeof args.country === "string" ? args.country : "AZ";
const CATEGORY = typeof args.category === "string" ? args.category : "RESTAURANT";

const BASE = "https://terra.tripadvisor.com/api";

/** Pull the first present value out of a list of possible field names, without assuming any of them exist. */
function pick(obj, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

/** Terra returns some fields ("names", "addresses") as arrays of localized entries. */
function firstEntry(arr) {
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

function printLocation(loc, index) {
  // Terra nests the actual fields one level under "location" on each search
  // hit; unwrap it if present, otherwise use the item as-is.
  const item = loc && typeof loc === "object" && loc.location && typeof loc.location === "object"
    ? loc.location
    : loc;

  const id = pick(item, ["id", "location_id", "tripadvisor_id"]);

  // "names": [{ language, value, primary }, ...] – prefer the primary entry.
  const namesArr = Array.isArray(item?.names) ? item.names : null;
  const primaryName = namesArr?.find((n) => n?.primary) ?? firstEntry(namesArr);
  const name = primaryName?.value ?? pick(item, ["name", "title"]);

  // "addresses": [{ formatted, street_address, city, country_name, ... }, ...]
  const addressesArr = Array.isArray(item?.addresses) ? item.addresses : null;
  const address = firstEntry(addressesArr)?.formatted ?? pick(item, ["address", "formatted_address"]);

  // "coordinates": { latitude, longitude }
  const lat = pick(item, ["coordinates.latitude", "latitude", "lat"]);
  const lon = pick(item, ["coordinates.longitude", "longitude", "lon", "lng"]);

  const categories = pick(item, ["categories", "category_list", "category"]);

  // "traveler_ratings": { overall: { rating, count }, ... }
  const rating = pick(item, ["traveler_ratings.overall.rating", "rating", "traveler_rating"]);
  const reviewCount = pick(item, [
    "traveler_ratings.overall.count",
    "num_reviews",
    "review_count",
  ]);

  console.log(`\n  [${index + 1}]`);
  if (id != null) console.log(`    Tripadvisor ID : ${id}`);
  if (name != null) console.log(`    Name           : ${name}`);
  if (address != null) console.log(`    Address        : ${address}`);
  if (lat != null || lon != null) console.log(`    Lat/Lon        : ${lat ?? "?"}, ${lon ?? "?"}`);
  if (categories != null)
    console.log(`    Categories     : ${Array.isArray(categories) ? categories.join(", ") : categories}`);
  if (rating != null) console.log(`    Traveler rating: ${rating}`);
  if (reviewCount != null) console.log(`    Review count   : ${reviewCount}`);
  if (id == null && name == null && address == null && lat == null && lon == null) {
    console.log(
      `    (no recognizable fields; raw keys: ${Object.keys(item ?? {}).join(", ") || "none"})`,
    );
  }
}

/** Response shape isn't guaranteed; look for the first array we can find without assuming one exists. */
function extractLocations(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  if (Array.isArray(json?.locations)) return json.locations;
  return null;
}

async function main() {
  // NOTE: new URL("/x", BASE) would treat the leading slash as origin-relative
  // and silently drop BASE's "/api" path segment — build the full path instead.
  const url = new URL(`${BASE}/locations/search`);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("geo_name", GEO);
  url.searchParams.set("country_code", COUNTRY);
  url.searchParams.set("category", CATEGORY);
  url.searchParams.set("size", "5");

  console.log(`Terra smoke test`);
  console.log(`  query=${QUERY} geo=${GEO} country=${COUNTRY} category=${CATEGORY}`);
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

  if (res.status === 200) {
    let json;
    try {
      json = await res.json();
    } catch (err) {
      console.error(`200 OK but response body was not valid JSON: ${err.message}`);
      process.exit(1);
    }
    const locations = extractLocations(json);
    if (locations == null) {
      console.log(
        `200 OK, but no recognizable list of locations was found. Top-level response keys: ${
          json && typeof json === "object" ? Object.keys(json).join(", ") || "(none)" : typeof json
        }`,
      );
    } else {
      console.log(`Found ${locations.length} location(s):`);
      locations.forEach(printLocation);
    }
    console.log("\nTERRA CONNECTION OK");
    return;
  }

  let bodyText = "";
  try {
    bodyText = (await res.text()).slice(0, 300);
  } catch {
    // ignore
  }

  if (res.status === 400) {
    console.error(`400 Bad Request — invalid search parameters.\n${bodyText}`);
  } else if (res.status === 401 || res.status === 403) {
    console.error(
      `${res.status} — authentication or access problem (check TERRA_API_KEY / plan access).\n${bodyText}`,
    );
  } else if (res.status === 429) {
    console.error(`429 — rate limited by Terra.\n${bodyText}`);
  } else {
    console.error(`Unexpected HTTP ${res.status}.\n${bodyText}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`Unhandled error: ${err?.message ?? err}`);
  process.exit(1);
});
