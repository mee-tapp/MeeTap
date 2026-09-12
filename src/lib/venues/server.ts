import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Review, Venue } from "@/lib/site-data";

/**
 * Server functions – the only bridge between the Lovable UI and real data.
 *
 * Every function returns the `Venue` shape the UI already renders, so no page
 * layout or styling has to change. Heavy server-only modules (Supabase service
 * client, DeepSeek, Open-Meteo) are imported inside the handlers so nothing
 * secret ever reaches the browser bundle.
 */

export const CURRENCY_SYMBOL: Record<string, string> = { TRY: "₺", AZN: "₼", USD: "$", EUR: "€" };

/** Rough per-person spend per price band (same table the scorer uses). */
const BAND_ESTIMATE: Record<string, [number, number, number, number]> = {
  TRY: [200, 450, 900, 1800],
  AZN: [10, 20, 40, 80],
  USD: [8, 15, 30, 60],
  EUR: [8, 15, 30, 60],
};

const TAG_LABEL: Record<string, string> = {
  quiet: "Quiet",
  lively: "Lively",
  romantic: "Romantic",
  cozy: "Cozy",
  group_friendly: "Great for groups",
  work_friendly: "Good for working",
  outdoor: "Outdoor seating",
  indoor: "Indoor",
  live_music: "Live music",
  view: "Great view",
  seaside: "By the sea",
  family_friendly: "Family friendly",
  trendy: "Trendy",
  late_night: "Open late",
  breakfast: "Breakfast",
  fine_dining: "Fine dining",
  cheap_eats: "Cheap eats",
};

/** Mood chip → ambiance tags (server-side filter for Explore). */
export const MOOD_TAGS: Record<string, string[]> = {
  Date: ["romantic", "quiet", "view", "seaside", "cozy"],
  Friends: ["lively", "group_friendly"],
  Study: ["work_friendly", "quiet"],
  Alone: ["cozy", "quiet"],
};

const CUISINE_LABEL: Record<string, string> = {
  kebab: "Kebab",
  turkish: "Turkish",
  home_cooking: "Home cooking",
  meyhane: "Meyhane",
  seafood: "Seafood",
  steak_house: "Steakhouse",
  burger: "Burgers",
  pizza: "Pizza",
  italian: "Italian",
  sushi: "Sushi",
  japanese: "Japanese",
  chinese: "Chinese",
  asian: "Asian",
  indian: "Indian",
  mexican: "Mexican",
  breakfast: "Breakfast",
  coffee_shop: "Coffee",
  coffee: "Coffee",
  tea: "Tea",
  dessert: "Desserts",
  ice_cream: "Ice cream",
  bakery: "Bakery",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  azerbaijani: "Azerbaijani",
  georgian: "Georgian",
  international: "International",
  regional: "Regional",
  local: "Local",
  chicken: "Chicken",
  sandwich: "Sandwiches",
  american: "American",
  french: "French",
  mediterranean: "Mediterranean",
  steak: "Steak",
  fast_food: "Fast food",
  cake: "Cakes",
  pastry: "Pastries",
  fish: "Fish",
  grill: "Grill",
  thai: "Thai",
  korean: "Korean",
  vietnamese: "Vietnamese",
  russian: "Russian",
  hot_dog: "Hot dogs",
};

/** Unknown cuisine keys still read well: "wood_fired_pizza" → "Wood fired pizza". */
function cuisineLabel(key: string): string {
  const known = CUISINE_LABEL[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Global / national chains go to the back of the "featured" queue. */
const CHAIN_RE =
  /\b(mcdonald|starbucks|burger king|kfc|domino|papa john|subway|pizza hut|kahve d[uü]nyas[iı]|espressolab|simit saray|coffy|gloria jean|costa coffee|tim hortons|dunkin|popeyes|sbarro|little caesars|arby)/i;

const SINGULAR: Record<string, string> = {
  Cafés: "Café",
  Restaurants: "Restaurant",
  Bars: "Bar",
  Activities: "Activity",
};

const VENUE_COLUMNS =
  "id,slug,name,category,cuisines,lat,lon,district,city,price_band,currency,ambiance_tags,rating_avg,rating_count,confidence,website,opening_hours,outdoor_seating,seaside,photo_url,photo_attribution";

export type VenueRowLite = {
  id: string;
  slug: string;
  name: string;
  category: Venue["category"];
  cuisines: string[] | null;
  lat: number;
  lon: number;
  district: string | null;
  city: string;
  price_band: number | null;
  currency: string | null;
  ambiance_tags: string[] | null;
  rating_avg: number | null;
  rating_count: number | null;
  confidence: number | null;
  website: string | null;
  opening_hours: string | null;
  outdoor_seating: boolean | null;
  seaside?: boolean | null;
  /** Licensed Google Places photo, when one has been matched (see
   * scripts/enrich/google-photos-pilot.mjs) – null for almost every venue today. */
  photo_url?: string | null;
  photo_attribution?: string | null;
};

function haversineMin(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.max(1, Math.round((2 * R * Math.asin(Math.sqrt(a))) / 80));
}

export function estimateBudget(band: number | null, currency: string | null): number {
  const table = BAND_ESTIMATE[currency ?? "TRY"] ?? BAND_ESTIMATE["TRY"]!;
  return band ? (table[band - 1] ?? table[1]) : table[1];
}

/** DB row → the exact shape the Lovable components render. */
export function toVenue(
  row: VenueRowLite,
  origin: { lat: number; lon: number },
  extra: { explanation?: string; distanceMin?: number } = {},
): Venue {
  const rawTags = row.seaside
    ? ["seaside", ...(row.ambiance_tags ?? [])]
    : (row.ambiance_tags ?? []);
  const tags = [...new Set(rawTags)].map((t) => TAG_LABEL[t] ?? t).slice(0, 3);
  const cuisines = (row.cuisines ?? []).map(cuisineLabel).slice(0, 2);
  const where = row.district ?? row.city;
  const detail =
    extra.explanation ||
    `${SINGULAR[row.category] ?? row.category} in ${where}${cuisines.length ? ` · ${cuisines.join(", ")}` : ""}.`;
  const minutes = extra.distanceMin ?? haversineMin(origin.lat, origin.lon, row.lat, row.lon);
  const count = row.rating_count ?? 0;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: row.photo_url ?? null,
    imageAttribution: row.photo_attribution ?? null,
    rating: count > 0 && row.rating_avg != null ? Number(row.rating_avg).toFixed(1) : null,
    reviews: String(count),
    time: `${minutes} min`,
    budget: estimateBudget(row.price_band, row.currency),
    priceLevel: row.price_band ?? null,
    priceSource: row.price_band ? "estimated" : "unknown",
    currency: row.currency ?? "TRY",
    tags: tags.length ? tags : cuisines,
    detail,
    category: row.category,
    city: row.city,
    ratingBreakdown: [0, 0, 0, 0, 0],
    reviewList: [],
    website: row.website,
    lat: row.lat,
    lon: row.lon,
  };
}

// ---------------------------------------------------------------------------

const exploreInput = z.object({
  city: z.string(),
  category: z.string().default("All"),
  mood: z.string().nullable().default(null),
  query: z.string().default(""),
  maxBudget: z.number().nullable().default(null),
  maxDistanceMin: z.number().nullable().default(null),
  limit: z.number().int().min(1).max(200).default(60),
  /** user position when granted – distances are measured from here instead of the city centre */
  lat: z.number().nullable().default(null),
  lon: z.number().nullable().default(null),
});

/** Explore page list: real venues for the selected city, filtered server-side. */
export const fetchVenues = createServerFn({ method: "GET" })
  .validator((input: unknown) => exploreInput.parse(input))
  .handler(async ({ data }) => {
    const { serviceClient, CITY_CENTERS } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const center = CITY_CENTERS[data.city] ?? CITY_CENTERS["Istanbul"]!;

    let q = sb
      .from("venues")
      .select(VENUE_COLUMNS, { count: "exact" })
      .eq("city", data.city)
      .eq("is_active", true);
    if (data.category !== "All") q = q.eq("category", data.category);
    const moodTags = data.mood ? MOOD_TAGS[data.mood] : null;
    if (moodTags) q = q.overlaps("ambiance_tags", moodTags);
    // "seaside" is a column, not a tag; the Date mood accepts it as well.
    if (data.mood === "Date")
      q = q.or(`ambiance_tags.ov.{${MOOD_TAGS["Date"]!.join(",")}},seaside.eq.true`);
    if (data.query.trim()) q = q.ilike("name", `%${data.query.trim()}%`);
    if (data.maxBudget != null) {
      const table = BAND_ESTIMATE[center.currency] ?? BAND_ESTIMATE["TRY"]!;
      let band = 0;
      table.forEach((estimate, index) => {
        if (estimate <= data.maxBudget!) band = index + 1;
      });
      if (band < 4) q = q.lte("price_band", Math.max(1, band));
    }
    // Pull a wider slice than needed – both so the distance filter still has
    // choice, and so a run of high-"confidence" chain branches (open-data
    // confidence reflects how sure we are the record is accurate, not how
    // interesting the place is) can't fill the entire visible list by itself;
    // same de-prioritization fetchFeatured already applies below.
    const {
      data: rows,
      count,
      error,
    } = await q
      .order("confidence", { ascending: false, nullsFirst: false })
      .limit(data.maxDistanceMin != null ? 400 : Math.max(data.limit * 5, 200));
    if (error) throw new Error(error.message);

    const origin = data.lat != null && data.lon != null ? { lat: data.lat, lon: data.lon } : center;
    let venues = (rows as VenueRowLite[]).map((r) => toVenue(r, origin));
    if (data.maxDistanceMin != null) {
      venues = venues.filter((v) => Number.parseInt(v.time, 10) <= data.maxDistanceMin!);
    }
    const isChain = (name: string) => CHAIN_RE.test(name);
    venues.sort((a, b) => Number(isChain(a.name)) - Number(isChain(b.name)));
    return { venues: venues.slice(0, data.limit), total: count ?? 0 };
  });

/**
 * Home page featured picks: real venues near the city centre with a website
 * and known cuisine, highest open-data confidence first, one per category so
 * the row is varied (café, restaurant, bar…).
 */
export const fetchFeatured = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ city: z.string(), limit: z.number().default(3) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { serviceClient, CITY_CENTERS } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const center = CITY_CENTERS[data.city] ?? CITY_CENTERS["Istanbul"]!;
    const { data: rows, error } = await sb.rpc("venues_nearby", {
      p_lat: center.lat,
      p_lon: center.lon,
      p_radius_m: 6000,
      p_city: data.city,
      p_categories: null,
      p_limit: 600,
    });
    if (error) throw new Error(error.message);
    const isChain = (name: string) => CHAIN_RE.test(name);
    const pool = ((rows ?? []) as Array<VenueRowLite & { distance_m: number }>)
      .filter((r) => r.website && (r.cuisines?.length ?? 0) > 0 && r.photo_url)
      .sort(
        (a, b) =>
          Number(isChain(a.name)) - Number(isChain(b.name)) ||
          (b.rating_count ?? 0) - (a.rating_count ?? 0) ||
          (b.confidence ?? 0) - (a.confidence ?? 0) ||
          a.distance_m - b.distance_m,
      );
    const picked: VenueRowLite[] = [];
    const seenNames = new Set<string>();
    const seenCats = new Set<string>();
    for (const pass of [true, false]) {
      for (const r of pool) {
        if (picked.length >= data.limit) break;
        const nameKey = r.name.toLowerCase();
        if (seenNames.has(nameKey)) continue;
        if (pass && seenCats.has(r.category)) continue;
        picked.push(r);
        seenNames.add(nameKey);
        seenCats.add(r.category);
      }
    }
    return picked.map((r) => toVenue({ ...r, city: data.city }, center));
  });

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? "s" : ""} ago`;
  return `${Math.floor(days / 365)} year${days >= 730 ? "s" : ""} ago`;
}

type ReviewRow = {
  author_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

function toReviews(rows: ReviewRow[]): { list: Review[]; breakdown: number[] } {
  const list = rows.map((r) => ({
    name: r.author_name,
    rating: r.rating,
    date: relativeDate(r.created_at),
    comment: r.comment || "No comment left.",
  }));
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) counts[5 - r.rating] = (counts[5 - r.rating] ?? 0) + 1;
  const breakdown = rows.length ? counts.map((c) => Math.round((100 * c) / rows.length)) : counts;
  return { list, breakdown };
}

/** Venue detail page, with its reviews. */
export const fetchVenue = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { serviceClient, CITY_CENTERS } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const { data: row, error } = await sb
      .from("venues")
      .select(VENUE_COLUMNS)
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const r = row as VenueRowLite;
    const center = CITY_CENTERS[r.city] ?? CITY_CENTERS["Istanbul"]!;
    const { data: reviews } = await sb
      .from("reviews")
      .select("author_name,rating,comment,created_at")
      .eq("venue_id", r.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const { list, breakdown } = toReviews((reviews ?? []) as ReviewRow[]);
    return { ...toVenue(r, center), ratingBreakdown: breakdown, reviewList: list };
  });

/** Post a review. Anyone can post; server-side sanity limits only. */
export const submitReview = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        slug: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(1000).default(""),
        name: z.string().max(60).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { serviceClient } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const { data: venue } = await sb
      .from("venues")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!venue) throw new Error("venue not found");
    const { error } = await sb.from("reviews").insert({
      venue_id: venue.id,
      author_name: data.name.trim() || "Guest",
      rating: data.rating,
      comment: data.comment.trim() || null,
    });
    if (error) throw new Error(error.message);
    const { data: reviews } = await sb
      .from("reviews")
      .select("author_name,rating,comment,created_at")
      .eq("venue_id", venue.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const { list, breakdown } = toReviews((reviews ?? []) as ReviewRow[]);
    const avg = list.length
      ? (list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1)
      : null;
    return {
      reviewList: list,
      ratingBreakdown: breakdown,
      rating: avg,
      reviews: String(list.length),
    };
  });

/** Hero search: natural language → ranked real venues with explanations. */
export const recommendVenues = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        query: z.string().min(2).max(500),
        city: z.string(),
        lat: z.number().nullable().default(null),
        lon: z.number().nullable().default(null),
        limit: z.number().int().min(1).max(20).default(6),
        /** "rules" skips the LLM – used by the How-it-works demo. */
        parser: z.enum(["auto", "rules"]).default("auto"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { recommend } = await import("@/lib/recommend/engine");
    // No explicit locale from the client – recommend() detects it from the
    // query text itself, so explanations match what the user actually typed.
    const out = await recommend({ ...data });
    const origin = out.origin;
    const results = out.results.map((r) =>
      toVenue({ ...r.venue, city: data.city }, origin, {
        explanation: r.explanation,
        distanceMin: r.distance_min,
      }),
    );
    const notice =
      out.fallback_used === "no_cuisine_match"
        ? "We couldn't find a place that clearly serves that cuisine nearby, so these are the closest matches."
        : out.fallback_used && out.fallback_used !== "relaxed_filters"
          ? "Few exact matches nearby, so we widened the search."
          : null;
    return {
      results,
      notice,
      query_log_id: out.query_log_id,
      weather: out.weather
        ? {
            temp_c: out.weather.temp_c,
            label: out.weather.label_en,
            is_raining: out.weather.is_raining,
          }
        : null,
      intent: out.intent,
      parser: out.parser,
      candidates: out.candidates,
      origin,
    };
  });

/** Real numbers for the stat tiles (no more "50k+"). */
export const fetchStats = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ city: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { serviceClient } = await import("@/lib/recommend/engine");
    const sb = serviceClient();
    const [places, cities, reviews, searches, rated] = await Promise.all([
      sb
        .from("venues")
        .select("id", { count: "exact", head: true })
        .eq("city", data.city)
        .eq("is_active", true),
      sb.rpc("venue_city_count"),
      sb.from("reviews").select("id", { count: "exact", head: true }),
      sb.from("query_logs").select("id", { count: "exact", head: true }),
      sb.from("venues").select("rating_avg,rating_count").gt("rating_count", 0),
    ]);
    const ratedRows = (rated.data ?? []) as Array<{ rating_avg: number; rating_count: number }>;
    const totalRatings = ratedRows.reduce((sum, r) => sum + r.rating_count, 0);
    const avg = totalRatings
      ? ratedRows.reduce((sum, r) => sum + Number(r.rating_avg) * r.rating_count, 0) / totalRatings
      : null;
    return {
      places: places.count ?? 0,
      cities: typeof cities.data === "number" ? cities.data : 0,
      reviews: reviews.count ?? 0,
      searches: searches.count ?? 0,
      avgRating: avg != null ? avg.toFixed(1) : null,
    };
  });

/** Which recommendation the user actually opened – feeds weight tuning later. */
export const logRecommendationClick = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ queryLogId: z.string().uuid(), venueId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { serviceClient } = await import("@/lib/recommend/engine");
    await serviceClient()
      .from("query_logs")
      .update({ clicked_venue_id: data.venueId })
      .eq("id", data.queryLogId);
    return { ok: true };
  });
