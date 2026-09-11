#!/usr/bin/env node
/**
 * Meetap – enrich ONE existing MeeTap venue from the Terra (Tripadvisor) API:
 * match → external rating/review count → up to 10 normalized reviews →
 * venue_external + venue_reviews_external.
 *
 * Single-venue pilot only (no bulk mode). Reuses the exact matching approach
 * and target-table shape already established by scripts/enrich/tripadvisor.mjs
 * (name-token similarity + coordinate distance, upsert on the same unique
 * constraints), and the search/reviews call shape from
 * scripts/enrich/terra-smoke.mjs / terra-reviews-nergiz.mjs.
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/terra-enrich.mjs --venue-id <uuid> [--dry-run|--write]
 *   (default: --dry-run)
 */
import { serviceClient } from "../../src/lib/recommend/engine.ts";
import { haversineMeters } from "../../src/lib/recommend/scoring.ts";
import { fromTerraReviewJson, validateVenueEvidenceInput, buildVenueEvidenceInput } from "../../src/lib/recommend/venue-evidence.ts";

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

const VENUE_ID = typeof args["venue-id"] === "string" ? args["venue-id"] : null;
if (!VENUE_ID) {
  console.error("Usage: terra-enrich.mjs --venue-id <uuid> [--match-only|--dry-run|--write]");
  process.exit(1);
}
const modeFlags = ["match-only", "dry-run", "write"].filter((f) => args[f] === true);
if (modeFlags.length > 1) {
  console.error(`Pass only one of --match-only / --dry-run / --write (got: ${modeFlags.join(", ")})`);
  process.exit(1);
}
// --match-only: matching sanity-check only – one search call, zero review
// calls, zero writes, regardless of match result.
const MATCH_ONLY = args["match-only"] === true;
const WRITE = args.write === true;
const MAX_REVIEWS = 10;

const KEY = process.env.TERRA_API_KEY;
if (!KEY) {
  console.error("Missing TERRA_API_KEY in .env");
  process.exit(1);
}
const BASE = "https://terra.tripadvisor.com/api";

// Only "RESTAURANT" has ever been empirically confirmed against Terra's real
// API (see terra-smoke.mjs). Other MeeTap categories are mapped the same way
// for now rather than guessing an unverified enum value – revisit once a
// non-Restaurants pilot is actually needed.
const CITY_TERRA_PARAMS = {
  Istanbul: { geo_name: "Istanbul", country_code: "TR" },
  Baku: { geo_name: "Baku", country_code: "AZ" },
};

function pick(obj, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}
function localized(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length) {
    const primary = value.find((v) => v?.primary) ?? value[0];
    return primary?.value ?? null;
  }
  return null;
}
function unwrapLocation(hit) {
  return hit && typeof hit === "object" && hit.location && typeof hit.location === "object"
    ? hit.location
    : hit;
}

// --- name similarity – same token-overlap approach as tripadvisor.mjs --------
const TR_MAP = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u", ə: "e", Ə: "e",
};
const STOP = new Set([
  "cafe", "kafe", "restaurant", "restoran", "bar", "pub", "the", "and", "ve",
  "coffee", "kahve", "lokantasi", "istanbul", "baku",
]);
function norm(s) {
  return (s ?? "")
    .replace(/[çğıöşüÇĞİIÖŞÜəƏ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function nameSimilarity(a, b) {
  const ta = new Set(norm(a).split(" ").filter((t) => t && !STOP.has(t)));
  const tb = new Set(norm(b).split(" ").filter((t) => t && !STOP.has(t)));
  if (!ta.size || !tb.size) return norm(a) === norm(b) ? 1 : 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

// Terra's /locations/search only accepts category in {RESTAURANT, ATTRACTION,
// HOTEL} – there is no CAFE or BAR value. Sending an invalid one silently
// returns zero results (looks like "no match" when it's actually a bad
// request param). Only map when it is clearly correct; omit otherwise so
// Terra searches across all its own categories instead of none.
const TERRA_CATEGORY_BY_MEETAP_CATEGORY = {
  Restaurants: "RESTAURANT",
  // Cafés, Bars, Activities: omitted on purpose – no safe 1:1 Terra value.
};

async function terraSearch(venue) {
  const geo = CITY_TERRA_PARAMS[venue.city] ?? CITY_TERRA_PARAMS.Istanbul;
  const url = new URL(`${BASE}/locations/search`);
  url.searchParams.set("query", venue.name);
  url.searchParams.set("geo_name", geo.geo_name);
  url.searchParams.set("country_code", geo.country_code);
  const terraCategory = TERRA_CATEGORY_BY_MEETAP_CATEGORY[venue.category];
  if (terraCategory) url.searchParams.set("category", terraCategory);
  url.searchParams.set("size", "5");
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-API-Key": KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Terra search HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.results) ? json.results : [];
  return list.map(unwrapLocation);
}

async function terraReviews(locationId) {
  const url = new URL(`${BASE}/locations/${locationId}/reviews`);
  url.searchParams.set("size", String(MAX_REVIEWS));
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-API-Key": KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Terra reviews HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.reviews) ? json.reviews : [];
  return list.slice(0, MAX_REVIEWS);
}

async function main() {
  const supabase = serviceClient();

  // --- 1-2. Real MeeTap venue (read-only). ------------------------------------
  const { data: venue, error: venueErr } = await supabase
    .from("venues")
    .select("id,name,city,lat,lon,category,district,cuisines,price_band,ambiance_tags,external_rating,external_review_count")
    .eq("id", VENUE_ID)
    .maybeSingle();
  if (venueErr) {
    console.error(`Venue lookup failed: ${venueErr.message}`);
    process.exit(1);
  }
  if (!venue) {
    console.error(`No venue with id ${VENUE_ID}.`);
    process.exit(1);
  }
  console.log(`MeeTap venue: ${venue.name} (${venue.city}) [${venue.id}]`);

  // --- 3. One Terra search call. ------------------------------------------------
  let hits;
  try {
    hits = await terraSearch(venue);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!hits.length) {
    console.log("\nMATCH RESULT: REJECTED — Terra search returned no candidates.");
    process.exit(0);
  }

  // --- 4. Conservative match confidence: name similarity + distance, never name alone.
  const candidates = hits.map((h) => {
    const id = pick(h, ["id", "location_id"]);
    const namesArr = Array.isArray(h?.names) ? h.names : null;
    const name = (namesArr?.find((n) => n?.primary) ?? namesArr?.[0])?.value ?? pick(h, ["name"]);
    const lat = pick(h, ["coordinates.latitude"]);
    const lon = pick(h, ["coordinates.longitude"]);
    const distance_m = lat != null && lon != null ? haversineMeters(venue.lat, venue.lon, lat, lon) : null;
    const sim = nameSimilarity(venue.name, name ?? "");
    // Distance evidence: within 300m is strong confirmation, beyond ~2km is
    // effectively "not corroborated" even if the name matched.
    const distProximity =
      distance_m == null ? 0.3 /* unknown distance – neutral, not confirming */
      : distance_m <= 300 ? 1
      : distance_m <= 800 ? 0.6
      : distance_m <= 2000 ? 0.3
      : 0;
    const score = Math.round((0.7 * sim + 0.3 * distProximity) * 100) / 100;
    return { raw: h, id, name, distance_m, sim, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  let status;
  if (best.score >= 0.75 && best.sim >= 0.5) status = "MATCHED";
  else if (best.score >= 0.5) status = "REVIEW_REQUIRED";
  else status = "REJECTED";

  console.log(
    `\nTerra candidate: ${best.name} [id=${best.id}] sim=${best.sim.toFixed(2)} distance=${
      best.distance_m != null ? `${Math.round(best.distance_m)}m` : "unknown"
    } → score=${best.score}`,
  );
  console.log(`MATCH RESULT: ${status}`);
  if (status !== "MATCHED") {
    console.log(
      status === "REJECTED"
        ? "Reason: name similarity and/or distance too weak to trust – not writing anything to this venue."
        : "Reason: plausible but not confident enough to auto-write – needs a human look before enrichment.",
    );
    process.exit(0);
  }
  if (MATCH_ONLY) {
    console.log("\nMATCH-ONLY: stopping here. Zero review requests, zero database writes.");
    process.exit(0);
  }

  // --- Fields already present on the SAME search hit – no extra "details" call needed.
  const externalRating = pick(best.raw, ["traveler_ratings.overall.rating"]);
  const externalReviewCount = pick(best.raw, ["traveler_ratings.overall.count"]);
  const priceLevel = pick(best.raw, ["price_level"]);
  const webUrl = pick(best.raw, ["urls.0.url", "web_url", "website"]);

  console.log(`\nExternal rating       : ${externalRating ?? "n/a"}`);
  console.log(`External review count : ${externalReviewCount ?? "n/a"}`);
  console.log(`Price level            : ${priceLevel ?? "n/a"}`);

  // --- 4/5. One Terra reviews call, normalized through the shared adapter. ----
  let rawReviews;
  try {
    rawReviews = await terraReviews(best.id);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const normalized = rawReviews.map(fromTerraReviewJson);
  const evidence = buildVenueEvidenceInput(
    { ...venue, external_rating: externalRating, external_review_count: externalReviewCount },
    normalized,
  );
  const validation = validateVenueEvidenceInput(evidence);

  const dates = normalized.map((r) => r.published_at).filter(Boolean).sort();
  const languages = [...new Set(normalized.map((r) => r.language).filter(Boolean))];

  console.log(`\nReviews fetched        : ${rawReviews.length}`);
  console.log(`Reviews normalized     : ${normalized.length}${validation.ok ? "" : " (VALIDATION FAILED)"}`);
  console.log(`Review date range      : ${dates[0] ?? "n/a"} .. ${dates[dates.length - 1] ?? "n/a"}`);
  console.log(`Languages              : ${languages.length ? languages.join(", ") : "n/a"}`);

  if (!validation.ok) {
    console.error("\nNormalized evidence failed validation, refusing to write:");
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  if (!WRITE) {
    console.log("\nDRY RUN: database writes = ZERO.");
    process.exit(0);
  }

  // --- 7. Write mode: venue_external + venue_reviews_external only. ------------
  // source = 'tripadvisor': Terra IS Tripadvisor's data (terra.tripadvisor.com)
  // and venue_external.source has a check constraint of only
  // ('tripadvisor','google','foursquare') – there is no separate 'terra' value.
  // The raw jsonb below tags how it was actually fetched so this stays
  // distinguishable from a future scripts/enrich/tripadvisor.mjs (Content API)
  // run on the same venue; both upsert the same (venue_id, source) row by
  // design, since they would describe the same real Tripadvisor listing.
  const { error: extErr } = await supabase.from("venue_external").upsert(
    {
      venue_id: venue.id,
      source: "tripadvisor",
      external_id: String(best.id),
      match_score: best.score,
      rating: externalRating,
      review_count: externalReviewCount,
      price_level: priceLevel != null ? String(priceLevel) : null,
      cuisines: [],
      features: [],
      ranking_text: null,
      web_url: webUrl,
      raw: { _fetched_via: "terra_api", ...best.raw },
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,source" },
  );
  if (extErr) {
    console.error(`venue_external write failed: ${extErr.message}`);
    process.exit(1);
  }
  console.log("\nWROTE venue_external (1 row).");

  // Same two summary columns tripadvisor.mjs already updates after every
  // successful match – reusing that exact convention, not a new one.
  const { error: updErr } = await supabase
    .from("venues")
    .update({
      external_rating: externalRating,
      external_review_count: externalReviewCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", venue.id);
  if (updErr) {
    console.error(`venues external_rating/review_count update failed: ${updErr.message}`);
    process.exit(1);
  }
  console.log("Updated venues.external_rating / venues.external_review_count only.");

  let written = 0;
  for (const r of normalized) {
    const { error: revErr } = await supabase.from("venue_reviews_external").upsert(
      {
        venue_id: venue.id,
        source: "tripadvisor",
        external_id: r.external_review_id,
        rating: r.rating,
        title: r.title,
        body: r.text,
        lang: r.language,
        trip_type: r.trip_type,
        published_at: r.published_at ? r.published_at.slice(0, 10) : null,
      },
      { onConflict: "source,external_id" },
    );
    if (revErr) {
      console.error(`venue_reviews_external upsert failed for ${r.external_review_id}: ${revErr.message}`);
      continue;
    }
    written++;
  }
  console.log(`Upserted venue_reviews_external (${written}/${normalized.length} rows).`);
}

main().catch((err) => {
  console.error(`Unhandled error: ${err?.message ?? err}`);
  process.exit(1);
});
