import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentWeather, type CurrentWeather } from "../weather.ts";
import { emptyIntent, type Intent, type Need, type ParsedIntent, type Purpose } from "./intent.ts";
import { FEATURE_LABEL, MEAL_LABEL, type Feature, type Meal } from "../catalog/taxonomy.ts";
import { parseIntentWithLlm } from "./llm-parser.ts";
import { parseIntentWithRules } from "./rule-parser.ts";
import {
  DEFAULT_WEIGHTS,
  explain,
  haversineMeters,
  labelAspect,
  labelCaution,
  labelCuisine,
  labelGoodFor,
  labelTag,
  venueKinds,
  rankCandidates,
  type Candidate,
  type ExcludeReason,
  type ScoredVenue,
  type Weights,
} from "./scoring.ts";
import { validateVenueIntelligence, type VenueIntelligence } from "./venue-intelligence.ts";

/**
 * The recommendation pipeline, end to end:
 *   sentence → intent → weather → nearby real venues → ranked + explained.
 *
 * Server-side only (uses the service-role key). The UI calls this through a
 * TanStack server function; scripts call it directly.
 */

export const CITY_CENTERS: Record<
  string,
  { lat: number; lon: number; currency: string; cuisine?: string }
> = {
  Istanbul: { lat: 41.0369, lon: 28.985, currency: "TRY", cuisine: "turkish" },
  Baku: { lat: 40.3777, lon: 49.852, currency: "AZN", cuisine: "azerbaijani" },
};

export type RecommendInput = {
  query: string;
  city: keyof typeof CITY_CENTERS | string;
  lat?: number | null;
  lon?: number | null;
  /** Browser-reported accuracy of lat/lon in metres (logged; wide fixes are
   * already dropped client-side, see use-user-position.ts). */
  accuracy_m?: number | null;
  locale?: "tr" | "en";
  limit?: number;
  /** "rules" skips the LLM (tests, offline, budget cap). */
  parser?: "auto" | "rules";
  userId?: string | null;
  sessionId?: string | null;
  /** Dev/eval only – adds `debug` to the result. Never set from the public server fn. */
  debug?: boolean;
};

export type RecommendDebug = {
  candidates_before: number;
  candidates_after_hard_filters: number;
  hard_filter_exclusions: {
    category: number;
    cuisine: number;
    open_now: number;
    purpose: number;
    features: number;
  };
  fallback_used: string | null;
  mode: "discovery" | "named_venue";
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
  raw_type?: string | null;
  // Pilot catalog columns (migration 0021); null/empty on open-data rows.
  establishment_type?: string | null;
  meals?: string[] | null;
  features?: string[] | null;
  signature_dishes?: string[] | null;
  external_rating?: number | null;
  external_review_count?: number | null;
  profile?: string | null;
  catalog_tier?: string | null;
  good_for?: string[] | null;
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

/**
 * What the answer is actually based on. `applied` = criteria we could check
 * against real data; `unverifiable` = wishes we understood but have no data
 * for (a private room, a dessert menu, halal…) – shown to the user instead
 * of silently pretending they were considered. Labels follow the query
 * language; `unverifiable` also carries the parser's own `unmapped` phrases.
 */
export type Coverage = { applied: string[]; unverifiable: string[] };

export type RecommendResult = {
  intent: Intent;
  parser: ParsedIntent["parser"];
  /** Why the rules had to answer instead of the LLM (null when the LLM ran). */
  parser_fallback_reason: string | null;
  weather: CurrentWeather | null;
  origin: { lat: number; lon: number; source: "user" | "city_center"; accuracy_m: number | null };
  candidates: number;
  results: Recommendation[];
  coverage: Coverage;
  /** Every shown result is over an hour's walk from the user's own location. */
  far_from_user: boolean;
  query_log_id: string | null;
  mode?: "discovery" | "named_venue";
  fallback_used?: string | null;
  debug?: RecommendDebug | null;
};

/** Needs the venue data can actually answer today (wifi field). */
const CHECKABLE_NEEDS = new Set<Need>(["wifi", "power_outlets"]);
const NEED_LABEL: Record<Need, [string, string]> = {
  wifi: ["wifi", "wifi"],
  power_outlets: ["priz", "power outlets"],
  vegetarian: ["vejetaryen seçenek", "vegetarian options"],
  vegan: ["vegan seçenek", "vegan options"],
  halal: ["helal", "halal"],
  wheelchair: ["tekerlekli sandalye erişimi", "wheelchair access"],
  kid_friendly: ["çocuklara uygunluk", "kid friendliness"],
  smoking_area: ["sigara alanı", "smoking area"],
  no_smoking: ["sigarasız alan", "non-smoking area"],
};
const PURPOSE_LABEL: Record<Purpose, [string, string]> = {
  date: ["randevu", "date"],
  friends: ["arkadaş buluşması", "meeting friends"],
  study: ["çalışma", "studying"],
  alone: ["tek başına", "time alone"],
  family: ["aile", "family"],
  business: ["iş görüşmesi", "business"],
};

/**
 * Split the intent into what this candidate pool can verify and what it
 * cannot. A required ambiance tag that NO venue in the pool carries would
 * otherwise push every result down with "atmosphere may not match" – that is
 * missing data, not a mismatch, so the tag is reported as unverifiable and
 * left out of scoring. Same for needs we have no field for.
 */
function splitByCoverage(
  intent: Intent,
  pool: Candidate[],
  locale: "tr" | "en",
): { scoring: Intent; coverage: Coverage } {
  const poolTags = new Set(pool.flatMap((c) => c.ambiance_tags));
  const lbl = (pair: [string, string]) => (locale === "tr" ? pair[0] : pair[1]);
  const applied: string[] = [];
  const unverifiable: string[] = [];

  const allOf = intent.ambiance.all_of.filter((tag) => {
    const ok = poolTags.has(tag);
    (ok ? applied : unverifiable).push(labelTag(tag, locale));
    return ok;
  });
  const anyOf = intent.ambiance.any_of
    .map((group) => {
      const kept = group.filter((tag) => poolTags.has(tag));
      for (const tag of group)
        (kept.includes(tag) ? applied : unverifiable).push(labelTag(tag, locale));
      return kept;
    })
    .filter((group) => group.length > 0);
  const needs = intent.needs.filter((need) => {
    const ok = CHECKABLE_NEEDS.has(need);
    (ok ? applied : unverifiable).push(lbl(NEED_LABEL[need]));
    return ok;
  });
  // Catalog features: a feature no venue in the pool carries cannot be checked.
  const poolFeatures = new Set(pool.flatMap((c) => c.features ?? []));
  const features = intent.features.filter((f) => {
    const ok = poolFeatures.has(f);
    (ok ? applied : unverifiable).push(lbl(FEATURE_LABEL[f as Feature]));
    return ok;
  });
  const poolMeals = new Set(pool.flatMap((c) => c.meals ?? []));
  const meals = intent.meals.filter((m) => {
    const ok = poolMeals.has(m);
    (ok ? applied : unverifiable).push(lbl(MEAL_LABEL[m as Meal]));
    return ok;
  });
  let dish = intent.dish;
  if (dish) {
    const ok = pool.some((c) => (c.dish_mentions ?? 0) > 0);
    (ok ? applied : unverifiable).push(lbl([`"${dish}"`, `"${dish}"`]));
    if (!ok) dish = null;
  }

  for (const c of intent.cuisines) applied.push(labelCuisine(c, locale));
  if (intent.purpose) applied.push(lbl(PURPOSE_LABEL[intent.purpose]));
  if (intent.budget.max_per_person != null)
    applied.push(
      `≤ ${intent.budget.max_per_person} ${intent.budget.currency ?? ""}`.trim() +
        lbl([" kişi başı", " per person"]),
    );
  else if (intent.budget.level)
    applied.push(
      lbl(
        {
          low: ["düşük bütçe", "low budget"],
          mid: ["orta bütçe", "mid budget"],
          high: ["yüksek bütçe", "high budget"],
        }[intent.budget.level] as [string, string],
      ),
    );
  if (intent.max_distance_min != null)
    applied.push(`≤ ${intent.max_distance_min} ${lbl(["dk", "min"])}`);
  unverifiable.push(...intent.unmapped);

  return {
    scoring: {
      ...intent,
      needs,
      features,
      meals,
      dish,
      ambiance: { ...intent.ambiance, all_of: allOf, any_of: anyOf },
    },
    coverage: {
      applied: [...new Set(applied)],
      unverifiable: [...new Set(unverifiable)],
    },
  };
}

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
/** Which venues the recommender may answer with (see supabase/migrations/0021). */
const CATALOG_TIER = process.env["CATALOG_TIER"] ?? "pilot";

/** Data-side cuisine values that satisfy an intent cuisine (mirrors the scorer's
 * strict aliases – no generic "regional"/"local" words). Unknown keys map to themselves. */
const CUISINE_POOL_ALIASES: Record<string, string[]> = {
  kebab: ["kebab", "kebap", "ocakbasi", "doner", "durum", "grill"],
  home_cooking: ["home_cooking", "lokanta", "esnaf"],
  turkish: ["turkish", "kebab", "meyhane", "lokanta"],
  meyhane: ["meyhane", "meze"],
  seafood: ["seafood", "fish", "fish_and_chips"],
  steak: ["steak_house", "steak", "barbecue"],
  burger: ["burger", "fast_food"],
  pizza: ["pizza"],
  italian: ["italian", "pasta"],
  sushi: ["sushi"],
  japanese: ["japanese", "sushi", "ramen"],
  asian: ["asian", "thai", "korean", "vietnamese", "chinese", "japanese", "uzbek"],
  breakfast: ["breakfast", "brunch"],
  coffee: ["coffee_shop", "coffee", "cafe"],
  tea: ["tea", "cay"],
  dessert: ["dessert", "cake", "ice_cream", "pastry", "waffle", "kunefe", "baklava"],
  bakery: ["bakery", "pastry", "borek"],
  vegetarian: ["vegetarian", "vegan"],
  azerbaijani: ["azerbaijani"],
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

function toCandidate(
  v: VenueRow,
  intelligence?: VenueIntelligence | null,
  dishMentions?: Map<string, number> | null,
): Candidate {
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
    ambiance_source: v.ambiance_source,
    raw_type: v.raw_type ?? null,
    open_now: null, // opening_hours parsing lands in Etap 1
    intelligence: intelligence ?? null,
    establishment_type: v.establishment_type ?? null,
    features: v.features ?? [],
    good_for: v.good_for ?? [],
    meals: v.meals ?? [],
    external_rating: v.external_rating ?? null,
    external_review_count: v.external_review_count ?? null,
    dish_mentions: dishMentions?.get(v.id) ?? 0,
  };
}

/**
 * ONE batch query for every candidate's Venue Intelligence row (never one
 * query per candidate). Gated by the feature flag so it costs nothing when
 * disabled; any failure (missing table, network) is swallowed and just
 * means no candidate gets intelligence attached – ranking still works
 * exactly as before.
 */
// A discovery candidate pool is routinely 400-900 venues; a single .in() with
// that many UUIDs serializes into a URL long enough to get rejected outright
// (400 Bad Request) before it ever reaches the database. Chunking keeps each
// request well under that limit.
const INTELLIGENCE_BATCH_SIZE = 150;

async function loadIntelligenceMap(
  supabase: SupabaseClient,
  venueIds: string[],
): Promise<Map<string, VenueIntelligence>> {
  const map = new Map<string, VenueIntelligence>();
  if (process.env["VENUE_INTELLIGENCE_ENABLED"] !== "true" || venueIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < venueIds.length; i += INTELLIGENCE_BATCH_SIZE) {
    chunks.push(venueIds.slice(i, i + INTELLIGENCE_BATCH_SIZE));
  }
  // One retry per chunk: a fetch right after the venues_nearby RPC calls
  // occasionally hits a transient "fetch failed" (socket reuse timing), not a
  // real outage.
  for (const chunk of chunks) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await supabase
          .from("venue_intelligence")
          .select(
            "venue_id,version,summary,review_count,overall_confidence,good_for,aspects,cautions",
          )
          .in("venue_id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ venue_id: string }>) {
          const validation = validateVenueIntelligence(row);
          if (validation.ok) map.set(row.venue_id, validation.data);
        }
        break;
      } catch (err) {
        if (attempt === 1) {
          console.warn(
            "[recommend] venue_intelligence load failed for a chunk, continuing without it:",
            (err as Error).message,
          );
        }
      }
    }
  }
  return map;
}

// --- named-venue mode ---------------------------------------------------------
// "Nergiz nasıl?" is a question about ONE specific place, not a discovery
// query – it must not be run through the category/cuisine intent pipeline
// (which has nothing to infer here and would just filter the place out).

const NAMED_VENUE_PATTERNS: RegExp[] = [
  /^(.+?)\s+nas[ıi]l\s*\??$/i,
  /^(.+?)\s+iyi\s*mi(?:dir)?\s*\??$/i,
  /^(.+?)\s+g[uü]zel\s*mi\s*\??$/i,
  /^(.+?)\s+tavsiye\s+ed(?:er|iyor)\s*mi?s(?:in|iniz)\s*\??$/i,
  /^(.+?)['’]?(?:de|da|te|ta)\s+date\s+yap[ıi]l[ıi]r\s*m[ıi]\s*\??$/i,
  /^(.+?)['’]?(?:de|da|te|ta)\s+(?:gidilir|yenir|oturulur)\s*mu?\s*\??$/i,
  /^(?:how(?:'s| is))\s+(.+?)\s*\??$/i,
  /^is\s+(.+?)\s+(?:good|any good|worth it|nice)\s*\??$/i,
  /^(?:would you recommend|do you recommend)\s+(.+?)\s*\??$/i,
];

/** "Nergiz nasıl?" → "Nergiz"; null for anything that isn't a one-place question. */
export function looksLikeNamedVenueQuery(raw: string): string | null {
  const text = raw.trim();
  for (const re of NAMED_VENUE_PATTERNS) {
    const m = text.match(re);
    const candidate = m?.[1]?.trim();
    if (!candidate) continue;
    const words = candidate.split(/\s+/).filter(Boolean);
    if (candidate.length >= 2 && words.length <= 5) return candidate;
  }
  return null;
}

const NAMED_VENUE_COLUMNS =
  "id,slug,name,category,cuisines,lat,lon,district,price_band,price_estimate,currency," +
  "ambiance_tags,ambiance_source,rating_avg,rating_count,website,opening_hours," +
  "outdoor_seating,indoor_seating,wifi,confidence,seaside";

/**
 * Fuzzy name → venue in this city. "Nergiz" alone is genuinely ambiguous (5+
 * venues in Istanbul share the prefix), so this needs a real tie-break, not
 * just "first row": exact name match wins, then prefix match, then closest
 * length, then open-data confidence.
 */
export async function lookupNamedVenue(
  supabase: SupabaseClient,
  nameCandidate: string,
  city: string,
): Promise<(VenueRow & { distance_m: number }) | null> {
  const { data, error } = await supabase
    .from("venues")
    .select(NAMED_VENUE_COLUMNS)
    .eq("city", city)
    .eq("is_active", true)
    .ilike("name", `%${nameCandidate}%`)
    .limit(20);
  if (error || !data?.length) return null;

  const needle = nameCandidate.trim().toLowerCase();
  const ranked = (data as unknown as Array<Record<string, unknown>>)
    .map((row) => {
      const name = String(row["name"] ?? "").toLowerCase();
      const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : 2;
      return { row, rank, lenDiff: Math.abs(name.length - needle.length) };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.lenDiff - b.lenDiff ||
        Number(b.row["confidence"] ?? 0) - Number(a.row["confidence"] ?? 0),
    );
  const best = ranked[0]?.row;
  if (!best) return null;
  return { ...best, distance_m: 0 } as unknown as VenueRow & { distance_m: number };
}

// --- discovery mode -------------------------------------------------------------

/** Beyond this, a browser-reported location isn't "in" the selected city at
 * all (wrong IP-geolocation, VPN, another city/country) – MeeTap only has
 * venue data for the cities in CITY_CENTERS, so trusting it would search
 * around a point with no real coverage and silently return nothing. */
const MAX_USER_LOCATION_DRIFT_M = 60_000;

/**
 * Lightweight, deterministic query-language detection – no new dependency,
 * no LLM call. Explanations must match what the user actually typed instead
 * of always being English.
 *
 * "az" (Azerbaijani) is detected via its unique "ə" letter (never appears in
 * Turkish or English) but mapped to the "tr" explanation templates below:
 * scoring.ts only has tr/en strings, and Turkish/Azerbaijani share enough
 * vocabulary that this reads naturally rather than defaulting to English –
 * exactly the "remain natural and understandable... or use the same
 * detected query language" allowance, without building a third full
 * translation set for one extra language.
 */
function detectQueryLocale(raw: string): "tr" | "en" {
  const text = raw.toLowerCase();
  // Turkish / Azerbaijani function words and verb forms (typed with or without diacritics).
  const trWords =
    /\b(bir|için|icin|ucun|üçün|istiyorum|istiyoruz|isteyirem|istəyirəm|isteyirik|olsun|olsa|olmasin|olmasın|olmayan|olan|yerde|yerdə|yakin|yakın|sevgilim|sevgilimle|sevgilimlə|arkadaslarimla|arkadaşlarımla|ailemle|aileynen|ailəynən|gidecegim|gideceğim|gedecem|gedəcəm|gedek|gedirik|restoran|restorani|restoranı|kahve|yaxsi|yaxşı|bele|belə|axtariram|lazimdir)\b/;
  const enWords =
    /\b(i|we|a|an|the|with|and|for|near|some|somewhere|place|want|looking|where|good|nice|cheap|quiet|my)\b/;
  if (trWords.test(text)) return "tr";
  // Diacritics alone are not enough: "near Kadıköy" is still an English sentence.
  if (/[çğıöşüəÇĞİÖŞÜƏ]/.test(raw) && !enWords.test(text)) return "tr";
  return "en";
}

/**
 * How many stored real reviews of each venue in the city mention the dish
 * (case/diacritic-insensitive substring), plus signature_dishes hits.
 * One query, bounded; empty map when nothing mentions it.
 */
async function countDishMentions(
  supabase: SupabaseClient,
  dish: string,
  city: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const needle = dish.replace(/[%_]/g, "");
  const { data: reviews } = await supabase
    .from("venue_reviews_external")
    .select("venue_id, venues!inner(city)")
    .eq("venues.city", city)
    .ilike("body", `%${needle}%`)
    .limit(2000);
  for (const r of (reviews ?? []) as Array<{ venue_id: string }>)
    counts.set(r.venue_id, (counts.get(r.venue_id) ?? 0) + 1);
  const { data: sig } = await supabase
    .from("venues")
    .select("id")
    .eq("city", city)
    .contains("signature_dishes", [needle.toLowerCase()]);
  for (const v of (sig ?? []) as Array<{ id: string }>)
    counts.set(v.id, (counts.get(v.id) ?? 0) + 3);
  return counts;
}

export async function recommend(input: RecommendInput): Promise<RecommendResult> {
  const locale = input.locale ?? detectQueryLocale(input.query);
  const center = CITY_CENTERS[input.city] ?? CITY_CENTERS["Istanbul"]!;
  const userLocationInCity =
    input.lat != null &&
    input.lon != null &&
    haversineMeters(input.lat, input.lon, center.lat, center.lon) <= MAX_USER_LOCATION_DRIFT_M;
  const origin = userLocationInCity
    ? {
        lat: input.lat!,
        lon: input.lon!,
        source: "user" as const,
        accuracy_m: input.accuracy_m ?? null,
      }
    : { lat: center.lat, lon: center.lon, source: "city_center" as const, accuracy_m: null };

  const supabase = serviceClient();

  // 0. Named-venue short-circuit ("Nergiz nasıl?") – skip the whole discovery
  // pipeline entirely rather than let category/cuisine filters guess at (and
  // possibly exclude) a place the user already named.
  const nameCandidate = looksLikeNamedVenueQuery(input.query);
  if (nameCandidate) {
    const match = await lookupNamedVenue(supabase, nameCandidate, input.city);
    if (match) {
      const distance_m = haversineMeters(origin.lat, origin.lon, match.lat, match.lon);
      const candidate = toCandidate({ ...match, distance_m });
      const distance_min = Math.max(1, Math.round(distance_m / 80));
      const pros: string[] = [];
      const cons: string[] = [];
      if (match.rating_avg != null && match.rating_count > 0) {
        pros.push(
          locale === "tr"
            ? `${match.rating_avg} puan (${match.rating_count} değerlendirme)`
            : `${match.rating_avg} rating (${match.rating_count} reviews)`,
        );
      }

      // Real review evidence, when we have it, takes priority over the
      // generic ambiance-tag guess below – natural language only, same
      // vocabulary as scoreVenueIntelligence, never raw enum names or
      // confidence decimals.
      const vi = (await loadIntelligenceMap(supabase, [match.id])).get(match.id);
      let usedIntelligence = false;
      if (vi) {
        const strongAspects = Object.entries(vi.aspects)
          .filter(([, s]) => s.score >= 0.6 && s.confidence >= 0.3)
          .sort((a, b) => b[1].score - a[1].score)
          .slice(0, 3)
          .map(([key]) => labelAspect(key, locale));
        const strongGoodFor = vi.good_for
          .filter((g) => g.score >= 0.6 && g.confidence >= 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
          .map((g) => labelGoodFor(g.tag, locale));
        const strongCautions = vi.cautions
          .filter((c) => c.score >= 0.5 && c.confidence >= 0.3)
          .map((c) => labelCaution(c.tag, locale));
        if (strongAspects.length) {
          pros.push(
            locale === "tr"
              ? `kullanıcı yorumlarında özellikle ${strongAspects.join(" ve ")} olumlu öne çıkıyor`
              : `user reviews particularly highlight ${strongAspects.join(" and ")}`,
          );
          usedIntelligence = true;
        }
        if (strongGoodFor.length) {
          pros.push(
            locale === "tr"
              ? `${strongGoodFor.join(" ve ")} için uygun görünüyor`
              : `seems well suited for ${strongGoodFor.join(" and ")}`,
          );
          usedIntelligence = true;
        }
        if (strongCautions.length) {
          cons.push(...strongCautions);
          usedIntelligence = true;
        }
        if (usedIntelligence && vi.overall_confidence < 0.4) {
          pros.push(
            locale === "tr" ? "yorum verisi henüz sınırlı" : "based on limited review data so far",
          );
        }
      }

      if (!usedIntelligence && /date|romantik|sevgili/i.test(input.query)) {
        const tags = new Set(candidate.ambiance_tags);
        if (tags.has("romantic") || tags.has("quiet") || tags.has("cozy")) {
          pros.push(locale === "tr" ? "romantik/sakin bir yer" : "a romantic/quiet spot");
        } else {
          cons.push(locale === "tr" ? "romantik olarak etiketli değil" : "not tagged as romantic");
        }
      }
      if (!pros.length && !cons.length) {
        pros.push(candidate.cuisines.length ? candidate.cuisines.join(", ") : match.category);
      }
      const rec: Recommendation = {
        venue: { ...match, distance_m },
        score: 1,
        distance_min,
        pros,
        cons,
        explanation: [
          ...pros,
          ...cons.map((c) => (locale === "tr" ? `ama ${c}` : `but ${c}`)),
        ].join(" · "),
        components: {},
      };
      return {
        intent: emptyIntent(),
        parser: "rules",
        parser_fallback_reason: null,
        weather: null,
        origin,
        candidates: 1,
        results: [rec],
        coverage: { applied: [], unverifiable: [] },
        far_from_user: false,
        query_log_id: null,
        mode: "named_venue",
        fallback_used: null,
      };
    }
    // No confident match – this wasn't actually about a named place (or the
    // place isn't in the DB yet). Fall through to normal discovery below.
  }

  // 1. Intent (LLM with rule fallback) and weather, in parallel.
  const [parsed, weather] = await Promise.all([
    input.parser === "rules"
      ? Promise.resolve(parseIntentWithRules(input.query))
      : parseIntentWithLlm(input.query),
    getCurrentWeather(origin.lat, origin.lon),
  ]);
  const intent: Intent = { ...parsed.intent, confidence: parsed.confidence };

  // 2. Real candidates near the user (PostGIS, server-side hard filters).
  const rpc = async (
    radius: number,
    extra: {
      tags?: string[];
      cuisines?: string[];
      nameKeywords?: string[];
      features?: string[];
    } = {},
    at: { lat: number; lon: number } = origin,
  ) => {
    const call = () =>
      supabase.rpc("venues_nearby", {
        p_lat: at.lat,
        p_lon: at.lon,
        p_radius_m: radius,
        p_city: input.city,
        // No category in the sentence, or the category was only *inferred* from
        // a cuisine word (not stated) → food & drink broadly; Activities only
        // when asked for (galleries and bookshops should not answer "a quiet place").
        p_categories:
          intent.categories.length && intent.category_explicit
            ? intent.categories
            : DEFAULT_CATEGORIES,
        p_limit: 600,
        p_tags: extra.tags ?? null,
        p_cuisines: extra.cuisines ?? null,
        p_name_keywords: extra.nameKeywords ?? null,
        p_features: extra.features ?? null,
        // Decision 2026-09-14: the recommender answers from the curated pilot
        // catalog only (fully described, reviewed venues); open data is gone.
        p_tier: CATALOG_TIER,
      });
    let { data, error } = await call();
    // Supabase occasionally answers "JWT issued at future" (clock skew at the
    // gateway); it clears within a second, so one retry beats a failed search.
    if (error && /issued at future/i.test(error.message)) {
      await new Promise((r) => setTimeout(r, 1200));
      ({ data, error } = await call());
    }
    if (error) throw new Error(`venues_nearby: ${error.message}`);
    return (data ?? []) as VenueRow[];
  };
  // Candidate pool = nearest venues ∪ venues that match what was asked for
  // (ambiance / seaside / cuisine), so the right places are never crowded out
  // of the pool by sheer density around the origin.
  const wantedTags = [...intent.ambiance.all_of, ...intent.ambiance.any_of.flat()];
  // The city's own cuisine also lives under generic "local / regional / home
  // cooking" tags (see scoreCuisine) – pull those into the pool as well.
  const cuisineAliases = intent.cuisines.flatMap((c) =>
    c === center.cuisine
      ? [
          ...(CUISINE_POOL_ALIASES[c] ?? [c]),
          "local",
          "regional",
          "home_cooking",
          "lokanta",
          "esnaf",
        ]
      : (CUISINE_POOL_ALIASES[c] ?? [c]),
  );
  const nameKeywords = intent.cuisine_keywords.filter((k) => k.length >= 3);
  const fetchNearby = async (radius: number, at: { lat: number; lon: number } = origin) => {
    const sets = await Promise.all([
      rpc(radius, {}, at),
      // What was asked for is found city-wide; distance only orders it later.
      wantedTags.length
        ? rpc(Math.max(radius, 25000), { tags: wantedTags }, at)
        : Promise.resolve([]),
      cuisineAliases.length
        ? rpc(Math.max(radius, 25000), { cuisines: cuisineAliases }, at)
        : Promise.resolve([]),
      // Venues the open data typed as a generic restaurant but whose NAME says
      // what they serve ("Özbek Sofrası") – found by keyword, city-wide radius.
      nameKeywords.length
        ? rpc(Math.max(radius, 25000), { nameKeywords }, at)
        : Promise.resolve([]),
      // A requested feature (kabinet, karaoke…) or a dish: find them city-wide.
      intent.features.length
        ? rpc(Math.max(radius, 25000), { features: intent.features }, at)
        : Promise.resolve([]),
      intent.dish ? rpc(25000, {}, at) : Promise.resolve([]),
    ]);
    const byId = new Map<string, VenueRow>();
    for (const set of sets) for (const row of set) byId.set(row.id, row);
    return [...byId.values()];
  };
  const ctx = {
    user_lat: origin.lat,
    user_lon: origin.lon,
    weather,
    locale,
    city_cuisine: center.cuisine ?? null,
  };
  const baseRadius = radiusMeters(intent);
  let rows = await fetchNearby(baseRadius);
  let intelMap = await loadIntelligenceMap(
    supabase,
    rows.map((r) => r.id),
  );

  // 3. Deterministic ranking + template explanations. Every ranking pass goes
  //    through the coverage split, so a wish the pool has no data for is
  //    reported instead of scored.
  const candidatesBeforeFilters = rows.length;
  const exclusions = { category: 0, cuisine: 0, open_now: 0, purpose: 0, features: 0 };
  const tally = input.debug
    ? (reason: ExcludeReason) => {
        exclusions[reason] += 1;
      }
    : undefined;
  let coverage: Coverage = { applied: [], unverifiable: [] };
  let weights: Weights = DEFAULT_WEIGHTS;
  // Dish evidence: real review texts (and signature_dishes) that mention it.
  const dishMentions = intent.dish
    ? await countDishMentions(supabase, intent.dish, input.city)
    : null;
  const rankPool = (base: Intent, pool: VenueRow[], count?: typeof tally) => {
    const candidates = pool.map((r) => toCandidate(r, intelMap.get(r.id), dishMentions));
    const split = splitByCoverage(base, candidates, locale);
    coverage = split.coverage;
    return rankCandidates(split.scoring, candidates, ctx, weights, count);
  };
  let ranked = rankPool(intent, rows, tally);
  const candidatesAfterHardFilters = ranked.length;

  // If the user asked for a cuisine and only a handful of venues nearby actually
  // serve it, widen the search once rather than padding the list with "unknowns".
  if (intent.cuisines.length && intent.max_distance_min == null) {
    const strong = ranked.filter((s) => (s.components.cuisine ?? 0) >= 1).length;
    if (strong < 5) {
      rows = await fetchNearby(baseRadius * 3);
      intelMap = await loadIntelligenceMap(
        supabase,
        rows.map((r) => r.id),
      );
      ranked = rankPool(intent, rows);
    }
  }

  // Nothing walkable from the user's own location (outskirts, or a browser
  // fix that is simply wrong): a car is needed either way, so 96 vs 105
  // minutes on foot must not decide the order. Bring in the city-centre pool
  // as well and let the evidence we have (tags, quality) matter more than
  // the last few kilometres. The UI says so (far_from_user).
  // (Serving at least one of several asked-for cuisines scores ≥ 0.6; an
  // unknown kitchen scores 0.35 – see scoreCuisine.)
  const SERVES = 0.6;
  const serves = (s: ScoredVenue) =>
    intent.cuisines.length === 0 || (s.components.cuisine ?? 0) >= SERVES;
  const onFoot = intent.transport == null || intent.transport === "walking";
  if (
    origin.source === "user" &&
    onFoot &&
    ranked.some(serves) &&
    !ranked.some((s) => serves(s) && s.distance_min <= 60)
  ) {
    const centreRows = await fetchNearby(baseRadius * 2, center);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of centreRows) byId.set(r.id, r);
    rows = [...byId.values()];
    intelMap = await loadIntelligenceMap(
      supabase,
      rows.map((r) => r.id),
    );
    weights = { ...DEFAULT_WEIGHTS, distance: 0.35 };
    ranked = rankPool(intent, rows);
  }

  // Fallback ladder: a filtered pool should never silently collapse to zero
  // when plausible venues exist nearby. Each tier only runs if the previous
  // one still left nothing to rank; bounded to at most one extra RPC call.
  let fallbackUsed: string | null = null;
  if (ranked.length === 0 && rows.length > 0) {
    // 1. Relax filters on the pool already fetched — no new DB call.
    const relaxed: Intent = {
      ...intent,
      category_explicit: false,
      confidence: Math.min(intent.confidence, 0.3),
    };
    ranked = rankPool(relaxed, rows);
    if (ranked.length) fallbackUsed = "relaxed_filters";
  }
  if (ranked.length === 0) {
    // 2. Widen radius moderately.
    const widerRadius = Math.min(30000, baseRadius * 2);
    if (widerRadius > baseRadius) {
      const widerRows = await fetchNearby(widerRadius);
      if (widerRows.length > rows.length) {
        rows = widerRows;
        ranked = rankPool(intent, rows);
        if (ranked.length === 0) {
          const relaxed: Intent = { ...intent, category_explicit: false, confidence: 0 };
          ranked = rankPool(relaxed, rows);
        }
        if (ranked.length) fallbackUsed = fallbackUsed ?? "wider_radius";
      }
    }
  }
  if (ranked.length === 0) {
    // 3. Broader category, larger radius — last attempt before giving up on filters.
    const { data: broadData } = await supabase.rpc("venues_nearby", {
      p_lat: origin.lat,
      p_lon: origin.lon,
      p_radius_m: 20000,
      p_city: input.city,
      p_categories: DEFAULT_CATEGORIES,
      p_limit: 600,
      p_tags: null,
      p_cuisines: null,
      p_tier: CATALOG_TIER,
    });
    const broadRows = (broadData ?? []) as VenueRow[];
    if (broadRows.length) {
      rows = broadRows;
      const relaxed: Intent = { ...intent, category_explicit: false, confidence: 0 };
      ranked = rankPool(relaxed, rows);
      if (ranked.length) fallbackUsed = "broader_category";
    }
  }
  if (ranked.length === 0 && rows.length > 0) {
    // 4. Never return zero if any venue exists nearby — rank on distance/quality only.
    ranked = rankPool(emptyIntent(), rows);
    fallbackUsed = "distance_quality_only";
  }

  // A named cuisine is a requirement, not a preference: when places that
  // clearly serve it exist, a closer place that doesn't must not outrank them.
  if (intent.cuisines.length) {
    const serving = ranked.filter(serves);
    if (serving.length) ranked = serving;
  }
  // Same for a dish: places whose reviews mention it beat places that don't.
  if (intent.dish) {
    const mentioning = ranked.filter((s) => (s.candidate.dish_mentions ?? 0) > 0);
    if (mentioning.length) ranked = mentioning;
  }
  // One entry per name: three branches of the same chain are one answer, not three.
  {
    const seenNames = new Set<string>();
    ranked = ranked.filter((s) => {
      const key = s.candidate.name.trim().toLowerCase().replace(/\s+/g, " ");
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
  }
  // Honesty check: if a cuisine was asked for and none of the venues we are
  // about to show actually serves it, say so instead of pretending.
  const shown = ranked.slice(0, input.limit ?? 10);
  if (
    intent.cuisines.length &&
    shown.length &&
    !shown.some((s) => (s.components.cuisine ?? 0) >= SERVES)
  ) {
    fallbackUsed = fallbackUsed ?? "no_cuisine_match";
  }
  // Honesty check 2: the user shared their location and nothing we show is
  // reachable on foot – say so rather than labelling an 11 km walk "a bit far".
  const farFromUser =
    origin.source === "user" &&
    (intent.transport == null || intent.transport === "walking") &&
    shown.length > 0 &&
    shown.every((s) => s.distance_min > 60);

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
        parser_error: parsed.fallback_reason ?? null,
        city: input.city,
        user_location: `SRID=4326;POINT(${origin.lon} ${origin.lat})`,
        user_location_accuracy_m: origin.source === "user" ? (input.accuracy_m ?? null) : null,
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
    parser_fallback_reason: parsed.fallback_reason ?? null,
    weather,
    origin,
    candidates: rows.length,
    results,
    coverage,
    far_from_user: farFromUser,
    query_log_id: queryLogId,
    mode: "discovery",
    fallback_used: fallbackUsed,
    debug: input.debug
      ? {
          candidates_before: candidatesBeforeFilters,
          candidates_after_hard_filters: candidatesAfterHardFilters,
          hard_filter_exclusions: exclusions,
          fallback_used: fallbackUsed,
          mode: "discovery",
        }
      : null,
  };
}
