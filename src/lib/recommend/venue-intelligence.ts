import { z } from "zod";

/**
 * Venue Intelligence – the structured shape an LLM extracts from real human
 * reviews for one venue. Pilot for the general MeeTap system (not Nergiz-only):
 * any venue's reviews should produce this same shape.
 *
 * Contract: UNKNOWN is not negative. If reviews never mention an aspect or
 * good-for tag, it must be ABSENT from the output – never a fabricated 0.
 * This mirrors `Intent`'s pattern in ./intent.ts (controlled vocab + zod
 * schema as the single source of truth for parser/consumer agreement).
 */

export const GOOD_FOR_TAGS = [
  "romantic",
  "date",
  "friends",
  "group",
  "family",
  "business",
  "solo",
  "conversation",
  "celebration",
  "birthday",
  "special_occasion",
  "casual",
  "quick_meal",
  "late_night",
  "work_study",
  "outdoor",
  "scenic_view",
  "local_food",
  "dessert",
  "coffee",
  "drinks",
  "budget_friendly",
  "premium",
] as const;
export type GoodForTag = (typeof GOOD_FOR_TAGS)[number];

export const ASPECT_KEYS = [
  "food_quality",
  "service",
  "atmosphere",
  "quiet",
  "romantic",
  "value",
  "cleanliness",
  "crowding",
  "view",
  "authenticity",
  "speed_of_service",
] as const;
export type AspectKey = (typeof ASPECT_KEYS)[number];

export const CAUTION_TAGS = [
  "loud",
  "crowded",
  "slow_service",
  "expensive_for_value",
  "touristy",
  "inconsistent_food",
  "inconsistent_service",
] as const;
export type CautionTag = (typeof CAUTION_TAGS)[number];

/** One piece of evidence: how strong, how sure, how many reviews said so. */
const signalSchema = z.object({
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  mention_count: z.number().int().min(0),
});
export type Signal = z.infer<typeof signalSchema>;

export const GoodForSignalSchema = signalSchema.extend({ tag: z.enum(GOOD_FOR_TAGS) });
export type GoodForSignal = z.infer<typeof GoodForSignalSchema>;

export const CautionSignalSchema = signalSchema.extend({ tag: z.enum(CAUTION_TAGS) });
export type CautionSignal = z.infer<typeof CautionSignalSchema>;

/** Sparse map – only aspects the reviews actually support get a key. */
const aspectsSchema = z.record(z.enum(ASPECT_KEYS), signalSchema);
export type AspectMap = z.infer<typeof aspectsSchema>;

export const VenueIntelligenceSchema = z.object({
  version: z.literal("v1"),
  summary: z.string(),
  review_count: z.number().int().min(0),
  overall_confidence: z.number().min(0).max(1),
  good_for: z.array(GoodForSignalSchema),
  aspects: aspectsSchema,
  cautions: z.array(CautionSignalSchema),
});
export type VenueIntelligence = z.infer<typeof VenueIntelligenceSchema>;

export type VenueIntelligenceValidation =
  | { ok: true; data: VenueIntelligence }
  | { ok: false; errors: string[] };

/** Fail safely: never let a malformed LLM response through as if it were valid. */
export function validateVenueIntelligence(json: unknown): VenueIntelligenceValidation {
  const parsed = VenueIntelligenceSchema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

/**
 * The one gate `--write` is allowed to check before touching the database:
 * a validated object, and nothing else. No fabricated/placeholder result may
 * ever satisfy this – `--write` must call this with a real
 * `validateVenueIntelligence()` result, never construct one to pass it.
 */
export function canWriteVenueIntelligence(
  validation: VenueIntelligenceValidation,
): validation is { ok: true; data: VenueIntelligence } {
  return validation.ok === true;
}
