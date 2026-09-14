import { z } from "zod";
import { FEATURES, MEALS } from "../catalog/taxonomy.ts";

import { ASPECT_KEYS, CAUTION_TAGS } from "./venue-intelligence.ts";

/**
 * Structured intent – the contract between the parser (LLM or rules)
 * and the scorer. Everything the user *means* ends up here; the scorer
 * never sees free text.
 */

export const PURPOSES = ["date", "friends", "study", "alone", "family", "business"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const CATEGORIES = ["Cafés", "Restaurants", "Bars", "Activities"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Ambiance vocabulary shared by parser, tagger and scorer. */
export const AMBIANCE_TAGS = [
  "quiet",
  "lively",
  "romantic",
  "cozy",
  "group_friendly",
  "work_friendly",
  "outdoor",
  "indoor",
  "live_music",
  "view",
  "seaside",
  "family_friendly",
  "trendy",
  "late_night",
  "breakfast",
  "fine_dining",
  "cheap_eats",
] as const;
export type AmbianceTag = (typeof AMBIANCE_TAGS)[number];

/** Cuisine vocabulary (normalised keys, matched against OSM/Overture cuisine values). */
export const CUISINES = [
  "kebab",
  "turkish",
  "home_cooking",
  "meyhane",
  "seafood",
  "steak",
  "burger",
  "pizza",
  "italian",
  "sushi",
  "japanese",
  "chinese",
  "asian",
  "indian",
  "mexican",
  "breakfast",
  "coffee",
  "tea",
  "dessert",
  "bakery",
  "vegetarian",
  "vegan",
  "azerbaijani",
  "georgian",
  "international",
] as const;
export type Cuisine = (typeof CUISINES)[number];

export const NEEDS = [
  "wifi",
  "power_outlets",
  "vegetarian",
  "vegan",
  "halal",
  "wheelchair",
  "kid_friendly",
  "smoking_area",
  "no_smoking",
] as const;
export type Need = (typeof NEEDS)[number];

const ambianceTag = z.enum(AMBIANCE_TAGS);

/** "Home cooking" / "home-cooking" / "HOME_COOKING" → "home_cooking". */
export function normalizeCuisineKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(
      /[çğıöşüâîû]/g,
      (ch) =>
        ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[ch] ?? ch,
    )
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const IntentSchema = z.object({
  purpose: z.enum(PURPOSES).nullable().default(null),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  /**
   * Open vocabulary: any cuisine as a lowercase snake_case English key
   * ("kebab", "uzbek", "georgian"). Known keys get rich aliases; unknown keys
   * are matched against venue data + venue names via `cuisine_keywords`, so a
   * cuisine nobody listed in code still works.
   */
  cuisines: z
    .array(z.string().min(2).max(40))
    .default([])
    .transform((arr) => [...new Set(arr.map(normalizeCuisineKey).filter(Boolean))]),
  /**
   * Words that would appear in the NAME of a venue serving those cuisines,
   * in any language/script the city uses ("uzbek" → ["uzbek","özbek","semerkand"]).
   * Used to find venues the open data typed as a generic restaurant.
   */
  cuisine_keywords: z
    .preprocess(
      // Models like to answer {"uzbek": ["özbek", …]} – flatten to one list.
      (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.values(v).flat() : v),
      z.array(z.string().min(2).max(40)).default([]),
    )
    .transform((arr) => [...new Set(arr.map((k) => k.trim().toLowerCase()).filter(Boolean))]),
  ambiance: z
    .object({
      /** Every tag here should be present. */
      all_of: z.array(ambianceTag).default([]),
      /** Each inner list is an OR-group: at least one of them should be present. */
      any_of: z.array(z.array(ambianceTag).min(1)).default([]),
      /** Tags the user explicitly does not want. */
      avoid: z.array(ambianceTag).default([]),
    })
    .default({ all_of: [], any_of: [], avoid: [] }),
  budget: z
    .object({
      max_per_person: z.number().positive().nullable().default(null),
      level: z.enum(["low", "mid", "high"]).nullable().default(null),
      currency: z.string().nullable().default(null),
    })
    .default({ max_per_person: null, level: null, currency: null }),
  group_size: z.number().int().positive().nullable().default(null),
  transport: z.enum(["walking", "car", "transit"]).nullable().default(null),
  max_distance_min: z.number().positive().nullable().default(null),
  time: z.enum(["now", "tonight", "tomorrow", "weekend"]).nullable().default(null),
  needs: z.array(z.enum(NEEDS)).default([]),
  /**
   * Concrete, checkable venue features from the catalog taxonomy
   * ("kabinet" → private_room, "karaoke", "canlı müzik" → live_music…).
   * A requirement: when the pool has venues with the feature, only they
   * qualify; when no venue has data for it, it is reported as unverifiable.
   */
  features: z.array(z.enum(FEATURES)).default([]),
  /** Meal moment asked for ("kahvaltı", "öğle yemeği", "gece geç saat"). */
  meals: z.array(z.enum(MEALS)).default([]),
  /**
   * A specific dish the user wants ("xəngəl", "cheesecake", "dolma") – free
   * text, lowercase. Matched against signature_dishes and real review texts,
   * never guessed into a cuisine.
   */
  dish: z
    .string()
    .min(2)
    .max(40)
    .nullable()
    .default(null)
    .transform((v) => (v ? v.trim().toLowerCase() : null)),
  /** True when the sentence mentions weather ("yağmur yağıyor") – scorer weighs weather more. */
  weather_sensitive: z.boolean().default(false),
  /** Free-text bits we could not map; surfaced to the LLM path and to logs. */
  unmapped: z.array(z.string()).default([]),
  /**
   * How confident the parse is (copied in from `ParsedIntent.confidence` by the
   * engine) – lets the scorer soften hard filters when a guess is shaky instead
   * of excluding candidates on an uncertain read of the sentence.
   */
  confidence: z.number().min(0).max(1).default(1),
  /**
   * Subjective/review-evidence priorities ("yemekleri iyi" → food_quality,
   * "servisi iyi" → service). Never a candidate filter – purely a ranking
   * signal, and only meaningful when a venue actually has Venue Intelligence
   * data (src/lib/recommend/venue-intelligence.ts). Reuses that module's
   * controlled vocabulary instead of a second one.
   */
  review_priorities: z.array(z.enum(ASPECT_KEYS)).default([]),
  /** Things reviews should NOT say ("kalabalık olmasın" → crowded). Same rules as above. */
  review_avoid: z.array(z.enum(CAUTION_TAGS)).default([]),
  /**
   * False when `categories` was only inferred from a cuisine word (e.g. "kebap"
   * implying Restaurants) rather than the user naming a café/restaurant/bar/
   * activity explicitly. Inferred categories should widen retrieval, not gate it.
   */
  category_explicit: z.boolean().default(true),
});

export type Intent = z.infer<typeof IntentSchema>;

export const ParsedIntentSchema = z.object({
  intent: IntentSchema,
  parser: z.enum(["rules", "llm"]),
  raw: z.string(),
  /** 0..1 – how confident the parser is that it understood the sentence. */
  confidence: z.number().min(0).max(1),
  /** Set when the LLM was wanted but the rules had to answer instead
   * ("llm_not_configured", a timeout, an HTTP error…). Logged, never shown raw. */
  fallback_reason: z.string().optional(),
});
export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

export function emptyIntent(): Intent {
  return IntentSchema.parse({});
}
