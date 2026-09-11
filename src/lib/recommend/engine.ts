import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentWeather, type CurrentWeather } from "../weather.ts";
import type { Intent, ParsedIntent } from "./intent.ts";
import { parseIntentWithLlm } from "./llm-parser.ts";
import { parseIntentWithRules } from "./rule-parser.ts";
import { explain, rankCandidates, type Candidate, type ScoredVenue } from "./scoring.ts";

/**
 * The recommendation pipeline, end to end:
 *   sentence → intent → weather → nearby real venues → ranked + explained.
 *
 * Server-side only (uses the service-role key). The UI calls this through a
 * TanStack server function; scripts call it directly.
 */

export const CITY_CENTERS: Record<string, { lat: number; lon: number; currency: string }> = {
  Istanbul: { lat: 41.0369, lon: 28.985, currency: "TRY" },
  Baku: { lat: 40.3777, lon: 49.852, currency: "AZN" },
};

export type RecommendInput = {
  query: string;
  city: keyof typeof CITY_CENTERS | string;
  lat?: number | null;
  lon?: number | null;
  locale?: "tr" | "en";
  limit?: number;
  /** "rules" skips the LLM (tests, offline, budget cap). */
  parser?: "auto" | "rules";
  userId?: string | null;
  sessionId?: string | null;
};

export type VenueRow = {
  id: string;
  slug: string;
  name: string;
  category: Candidate["category"];
  cuisines: string[];
  lat: number;
  lon: number;
  distance_m: number;
  opening_hours: string | null;
  outdoor_seating: boolean | null;
  indoor_seating: boolean | null;
  wifi: string | null;
  price_band: number | null;
  price_estimate: number | null;
  currency: string | null;
  ambiance_tags: string[];
  ambiance_source: string | null;
  rating_avg: number | null;
  rating_count: number;
  website: string | null;
  confidence: number | null;
  district: string | null;
  seaside: boolean | null;
};

export type Recommendation = {
  venue: VenueRow;
  score: number;
  distance_min: number;
  pros: string[];
  cons: string[];
  explanation: string;
  components: ScoredVenue["components"];
};

export type RecommendResult = {
  intent: Intent;
  parser: ParsedIntent["parser"];
  weather: CurrentWeather | null;
  origin: { lat: number; lon: number; source: "user" | "city_center" };
  candidates: number;
  results: Recommendation[];
  query_log_id: string | null;
};

let cached: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

const DEFAULT_CATEGORIES = ["Cafés", "Restaurants", "Bars"];

/** Data-side cuisine values that satisfy an intent cuisine (mirrors the scorer's aliases). */
const CUISINE_POOL_ALIASES: Record<string, string[]> = {
  kebab: ["kebab", "kebap", "turkish", "ocakbasi", "doner", "durum", "grill"],
  home_cooking: ["home_cooking", "turkish", "regional", "local", "lokanta", "esnaf"],
  turkish: ["turkish", "regional", "kebab", "meyhane", "local"],
  meyhane: ["meyhane", "turkish", "meze"],
  seafood: ["seafood", "fish", "fish_and_chips"],
  steak: ["steak_house", "steak", "grill", "barbecue"],
  burger: ["burger", "american", "fast_food"],
  pizza: ["pizza", "italian"],
  italian: ["italian", "pasta"],
  sushi: ["sushi", "japanese"],
  japanese: ["japanese", "sushi", "ramen"],
  asian: ["asian", "thai", "korean", "vietnamese", "chinese", "japanese"],
  breakfast: ["breakfast", "brunch"],
  coffee: ["coffee_shop", "coffee", "cafe"],
  tea: ["tea", "cay"],
  dessert: ["dessert", "cake", "ice_cream", "pastry", "waffle", "kunefe", "baklava"],
  bakery: ["bakery", "pastry", "borek"],
  vegetarian: ["vegetarian", "vegan"],
  azerbaijani: ["azerbaijani", "regional", "local", "national"],
};

/** Search radius from what the user said about distance / transport. */
function radiusMeters(intent: Intent): number {
  if (intent.max_distance_min != null) {
    const perMin = intent.transport === "car" ? 400 : intent.transport === "transit" ? 250 : 80;
    return Math.min(30000, Math.max(800, intent.max_distance_min * perMin));
  }
  if (intent.transport === "car") return 15000;
  if (intent.transport === "transit") return 8000;
  return 4000;
}

/**
 * Rough per-person spend for each price band, per currency. Only used when a
 * venue has no real price data; the explanation marks it as estimated.
 */
const BAND_ESTIMATE: Record<string, [number, number, number, number]> = {
  TRY: [200, 450, 900, 1800],
  AZN: [10, 20, 40, 80],
  USD: [8, 15, 30, 60],
  EUR: [8, 15, 30, 60],
};

function toCandidate(v: VenueRow): Candidate {
  const table = BAND_ESTIMATE[v.currency ?? "TRY"] ?? BAND_ESTIMATE["TRY"]!;
  const bandEstimate = v.price_band != null ? (table[v.price_band - 1] ?? null) : null;
  return {
    id: v.id,
    name: v.name,
    category: v.category,
    cuisines: v.cuisines ?? [],
    lat: v.lat,
    lon: v.lon,
    price_band: v.price_band,
    price_estimate: v.price_estimate ?? bandEstimate,
    price_estimate_source:
      v.price_estimate != null ? "source" : bandEstimate != null ? "band" : null,
    ambiance_tags: v.seaside
      ? [...new Set([...(v.ambiance_tags ?? []), "seaside"])]
      : (v.ambiance_tags ?? []),
    outdoor_seating: v.outdoor_seating,
    indoor_seating: v.indoor_seating,
    wifi: v.wifi,
    rating_avg: v.rating_avg,
    rating_count: v.rating_count ?? 0,
    confidence: v.confidence,
    open_now: null, // opening_hours parsing lands in Etap 1
  };
}

export async function recommend(input: RecommendInput): Promise<RecommendResult> {
  const locale = input.locale ?? "en";
  const center = CITY_CENTERS[input.city] ?? CITY_CENTERS["Istanbul"]!;
  const origin =
    input.lat != null && input.lon != null
      ? { lat: input.lat, lon: input.lon, source: "user" as const }
      : { lat: center.lat, lon: center.lon, source: "city_center" as const };

  // 1. Intent (LLM with rule fallback) and weather, in parallel.
  const [parsed, weather] = await Promise.all([
    input.parser === "rules"
      ? Promise.resolve(parseIntentWithRules(input.query))
      : parseIntentWithLlm(input.query),
    getCurrentWeather(origin.lat, origin.lon),
  ]);
  const intent = parsed.intent;

  // 2. Real candidates near the user (PostGIS, server-side hard filters).
  const supabase = serviceClient();
  const rpc = async (radius: number, extra: { tags?: string[]; cuisines?: string[] } = {}) => {
    const { data, error } = await supabase.rpc("venues_nearby", {
      p_lat: origin.lat,
      p_lon: origin.lon,
      p_radius_m: radius,
      p_city: input.city,
      // No category in the sentence → food & drink by default; Activities only
      // when asked for (galleries and bookshops should not answer "a quiet place").
      p_categories: intent.categories.length ? intent.categories : DEFAULT_CATEGORIES,
      p_limit: 600,
      p_tags: extra.tags ?? null,
      p_cuisines: extra.cuisines ?? null,
    });
    if (error) throw new Error(`venues_nearby: ${error.message}`);
    return (data ?? []) as VenueRow[];
  };
  // Candidate pool = nearest venues ∪ venues that match what was asked for
  // (ambiance / seaside / cuisine), so the right places are never crowded out
  // of the pool by sheer density around the origin.
  const wantedTags = [...intent.ambiance.all_of, ...intent.ambiance.any_of.flat()];
  const cuisineAliases = intent.cuisines.flatMap((c) => CUISINE_POOL_ALIASES[c] ?? [c]);
  const fetchNearby = async (radius: number) => {
    const sets = await Promise.all([
      rpc(radius),
      wantedTags.length ? rpc(radius, { tags: wantedTags }) : Promise.resolve([]),
      cuisineAliases.length ? rpc(radius, { cuisines: cuisineAliases }) : Promise.resolve([]),
    ]);
    const byId = new Map<string, VenueRow>();
    for (const set of sets) for (const row of set) byId.set(row.id, row);
    return [...byId.values()];
  };
  const ctx = { user_lat: origin.lat, user_lon: origin.lon, weather, locale };
  const baseRadius = radiusMeters(intent);
  let rows = await fetchNearby(baseRadius);

  // 3. Deterministic ranking + template explanations.
  let ranked = rankCandidates(intent, rows.map(toCandidate), ctx);

  // If the user asked for a cuisine and only a handful of venues nearby actually
  // serve it, widen the search once rather than padding the list with "unknowns".
  if (intent.cuisines.length && intent.max_distance_min == null) {
    const strong = ranked.filter((s) => (s.components.cuisine ?? 0) >= 1).length;
    if (strong < 5) {
      rows = await fetchNearby(baseRadius * 3);
      ranked = rankCandidates(intent, rows.map(toCandidate), ctx);
    }
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results: Recommendation[] = ranked.slice(0, input.limit ?? 10).map((s) => ({
    venue: byId.get(s.candidate.id)!,
    score: Math.round(s.score * 100) / 100,
    distance_min: s.distance_min,
    pros: s.pros,
    cons: s.cons,
    explanation: explain(s, locale),
    components: s.components,
  }));

  // 4. Telemetry (never blocks the answer).
  let queryLogId: string | null = null;
  try {
    const { data: log } = await supabase
      .from("query_logs")
      .insert({
        user_id: input.userId ?? null,
        session_id: input.sessionId ?? null,
        raw_query: input.query,
        parsed_intent: intent,
        parser: parsed.parser,
        city: input.city,
        user_location: `SRID=4326;POINT(${origin.lon} ${origin.lat})`,
        weather,
        results: results.map((r) => ({
          venue_id: r.venue.id,
          score: r.score,
          components: r.components,
        })),
      })
      .select("id")
      .single();
    queryLogId = log?.id ?? null;
  } catch (err) {
    console.warn("[recommend] query log failed:", (err as Error).message);
  }

  return {
    intent,
    parser: parsed.parser,
    weather,
    origin,
    candidates: rows.length,
    results,
    query_log_id: queryLogId,
  };
}
