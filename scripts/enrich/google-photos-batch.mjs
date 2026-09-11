#!/usr/bin/env node
/**
 * Meetap – Google Places photo enrichment for the venues that actually show
 * on the Explore page's default view (top N by confidence per city, same set
 * fetchVenues serves with no filters applied).
 *
 * Two phases, always run in this order:
 *   --match-only (default) – one Text Search call per venue, NO photo call,
 *     NO writes. Prints MATCHED/REVIEW_REQUIRED/REJECTED counts so you know
 *     the real scope (and API-call count) before spending on photos.
 *   --write – re-matches, then for MATCHED venues only: one photo-media call
 *     + one DB update (photo_url/photo_attribution). Skips venues that
 *     already have a photo_url (never re-spends on those).
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/google-photos-batch.mjs --city Istanbul --limit 60
 *   node --env-file=.env scripts/enrich/google-photos-batch.mjs --city Istanbul --limit 60 --write
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
const CITY = typeof args.city === "string" ? args.city : null;
const LIMIT = Number(args.limit ?? 60);
const WRITE = args.write === true;
if (!CITY) {
  console.error("Usage: google-photos-batch.mjs --city <Istanbul|Baku> [--limit 60] [--write]");
  process.exit(1);
}

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

async function matchOne(venue) {
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
  if (!res.ok) throw new Error(`searchText HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const places = json.places ?? [];
  if (!places.length) return { status: "REJECTED", reason: "no candidates" };

  const candidates = places.map((p) => {
    const sim = nameSimilarity(venue.name, p.displayName?.text ?? "");
    const distance_m =
      p.location?.latitude != null ? haversineMeters(venue.lat, venue.lon, p.location.latitude, p.location.longitude) : null;
    const distProximity =
      distance_m == null ? 0.3 : distance_m <= 300 ? 1 : distance_m <= 800 ? 0.6 : distance_m <= 2000 ? 0.3 : 0;
    const score = Math.round((0.7 * sim + 0.3 * distProximity) * 100) / 100;
    return { p, sim, distance_m, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const status = best.score >= 0.75 && best.sim >= 0.5 ? "MATCHED" : best.score >= 0.5 ? "REVIEW_REQUIRED" : "REJECTED";
  return { status, best };
}

// Same chain list + de-prioritization fetchVenues (server.ts) actually
// applies – otherwise "the venues that show up on Explore" is the wrong set
// (raw confidence order is dominated by high-confidence chain branches).
const CHAIN_RE =
  /\b(mcdonald|starbucks|burger king|kfc|domino|papa john|subway|pizza hut|kahve d[uü]nyas[iı]|espressolab|simit saray|coffy|gloria jean|costa coffee|tim hortons|dunkin|popeyes|sbarro|little caesars|arby)/i;

async function main() {
  const supabase = serviceClient();
  const { data: pool, error } = await supabase
    .from("venues")
    .select("id,name,city,lat,lon,photo_url")
    .eq("city", CITY)
    .eq("is_active", true)
    .order("confidence", { ascending: false, nullsFirst: false })
    .limit(Math.max(LIMIT * 5, 200));
  if (error) throw new Error(error.message);
  pool.sort((a, b) => Number(CHAIN_RE.test(a.name)) - Number(CHAIN_RE.test(b.name)));
  const venues = pool.slice(0, LIMIT);

  console.log(`${CITY}: ${venues.length} venues (mode=${WRITE ? "write" : "match-only"})`);
  let matched = 0, reviewRequired = 0, rejected = 0, skipped = 0, written = 0;

  for (const v of venues) {
    if (WRITE && v.photo_url) {
      skipped++;
      continue;
    }
    let result;
    try {
      result = await matchOne(v);
    } catch (err) {
      console.error(`  ${v.name}: ${err.message}`);
      rejected++;
      continue;
    }
    if (result.status === "MATCHED") matched++;
    else if (result.status === "REVIEW_REQUIRED") reviewRequired++;
    else rejected++;

    if (!WRITE) continue;
    if (result.status !== "MATCHED") continue;
    const photos = result.best.p.photos ?? [];
    if (!photos.length) continue;
    try {
      const mediaRes = await fetch(
        `https://places.googleapis.com/v1/${photos[0].name}/media?maxWidthPx=800&skipHttpRedirect=true&key=${KEY}`,
      );
      if (!mediaRes.ok) throw new Error(`media HTTP ${mediaRes.status}`);
      const mediaJson = await mediaRes.json();
      const attribution = (photos[0].authorAttributions ?? [])[0]?.displayName ?? result.best.p.displayName?.text ?? "Google";
      const { error: updErr } = await supabase
        .from("venues")
        .update({ photo_url: mediaJson.photoUri, photo_attribution: `${attribution} (Google)` })
        .eq("id", v.id);
      if (updErr) throw new Error(updErr.message);
      written++;
    } catch (err) {
      console.error(`  photo fetch/write failed for ${v.name}: ${err.message}`);
    }
    process.stdout.write(`  ${written} written so far\r`);
  }
  console.log();
  console.log(
    `${CITY}: matched=${matched} review_required=${reviewRequired} rejected=${rejected}` +
      (WRITE ? ` | already had photo (skipped)=${skipped} | newly written=${written}` : ""),
  );
}

main().catch((err) => {
  console.error(`Unhandled error: ${err?.message ?? err}`);
  process.exit(1);
});
