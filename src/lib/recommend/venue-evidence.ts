import { z } from "zod";

/**
 * Provider-independent evidence model – the input side of Venue Intelligence.
 * Terra/Tripadvisor (or Google/Foursquare later) JSON must never leak past
 * this file: every provider gets its own tiny normalizer function here, and
 * everything downstream (the LLM prompt, tests, future providers) only ever
 * sees `VenueEvidenceInput`.
 *
 * Mirrors the existing DB shape (supabase/migrations/0010_external_reviews.sql:
 * venue_external, venue_reviews_external) rather than any one provider's API.
 */

export const EVIDENCE_SOURCES = ["tripadvisor", "google", "foursquare"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number] | (string & {});

export const ExternalReviewEvidenceSchema = z.object({
  source: z.string(),
  external_review_id: z.string(),
  rating: z.number().nullable(),
  title: z.string().nullable(),
  text: z.string().nullable(),
  language: z.string().nullable(),
  trip_type: z.string().nullable(),
  /** ISO date (yyyy-mm-dd or full timestamp) – kept as a string, not a Date,
   * so this schema stays JSON-serializable end to end. */
  published_at: z.string().nullable(),
  /** Not every provider/table has these yet (venue_reviews_external doesn't
   * store them today) – always default to empty rather than omit the field. */
  subratings: z.array(z.object({ type: z.string(), rating: z.number() })).default([]),
});
export type ExternalReviewEvidence = z.infer<typeof ExternalReviewEvidenceSchema>;

export const VenueEvidenceInputSchema = z.object({
  venue: z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    cuisines: z.array(z.string()),
    price_band: z.number().nullable(),
    city: z.string(),
    district: z.string().nullable(),
    ambiance_tags: z.array(z.string()),
    external_rating: z.number().nullable(),
    external_review_count: z.number().nullable(),
  }),
  reviews: z.array(ExternalReviewEvidenceSchema),
});
export type VenueEvidenceInput = z.infer<typeof VenueEvidenceInputSchema>;

export type VenueEvidenceValidation =
  { ok: true; data: VenueEvidenceInput } | { ok: false; errors: string[] };

export function validateVenueEvidenceInput(json: unknown): VenueEvidenceValidation {
  const parsed = VenueEvidenceInputSchema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

// --- adapters ----------------------------------------------------------------
// Each adapter maps ONE source's row shape to the provider-independent model.
// Add a new function here (not a new field on the shared schema) for a new source.

/** A row from public.venue_reviews_external (already source-agnostic in the DB;
 * this just renames/reshapes columns into the shared evidence shape). */
export function fromVenueReviewsExternalRow(row: {
  source: string;
  external_id: string;
  rating: number | null;
  title: string | null;
  body: string | null;
  lang: string | null;
  trip_type: string | null;
  published_at: string | null;
}): ExternalReviewEvidence {
  return {
    source: row.source,
    external_review_id: row.external_id,
    rating: row.rating,
    title: row.title,
    text: row.body,
    language: row.lang,
    trip_type: row.trip_type,
    published_at: row.published_at,
    subratings: [],
  };
}

/** A raw Terra `/locations/{id}/reviews` entry (see scripts/enrich/terra-reviews-nergiz.mjs) –
 * used before anything is written to venue_reviews_external. */
export function fromTerraReviewJson(raw: Record<string, unknown>): ExternalReviewEvidence {
  const primaryEntry = (value: unknown): { value?: string; language?: string } | undefined => {
    if (Array.isArray(value) && value.length) {
      return (value.find((v) => v && (v as { primary?: boolean }).primary) ?? value[0]) as
        { value?: string; language?: string } | undefined;
    }
    return undefined;
  };
  const localized = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    return primaryEntry(value)?.value ?? null;
  };
  const user = raw["user"] as { username?: string } | undefined;
  const subratingsRaw = Array.isArray(raw["subratings"])
    ? (raw["subratings"] as Array<Record<string, unknown>>)
    : [];
  return {
    source: "tripadvisor",
    external_review_id: String(raw["id"] ?? ""),
    rating: typeof raw["rating"] === "number" ? (raw["rating"] as number) : null,
    title: localized(raw["title"]),
    text: localized(raw["text"]),
    language: primaryEntry(raw["text"])?.language ?? primaryEntry(raw["title"])?.language ?? null,
    trip_type: typeof raw["trip_type"] === "string" ? (raw["trip_type"] as string) : null,
    published_at: typeof raw["publish_ts"] === "string" ? (raw["publish_ts"] as string) : null,
    subratings: subratingsRaw.map((s) => ({
      type: String(s["type_name"] ?? s["type"] ?? "unknown"),
      rating: typeof s["rating"] === "number" ? (s["rating"] as number) : 0,
    })),
  };
  // NOTE: reviewer identity (user.username, avatar, geo) is intentionally
  // dropped here – Venue Intelligence must never carry reviewer personal info.
  void user;
}

/** A row from public.venues (only the columns Venue Intelligence needs). */
export function buildVenueEvidenceInput(
  venueRow: {
    id: string;
    name: string;
    category: string;
    cuisines: string[] | null;
    price_band: number | null;
    city: string;
    district: string | null;
    ambiance_tags: string[] | null;
    external_rating: number | null;
    external_review_count: number | null;
  },
  reviews: ExternalReviewEvidence[],
): VenueEvidenceInput {
  return {
    venue: {
      id: venueRow.id,
      name: venueRow.name,
      category: venueRow.category,
      cuisines: venueRow.cuisines ?? [],
      price_band: venueRow.price_band,
      city: venueRow.city,
      district: venueRow.district,
      ambiance_tags: venueRow.ambiance_tags ?? [],
      external_rating: venueRow.external_rating,
      external_review_count: venueRow.external_review_count,
    },
    reviews,
  };
}

/** Sufficiency is descriptive, not a hard gate – the LLM step decides what to
 * do with thin evidence; this just tells a human/dev what to expect. */
export function evidenceSufficiency(reviewCount: number): "none" | "thin" | "sufficient" {
  if (reviewCount === 0) return "none";
  if (reviewCount < 3) return "thin";
  return "sufficient";
}
