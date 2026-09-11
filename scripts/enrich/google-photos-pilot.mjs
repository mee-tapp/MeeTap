#!/usr/bin/env node
/**
 * Meetap – Google Places (New) photo pilot for ONE existing MeeTap venue.
 * Match-only + fetch, no DB writes. Mirrors the Terra enrichment discipline:
 * name+distance match validation (never name alone), one text-search call,
 * one photo-media call, nothing else.
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/google-photos-pilot.mjs --venue-id <uuid>
 */
import { serviceClient } from "../../src/lib/recommend/engine.ts";
import { haversineMeters } from "../../src/lib/recommend/scoring.ts";

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
  console.error("Usage: google-photos-pilot.mjs --venue-id <uuid>");
  process.exit(1);
}

const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY in .env");
  process.exit(1);
}

// Same TR/AZ-aware normalization already proven in terra-enrich.mjs /
// tripadvisor.mjs – folds diacritics (ə, ç, ğ, ı, ö, ş, ü…) instead of
// stripping them, and treats "restaurant"/"restoran" etc. as the same word.
const TR_MAP = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u", ə: "e", Ə: "e",
};
const STOP = new Set([
  "restaurant", "restoran", "restoran", "cafe", "kafe", "bar", "pub", "the", "and", "ve",
]);
function norm(s) {
  return (s ?? "")
    .replace(/[çğıöşüəÇĞİIÖŞÜƏ]/g, (c) => TR_MAP[c] ?? c)
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

async function main() {
  const supabase = serviceClient();
  const { data: venue, error } = await supabase
    .from("venues")
    .select("id,name,city,lat,lon,category")
    .eq("id", VENUE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!venue) {
    console.error(`No venue with id ${VENUE_ID}`);
    process.exit(1);
  }
  console.log(`MeeTap venue: ${venue.name} (${venue.city}) [${venue.id}]`);

  // 1. Text Search (New) - one call.
  const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos",
    },
    body: JSON.stringify({ textQuery: `${venue.name}, ${venue.city}`, maxResultCount: 5 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!searchRes.ok) {
    console.error(`Places searchText HTTP ${searchRes.status}: ${(await searchRes.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const searchJson = await searchRes.json();
  const places = searchJson.places ?? [];
  if (!places.length) {
    console.log("MATCH RESULT: REJECTED - no candidates from Google Places.");
    return;
  }

  const candidates = places.map((p) => {
    const sim = nameSimilarity(venue.name, p.displayName?.text ?? "");
    const distance_m =
      p.location?.latitude != null
        ? haversineMeters(venue.lat, venue.lon, p.location.latitude, p.location.longitude)
        : null;
    const distProximity =
      distance_m == null ? 0.3 : distance_m <= 300 ? 1 : distance_m <= 800 ? 0.6 : distance_m <= 2000 ? 0.3 : 0;
    const score = Math.round((0.7 * sim + 0.3 * distProximity) * 100) / 100;
    return { p, sim, distance_m, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const status = best.score >= 0.75 && best.sim >= 0.5 ? "MATCHED" : best.score >= 0.5 ? "REVIEW_REQUIRED" : "REJECTED";

  console.log(
    `Google candidate: ${best.p.displayName?.text} [id=${best.p.id}] sim=${best.sim.toFixed(2)} distance=${
      best.distance_m != null ? `${Math.round(best.distance_m)}m` : "unknown"
    } -> score=${best.score}`,
  );
  console.log(`MATCH RESULT: ${status}`);
  if (status !== "MATCHED") {
    console.log("Not confident enough - stopping, no photo fetch.");
    return;
  }

  const photos = best.p.photos ?? [];
  console.log(`Photos available: ${photos.length}`);
  if (!photos.length) {
    console.log("Google has no photos for this place.");
    return;
  }

  // 2. One photo media call, skipHttpRedirect so we get a real JSON photoUri
  // (and its attribution) instead of a redirect response.
  const photoName = photos[0].name;
  const mediaRes = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${KEY}`,
  );
  if (!mediaRes.ok) {
    console.error(`Photo media HTTP ${mediaRes.status}: ${(await mediaRes.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const mediaJson = await mediaRes.json();
  console.log("Photo URI:", mediaJson.photoUri);
  const attributions = (photos[0].authorAttributions ?? []).map((a) => a.displayName);
  console.log("Required attribution:", attributions.length ? attributions.join(", ") : "(Google, generic)");
}

main().catch((err) => {
  console.error(`Unhandled error: ${err?.message ?? err}`);
  process.exit(1);
});
