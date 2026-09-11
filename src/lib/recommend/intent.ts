import { z } from "zod";

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

export const IntentSchema = z.object({
  purpose: z.enum(PURPOSES).nullable().default(null),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  cuisines: z.array(z.enum(CUISINES)).default([]),
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
  /** True when the sentence mentions weather ("yağmur yağıyor") – scorer weighs weather more. */
  weather_sensitive: z.boolean().default(false),
  /** Free-text bits we could not map; surfaced to the LLM path and to logs. */
  unmapped: z.array(z.string()).default([]),
});

export type Intent = z.infer<typeof IntentSchema>;

export const ParsedIntentSchema = z.object({
  intent: IntentSchema,
  parser: z.enum(["rules", "llm"]),
  raw: z.string(),
  /** 0..1 – how confident the parser is that it understood the sentence. */
  confidence: z.number().min(0).max(1),
});
export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

export function emptyIntent(): Intent {
  return IntentSchema.parse({});
}
