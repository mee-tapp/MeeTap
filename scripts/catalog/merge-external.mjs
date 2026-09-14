#!/usr/bin/env node
/**
 * Meetap pilot catalog – step E: fold Tripadvisor facts (venue_external,
 * source='tripadvisor', written by scripts/enrich/tripadvisor.mjs) into the
 * catalog columns: features ("Private Dining" → private_room …), cuisines
 * (Tripadvisor cuisine names → our keys) and a combined rating.
 *
 * Google facts are folded in by google-details.mjs itself; this script only
 * adds what Tripadvisor knows on top. Rows a human edited (catalog_notes set)
 * keep their cuisines/establishment type; features are always merged (union).
 *
 * Usage:
 *   node --env-file=.env scripts/catalog/merge-external.mjs --city Baku
 *   node --env-file=.env scripts/catalog/merge-external.mjs --city Baku --dry-run
 */
import postgres from "postgres";
import { CATALOG_CUISINES, TRIPADVISOR_FEATURE_MAP } from "../../src/lib/catalog/taxonomy.ts";

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
const city = args.city ?? "Baku";
const dryRun = args["dry-run"] === true;
const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });

/** Tripadvisor cuisine names → our keys (lowercased, exact or word match). */
const TA_CUISINE = {
  azerbaijani: "azerbaijani",
  caucasian: "azerbaijani",
  turkish: "turkish",
  georgian: "georgian",
  uzbek: "uzbek",
  "central asian": "uzbek",
  russian: "russian",
  ukrainian: "ukrainian",
  european: "european",
  french: "french",
  italian: "italian",
  pizza: "pizza",
  spanish: "spanish",
  greek: "greek",
  mediterranean: "mediterranean",
  "middle eastern": "middle_eastern",
  arabic: "middle_eastern",
  lebanese: "lebanese",
  persian: "persian",
  indian: "indian",
  pakistani: "pakistani",
  chinese: "chinese",
  japanese: "japanese",
  sushi: "sushi",
  korean: "korean",
  thai: "thai",
  vietnamese: "vietnamese",
  asian: "asian",
  american: "american",
  "fast food": "burger",
  steakhouse: "steakhouse",
  barbecue: "barbecue_kebab",
  grill: "barbecue_kebab",
  seafood: "seafood",
  cafe: "cafe_food",
  dessert: "dessert",
  bakeries: "bakery_pastry",
  "vegetarian friendly": "vegetarian_vegan",
  "vegan options": "vegetarian_vegan",
  healthy: "healthy",
  international: "international",
};
const TA_GOOD_FOR = {
  romantic: "date_romantic",
  "special occasions": "celebration",
  "families with children": "family_kids",
  "family style": "family_kids",
  groups: "friends_groups",
  "large groups": "big_groups",
  "business meetings": "business",
  kids: "family_kids",
};
const TA_MEAL = {
  breakfast: "breakfast",
  brunch: "brunch",
  lunch: "lunch",
  dinner: "dinner",
  "late night": "late_night",
};

const rows = await sql`
  select v.id, v.name, v.cuisines, v.features, v.good_for, v.meals, v.catalog_notes, v.external_rating, v.external_review_count,
         e.rating ta_rating, e.review_count ta_count, e.cuisines ta_cuisines, e.features ta_features, e.raw
    from venues v join venue_external e on e.venue_id = v.id and e.source = 'tripadvisor'
   where v.city = ${city} and v.catalog_tier = 'pilot'`;
console.log(`${rows.length} pilot venues with Tripadvisor data`);

let updated = 0;
for (const r of rows) {
  const features = new Set(r.features);
  const goodFor = new Set(r.good_for);
  const meals = new Set(r.meals);
  const cuisines = new Set(r.cuisines);
  for (const f of r.ta_features ?? []) {
    const key = String(f).toLowerCase();
    if (TA_GOOD_FOR[key]) goodFor.add(TA_GOOD_FOR[key]);
    else if (TRIPADVISOR_FEATURE_MAP[key]) features.add(TRIPADVISOR_FEATURE_MAP[key]);
  }
  for (const c of r.ta_cuisines ?? []) {
    const key = String(c).toLowerCase();
    if (TA_CUISINE[key] && !r.catalog_notes) cuisines.add(TA_CUISINE[key]);
  }
  for (const m of r.raw?.meal_types ?? []) {
    const key = String(m.localized_name ?? m.name ?? m).toLowerCase();
    if (TA_MEAL[key]) meals.add(TA_MEAL[key]);
  }
  for (const t of r.raw?.trip_types ?? []) {
    const key = String(t.localized_name ?? t.name ?? "").toLowerCase();
    if (key === "couples" && Number(t.value ?? 0) > 0) goodFor.add("date_romantic");
    if (key === "family" && Number(t.value ?? 0) > 0) goodFor.add("family_kids");
    if (key === "business" && Number(t.value ?? 0) > 0) goodFor.add("business");
  }
  const next = {
    cuisines: [...cuisines].filter((c) => CATALOG_CUISINES.includes(c)),
    features: [...features],
    good_for: [...goodFor],
    meals: [...meals],
  };
  const changed =
    next.cuisines.length !== r.cuisines.length ||
    next.features.length !== r.features.length ||
    next.good_for.length !== r.good_for.length ||
    next.meals.length !== r.meals.length;
  if (!changed) continue;
  updated += 1;
  if (dryRun) {
    console.log(r.name, "→", JSON.stringify(next));
    continue;
  }
  await sql`update venues set cuisines = ${next.cuisines}, features = ${next.features}, good_for = ${next.good_for}, meals = ${next.meals}, catalog_updated_at = now() where id = ${r.id}`;
}
console.log(`${updated} venues ${dryRun ? "would change" : "updated"}`);
await sql.end();
