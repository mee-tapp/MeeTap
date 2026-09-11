#!/usr/bin/env node
/**
 * Lightweight schema/logic checks for Venue Intelligence – no DB, no LLM.
 * Same style as scripts/eval/intent-eval.mjs: plain assertions, one summary line.
 *
 * Usage: node scripts/eval/venue-intelligence-eval.mjs
 */
import {
  canWriteVenueIntelligence,
  validateVenueIntelligence,
} from "../../src/lib/recommend/venue-intelligence.ts";
import {
  buildVenueEvidenceInput,
  fromVenueReviewsExternalRow,
  validateVenueEvidenceInput,
} from "../../src/lib/recommend/venue-evidence.ts";

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) {
    pass++;
    console.log(`ok   ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}`);
  }
}

const TEST_VENUE = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Test Venue",
  category: "Cafés",
  cuisines: [],
  price_band: null,
  city: "Istanbul",
  district: null,
  ambiance_tags: [],
  external_rating: null,
  external_review_count: null,
};

// 1. valid VenueIntelligence object passes schema
const validVI = {
  version: "v1",
  summary: "Quiet café, generally liked.",
  review_count: 3,
  overall_confidence: 0.4,
  good_for: [{ tag: "coffee", score: 0.7, confidence: 0.5, mention_count: 2 }],
  aspects: { food_quality: { score: 0.6, confidence: 0.4, mention_count: 2 } },
  cautions: [],
};
const v1 = validateVenueIntelligence(validVI);
check("1. valid VenueIntelligence object passes schema", v1.ok === true);

// 2. invalid confidence > 1 fails
const v2 = validateVenueIntelligence({ ...validVI, overall_confidence: 1.5 });
check("2. overall_confidence > 1 fails validation", v2.ok === false);

// 3. unknown aspect can be absent (empty aspects map is valid, not an error)
const v3 = validateVenueIntelligence({ ...validVI, aspects: {} });
check("3. absent/unknown aspects (empty map) validate successfully", v3.ok === true);

// 4. arbitrary unknown good_for tag fails
const v4 = validateVenueIntelligence({
  ...validVI,
  good_for: [{ tag: "not_a_real_tag", score: 0.5, confidence: 0.5, mention_count: 1 }],
});
check("4. unrecognized good_for tag fails validation", v4.ok === false);

// 5. empty reviews prepare successfully
const emptyEvidence = buildVenueEvidenceInput(TEST_VENUE, []);
const v5 = validateVenueEvidenceInput(emptyEvidence);
check(
  "5. venue with zero reviews still prepares/validates successfully",
  v5.ok === true && v5.data.reviews.length === 0,
);

// 6. venue with reviews normalizes correctly
const rawRow = {
  source: "tripadvisor",
  external_id: "r1",
  rating: 5,
  title: "Great",
  body: "Loved it",
  lang: "en",
  trip_type: "FRIENDS",
  published_at: "2026-08-01",
};
const normalized = fromVenueReviewsExternalRow(rawRow);
const withReviews = buildVenueEvidenceInput(TEST_VENUE, [normalized]);
const v6 = validateVenueEvidenceInput(withReviews);
check(
  "6. venue with a real review row normalizes + validates correctly",
  v6.ok === true &&
    v6.data.reviews.length === 1 &&
    v6.data.reviews[0].text === "Loved it" &&
    v6.data.reviews[0].external_review_id === "r1" &&
    v6.data.reviews[0].source === "tripadvisor",
);

// 7. write mode without validated intelligence refuses to write
const failedValidation = validateVenueIntelligence({ ...validVI, overall_confidence: 2 });
check("7a. write guard refuses when validation failed", canWriteVenueIntelligence(failedValidation) === false);
check("7b. write guard allows only when validation passed", canWriteVenueIntelligence(v1) === true);

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail > 0) process.exit(1);
