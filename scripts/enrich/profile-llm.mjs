#!/usr/bin/env node
/**
 * Venue Intelligence pipeline – works for ANY venue_id, not just Nergiz.
 *
 *   venues + venue_reviews_external (DB, read-only)
 *   → VenueEvidenceInput (provider-independent, src/lib/recommend/venue-evidence.ts)
 *   → [LLM step, --dry-run/--write only] → VenueIntelligence (validated)
 *   → [--write only] venue_intelligence (upsert)
 *
 * Modes (exactly one; --prepare-only is the default):
 *   --prepare-only   Build + validate the evidence input, print a summary.
 *                    ZERO LLM calls. ZERO writes. Works with no DeepSeek config at all.
 *   --dry-run        Also calls DeepSeek once, validates the result, prints it.
 *                    ZERO writes.
 *   --write          Same as --dry-run, and if (and only if) validation passes,
 *                    upserts into public.venue_intelligence.
 *
 * Usage:
 *   node --env-file=.env scripts/enrich/profile-llm.mjs --venue-id <uuid> [--prepare-only|--dry-run|--write]
 */
import { serviceClient } from "../../src/lib/recommend/engine.ts";
import { providerConfig } from "../../src/lib/recommend/llm-parser.ts";
import {
  ASPECT_KEYS,
  CAUTION_TAGS,
  GOOD_FOR_TAGS,
  canWriteVenueIntelligence,
  validateVenueIntelligence,
} from "../../src/lib/recommend/venue-intelligence.ts";
import {
  buildVenueEvidenceInput,
  evidenceSufficiency,
  fromVenueReviewsExternalRow,
  validateVenueEvidenceInput,
} from "../../src/lib/recommend/venue-evidence.ts";

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
  console.error(
    "Usage: profile-llm.mjs --venue-id <uuid> [--prepare-only|--dry-run|--write]",
  );
  process.exit(1);
}

const modeFlags = ["prepare-only", "dry-run", "write"].filter((f) => args[f] === true);
if (modeFlags.length > 1) {
  console.error(`Pass only one of --prepare-only / --dry-run / --write (got: ${modeFlags.join(", ")})`);
  process.exit(1);
}
const mode = modeFlags[0] ?? "prepare-only";

// --- 1 & 2. Real venue + real external reviews (read-only). ------------------
const supabase = serviceClient();

const { data: venueRow, error: venueErr } = await supabase
  .from("venues")
  .select("id,name,category,cuisines,price_band,city,district,ambiance_tags,external_rating,external_review_count")
  .eq("id", VENUE_ID)
  .maybeSingle();
if (venueErr) {
  console.error(`Venue lookup failed: ${venueErr.message}`);
  process.exit(1);
}
if (!venueRow) {
  console.error(`No venue with id ${VENUE_ID}.`);
  process.exit(1);
}

const { data: reviewRows, error: reviewsErr } = await supabase
  .from("venue_reviews_external")
  .select("source,external_id,rating,title,body,lang,trip_type,published_at")
  .eq("venue_id", VENUE_ID)
  .order("published_at", { ascending: false });
if (reviewsErr) {
  console.error(`Review lookup failed: ${reviewsErr.message}`);
  process.exit(1);
}

// --- 3-5. Normalize + build + validate the provider-independent evidence input.
const normalizedReviews = (reviewRows ?? []).map(fromVenueReviewsExternalRow);
const evidenceInput = buildVenueEvidenceInput(venueRow, normalizedReviews);
const evidenceValidation = validateVenueEvidenceInput(evidenceInput);
if (!evidenceValidation.ok) {
  console.error("Prepared evidence failed validation (this should not happen from real DB rows):");
  for (const e of evidenceValidation.errors) console.error(`  - ${e}`);
  process.exit(1);
}

// --- 6. Compact summary (always printed, all modes). --------------------------
const sources = [...new Set(normalizedReviews.map((r) => r.source))];
const dates = normalizedReviews.map((r) => r.published_at).filter(Boolean).sort();
const reviewDateMin = dates[0] ?? null;
const reviewDateMax = dates[dates.length - 1] ?? null;
const sourceSummary = Object.fromEntries(
  sources.map((s) => [s, normalizedReviews.filter((r) => r.source === s).length]),
);
const sufficiency = evidenceSufficiency(normalizedReviews.length);

console.log(`Venue: ${venueRow.name} (${venueRow.city}, ${venueRow.category}) [${venueRow.id}]`);
console.log(`Review count (raw)        : ${reviewRows?.length ?? 0}`);
console.log(`Review count (normalized) : ${normalizedReviews.length}`);
console.log(`Sources found             : ${sources.length ? sources.join(", ") : "(none)"}`);
console.log(`Review date range         : ${reviewDateMin ?? "n/a"} .. ${reviewDateMax ?? "n/a"}`);
console.log(`Evidence sufficiency      : ${sufficiency}`);
if (normalizedReviews.length === 0) {
  console.log("No external review evidence available for this venue.");
}
console.log(`Mode                      : ${mode}`);

if (mode === "prepare-only") {
  console.log("\nPREPARE-ONLY: stopping here. Zero LLM calls, zero database writes.");
  process.exit(0);
}

// --- 7+. --dry-run / --write both need the LLM step. --------------------------
const cfg = providerConfig();
if (!cfg) {
  const provider = process.env["LLM_PROVIDER"];
  if (!provider || provider === "none") console.error("Missing env variable: LLM_PROVIDER");
  else if (provider === "deepseek") console.error("Missing env variable: DEEPSEEK_API_KEY");
  else if (provider === "groq") console.error("Missing env variable: GROQ_API_KEY");
  else if (provider === "gemini") console.error("Missing env variable: GEMINI_API_KEY");
  else console.error(`Missing env variable: DEEPSEEK_API_KEY (unrecognized LLM_PROVIDER=${provider})`);
  process.exit(1);
}

const SYSTEM_PROMPT = `You are MeeTap's Venue Intelligence extractor. You turn REAL human reviews of ONE venue into a structured JSON profile. You are doing evidence extraction, not writing marketing copy.

Controlled vocabulary – use ONLY these tags, never invent new ones:
good_for tags: ${JSON.stringify(GOOD_FOR_TAGS)}
aspect keys: ${JSON.stringify(ASPECT_KEYS)}
caution tags: ${JSON.stringify(CAUTION_TAGS)}

Hard rules:
- Use ONLY the supplied reviews and the supplied verified venue metadata. Never invent facts.
- Never infer quality, atmosphere, or good_for tags from the venue's name or category alone – only from what reviews actually say.
- Never turn one isolated review into a strong venue-wide claim.
- Repeated evidence across multiple reviews increases confidence; conflicting evidence between reviews decreases confidence.
- If a tag or aspect is not supported by the reviews, it must be ABSENT from the output entirely. Do not output it with score 0 – omit it. Absence is not negative, it is unknown.
- With very few reviews (this venue has ${normalizedReviews.length}), be conservative: keep overall_confidence and per-signal confidence low unless every review strongly agrees.
- No reviewer personal information (you have not been given any).
- No marketing language, no superlatives beyond what the reviews themselves support.
- Output strict JSON only, matching this shape exactly:
{
  "version": "v1",
  "summary": "one neutral sentence",
  "review_count": ${normalizedReviews.length},
  "overall_confidence": 0.0,
  "good_for": [{ "tag": "...", "score": 0.0, "confidence": 0.0, "mention_count": 0 }],
  "aspects": { "food_quality": { "score": 0.0, "confidence": 0.0, "mention_count": 0 } },
  "cautions": [{ "tag": "...", "score": 0.0, "confidence": 0.0, "mention_count": 0 }]
}`;

console.log(`\nCalling DeepSeek once (model=${cfg.model})...`);
let res;
try {
  res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(evidenceInput) },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
} catch (err) {
  console.error(`DeepSeek call failed: ${err?.message ?? err}`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`DeepSeek HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const completion = await res.json();
const content = completion.choices?.[0]?.message?.content;
if (!content) {
  console.error("DeepSeek returned no completion content.");
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(content);
} catch (err) {
  console.error(`DeepSeek response was not valid JSON: ${err.message}`);
  process.exit(1);
}

const intelligenceValidation = validateVenueIntelligence(parsed);
if (!intelligenceValidation.ok) {
  console.error("Schema validation: FAIL");
  for (const e of intelligenceValidation.errors) console.error(`  - ${e}`);
  process.exit(1);
}

const vi = intelligenceValidation.data;
console.log("Schema validation: PASS\n");
console.log("Summary            :", vi.summary);
console.log("Overall confidence :", vi.overall_confidence);
console.log("Good for           :", vi.good_for.map((g) => `${g.tag}(${g.score})`).join(", ") || "(none)");
console.log(
  "Aspects            :",
  Object.entries(vi.aspects)
    .map(([k, s]) => `${k}(${s.score})`)
    .join(", ") || "(none)",
);
console.log("Cautions           :", vi.cautions.map((c) => c.tag).join(", ") || "(none)");

if (mode === "dry-run") {
  console.log("\nDRY RUN: validated, but NOT written to the database.");
  process.exit(0);
}

// --- --write: the ONLY gate is a real, validated result. ----------------------
if (!canWriteVenueIntelligence(intelligenceValidation)) {
  console.error("Refusing to write: no validated Venue Intelligence object.");
  process.exit(1);
}
const { error: writeErr } = await supabase.from("venue_intelligence").upsert({
  venue_id: venueRow.id,
  version: vi.version,
  summary: vi.summary,
  good_for: vi.good_for,
  aspects: vi.aspects,
  cautions: vi.cautions,
  overall_confidence: vi.overall_confidence,
  review_count: vi.review_count,
  review_date_min: reviewDateMin,
  review_date_max: reviewDateMax,
  source_summary: sourceSummary,
  updated_at: new Date().toISOString(),
});
if (writeErr) {
  console.error(`Write failed: ${writeErr.message}`);
  process.exit(1);
}
console.log(`\nWROTE venue_intelligence for venue_id=${venueRow.id}`);
