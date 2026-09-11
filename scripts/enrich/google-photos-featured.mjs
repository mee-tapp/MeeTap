#!/usr/bin/env node
/**
 * Meetap – Google Places photos for the exact pool fetchFeatured (home page
 * "Discover" picks) actually draws from: near city-center (6km), has a
 * website, has cuisines. A small number per category so the home page has
 * real photos to choose from in every category, not a city-wide top-N that
 * might be nowhere near downtown.
 *
 * Usage: node --env-file=.env scripts/enrich/google-photos-featured.mjs --write
 */
import { serviceClient, CITY_CENTERS } from "../../src/lib/recommend/engine.ts";
import { haversineMeters } from "../../src/lib/recommend/scoring.ts";

const WRITE = process.argv.includes("--write");
const PER_CATEGORY = 3;

const KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY in .env");
  process.exit(1);
}

const TR_MAP = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u", ə: "e", Ə: "e",
};
const STOP = new Set(["restaurant", "restoran", "cafe", "kafe", "bar", "pub", "the", "and", "ve"]);
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
const CHAIN_RE =
  /\b(mcdonald|starbucks|burger king|kfc|domino|papa john|subway|pizza hut|kahve d[uü]nyas[iı]|espressolab|simit saray|coffy|gloria jean|costa coffee|tim hortons|dunkin|popeyes|sbarro|little caesars|arby)/i;

async function matchAndMaybeWrite(supabase, venue) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos",
    },
    body: JSON.stringify({ textQuery: `${venue.name}, ${venue.city}`, maxResultCount: 3 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`searchText HTTP ${res.status}`);
  const json = await res.json();
  const places = json.places ?? [];
  if (!places.length) return "REJECTED";

  const candidates = places.map((p) => {
    const sim = nameSimilarity(venue.name, p.displayName?.text ?? "");
    const distance_m =
      p.location?.latitude != null ? haversineMeters(venue.lat, venue.lon, p.location.latitude, p.location.longitude) : null;
    const distProximity =
      distance_m == null ? 0.3 : distance_m <= 300 ? 1 : distance_m <= 800 ? 0.6 : distance_m <= 2000 ? 0.3 : 0;
    return { p, sim, distance_m, score: Math.round((0.7 * sim + 0.3 * distProximity) * 100) / 100 };
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const status = best.score >= 0.75 && best.sim >= 0.5 ? "MATCHED" : best.score >= 0.5 ? "REVIEW_REQUIRED" : "REJECTED";
  console.log(`  ${venue.name} -> ${best.p.displayName?.text} sim=${best.sim.toFixed(2)} dist=${best.distance_m ? Math.round(best.distance_m) : "?"}m score=${best.score} [${status}]`);
  if (status !== "MATCHED" || !WRITE) return status;

  const photos = best.p.photos ?? [];
  if (!photos.length) return status;
  const mediaRes = await fetch(
    `https://places.googleapis.com/v1/${photos[0].name}/media?maxWidthPx=800&skipHttpRedirect=true&key=${KEY}`,
  );
  if (!mediaRes.ok) throw new Error(`media HTTP ${mediaRes.status}`);
  const mediaJson = await mediaRes.json();
  const attribution = (photos[0].authorAttributions ?? [])[0]?.displayName ?? best.p.displayName?.text ?? "Google";
  const { error } = await supabase
    .from("venues")
    .update({ photo_url: mediaJson.photoUri, photo_attribution: `${attribution} (Google)` })
    .eq("id", venue.id);
  if (error) throw new Error(error.message);
  return status;
}

async function main() {
  const supabase = serviceClient();
  for (const city of ["Istanbul", "Baku"]) {
    const center = CITY_CENTERS[city];
    const { data: rows, error } = await supabase.rpc("venues_nearby", {
      p_lat: center.lat, p_lon: center.lon, p_radius_m: 6000, p_city: city, p_categories: null, p_limit: 600,
    });
    if (error) throw new Error(error.message);
    const eligible = (rows ?? []).filter((r) => r.website && (r.cuisines?.length ?? 0) > 0 && !r.photo_url);
    eligible.sort(
      (a, b) => Number(CHAIN_RE.test(a.name)) - Number(CHAIN_RE.test(b.name)) || (b.confidence ?? 0) - (a.confidence ?? 0),
    );
    const perCategory = {};
    const picked = [];
    for (const r of eligible) {
      perCategory[r.category] = (perCategory[r.category] ?? 0) + 1;
      if (perCategory[r.category] <= PER_CATEGORY) picked.push(r);
    }
    console.log(`${city}: ${picked.length} candidates picked (up to ${PER_CATEGORY}/category)`);
    for (const v of picked) {
      try {
        await matchAndMaybeWrite(supabase, v);
      } catch (err) {
        console.error(`  ${v.name}: ${err.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(`Unhandled error: ${err?.message ?? err}`);
  process.exit(1);
});
