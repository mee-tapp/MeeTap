#!/usr/bin/env node
/**
 * Meetap – Overture Maps Places normaliser.
 *
 * Step 1 (download, free, no key – needs `pip install overturemaps`):
 *   overturemaps download --bbox=<west>,<south>,<east>,<north> -f geojson --type=place -o data/raw/overture-<area>.geojson
 *
 * Step 2 (this script):
 *   node scripts/data/normalize-overture.mjs <area-name> data/raw/overture-<area>.geojson [out.json]
 *
 * Keeps only venue-like categories, maps them to Meetap's 4 UI categories,
 * derives cuisine / price-band / ambiance *hints* from the Overture category.
 * Data licence: CDLA-Permissive 2.0 (Overture Maps Foundation).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [areaName, inPath, outArg] = process.argv.slice(2);
if (!areaName || !inPath) {
  console.error("Usage: normalize-overture.mjs <area-name> <overture.geojson> [out.json]");
  process.exit(1);
}
const outPath = outArg ?? path.join("data", "raw", `overture-${areaName}.json`);

/**
 * Overture primary category → [ui category, cuisine hints, price band hint, ambiance hints]
 * Anything not listed (barber, parking, publisher…) is dropped.
 */
const CAT = {
  // Cafés
  cafe: ["Cafés", [], 2, []],
  coffee_shop: ["Cafés", ["coffee_shop"], 2, []],
  coffee_roastery: ["Cafés", ["coffee_shop"], 2, []],
  tea_room: ["Cafés", ["tea"], 1, ["quiet"]],
  bubble_tea: ["Cafés", ["tea"], 1, []],
  desserts: ["Cafés", ["dessert"], 2, []],
  dessert_shop: ["Cafés", ["dessert"], 2, []],
  ice_cream_shop: ["Cafés", ["ice_cream"], 1, []],
  bakery: ["Cafés", ["bakery"], 1, []],
  patisserie_cake_shop: ["Cafés", ["dessert", "bakery"], 2, []],
  smoothie_juice_bar: ["Cafés", [], 1, []],
  breakfast_and_brunch_restaurant: ["Cafés", ["breakfast"], 2, ["breakfast"]],
  internet_cafe: ["Cafés", [], 1, ["work_friendly"]],
  hookah_lounge: ["Cafés", [], 2, ["lively", "late_night"]],
  hookah_bar: ["Cafés", [], 2, ["lively", "late_night"]],

  // Restaurants
  restaurant: ["Restaurants", [], 3, []],
  turkish_restaurant: ["Restaurants", ["turkish"], 3, []],
  doner_kebab: ["Restaurants", ["kebab"], 1, ["cheap_eats"]],
  kebab_restaurant: ["Restaurants", ["kebab"], 2, []],
  kebab_shop: ["Restaurants", ["kebab"], 1, ["cheap_eats"]],
  middle_eastern_restaurant: ["Restaurants", ["kebab", "turkish"], 2, []],
  mediterranean_restaurant: ["Restaurants", ["international"], 3, []],
  fast_food_restaurant: ["Restaurants", [], 1, ["cheap_eats"]],
  burger_restaurant: ["Restaurants", ["burger"], 2, []],
  pizza_restaurant: ["Restaurants", ["pizza"], 2, []],
  italian_restaurant: ["Restaurants", ["italian"], 3, []],
  seafood_restaurant: ["Restaurants", ["seafood"], 3, []],
  fish_and_chips_restaurant: ["Restaurants", ["seafood"], 2, []],
  steakhouse: ["Restaurants", ["steak_house"], 4, ["fine_dining"]],
  barbecue_restaurant: ["Restaurants", ["steak_house", "kebab"], 3, []],
  sushi_restaurant: ["Restaurants", ["sushi"], 4, []],
  japanese_restaurant: ["Restaurants", ["japanese"], 3, []],
  ramen_restaurant: ["Restaurants", ["japanese"], 2, []],
  chinese_restaurant: ["Restaurants", ["chinese"], 2, []],
  asian_restaurant: ["Restaurants", ["asian"], 2, []],
  thai_restaurant: ["Restaurants", ["thai", "asian"], 3, []],
  korean_restaurant: ["Restaurants", ["korean", "asian"], 3, []],
  vietnamese_restaurant: ["Restaurants", ["vietnamese", "asian"], 2, []],
  indian_restaurant: ["Restaurants", ["indian"], 3, []],
  mexican_restaurant: ["Restaurants", ["mexican"], 2, []],
  tex_mex_restaurant: ["Restaurants", ["mexican"], 2, []],
  american_restaurant: ["Restaurants", ["american"], 3, []],
  french_restaurant: ["Restaurants", ["french"], 4, ["fine_dining"]],
  chicken_restaurant: ["Restaurants", ["chicken"], 1, ["cheap_eats"]],
  chicken_wings_restaurant: ["Restaurants", ["chicken"], 1, []],
  sandwich_shop: ["Restaurants", ["sandwich"], 1, ["cheap_eats"]],
  hot_dog_restaurant: ["Restaurants", ["hot_dog"], 1, ["cheap_eats"]],
  soup_restaurant: ["Restaurants", ["home_cooking"], 1, []],
  buffet_restaurant: ["Restaurants", ["home_cooking"], 2, []],
  diner: ["Restaurants", ["home_cooking"], 1, []],
  comfort_food_restaurant: ["Restaurants", ["home_cooking"], 2, []],
  family_style_restaurant: ["Restaurants", ["home_cooking"], 2, ["family_friendly"]],
  vegetarian_restaurant: ["Restaurants", ["vegetarian"], 2, []],
  vegan_restaurant: ["Restaurants", ["vegan"], 2, []],
  halal_restaurant: ["Restaurants", ["turkish"], 2, []],
  meze_restaurant: ["Restaurants", ["meyhane"], 3, []],
  fine_dining_restaurant: ["Restaurants", [], 4, ["fine_dining", "romantic"]],
  gastropub: ["Restaurants", ["international"], 3, ["lively"]],
  bistro: ["Restaurants", ["international"], 3, ["cozy"]],
  brasserie: ["Restaurants", ["french"], 3, []],
  georgian_restaurant: ["Restaurants", ["georgian"], 2, []],
  azerbaijani_restaurant: ["Restaurants", ["azerbaijani"], 2, []],
  caucasian_restaurant: ["Restaurants", ["azerbaijani", "georgian"], 2, []],
  russian_restaurant: ["Restaurants", ["russian"], 2, []],
  eastern_european_restaurant: ["Restaurants", ["russian"], 2, []],
  international_restaurant: ["Restaurants", ["international"], 3, []],
  street_food: ["Restaurants", [], 1, ["cheap_eats"]],
  food_court: ["Restaurants", [], 1, []],
  cafeteria: ["Restaurants", ["home_cooking"], 1, []],

  // Bars
  bar: ["Bars", [], 3, ["lively"]],
  pub: ["Bars", [], 3, ["lively"]],
  wine_bar: ["Bars", [], 3, ["romantic", "quiet"]],
  cocktail_bar: ["Bars", [], 3, ["trendy"]],
  beer_bar: ["Bars", [], 2, ["lively"]],
  beer_garden: ["Bars", [], 2, ["outdoor", "lively", "group_friendly"]],
  sports_bar: ["Bars", [], 2, ["lively", "group_friendly"]],
  lounge: ["Bars", [], 3, ["lively", "late_night"]],
  night_club: ["Bars", [], 3, ["lively", "late_night"]],
  dance_club: ["Bars", [], 3, ["lively", "late_night"]],
  karaoke: ["Bars", [], 2, ["lively", "group_friendly"]],
  jazz_and_blues: ["Bars", [], 3, ["live_music"]],
  live_music_venue: ["Bars", [], 3, ["live_music", "lively"]],
  music_venues: ["Bars", [], 3, ["live_music", "lively"]],
  tavern: ["Bars", ["meyhane"], 2, ["lively"]],
  meyhane: ["Bars", ["meyhane"], 3, ["lively"]],

  // Activities
  park: ["Activities", [], 1, ["outdoor"]],
  public_plaza: ["Activities", [], 1, ["outdoor"]],
  beach: ["Activities", [], 1, ["outdoor", "view"]],
  scenic_lookout: ["Activities", [], 1, ["outdoor", "view"]],
  garden: ["Activities", [], 1, ["outdoor", "quiet"]],
  botanical_garden: ["Activities", [], 1, ["outdoor", "quiet"]],
  museum: ["Activities", [], 2, ["indoor", "quiet"]],
  art_museum: ["Activities", [], 2, ["indoor", "quiet"]],
  history_museum: ["Activities", [], 2, ["indoor", "quiet"]],
  art_gallery: ["Activities", [], 1, ["indoor", "quiet"]],
  landmark_and_historical_building: ["Activities", [], 1, ["outdoor"]],
  monument: ["Activities", [], 1, ["outdoor"]],
  movie_theater: ["Activities", [], 2, ["indoor"]],
  cinema: ["Activities", [], 2, ["indoor"]],
  performing_arts_theater: ["Activities", [], 3, ["indoor"]],
  theater: ["Activities", [], 3, ["indoor"]],
  bowling_alley: ["Activities", [], 2, ["indoor", "group_friendly", "lively"]],
  escape_game: ["Activities", [], 2, ["indoor", "group_friendly"]],
  arcade: ["Activities", [], 2, ["indoor", "group_friendly", "lively"]],
  board_game_cafe: ["Activities", [], 2, ["indoor", "group_friendly"]],
  billiards: ["Activities", [], 2, ["indoor", "group_friendly"]],
  aquarium: ["Activities", [], 3, ["indoor", "family_friendly"]],
  zoo: ["Activities", [], 2, ["outdoor", "family_friendly"]],
  amusement_park: ["Activities", [], 3, ["outdoor", "family_friendly", "lively"]],
  boat_tour: ["Activities", [], 3, ["outdoor", "view"]],
  boat_tour_agency: ["Activities", [], 3, ["outdoor", "view"]],
  marina: ["Activities", [], 1, ["outdoor", "view"]],
  pier: ["Activities", [], 1, ["outdoor", "view"]],
  hiking_trail: ["Activities", [], 1, ["outdoor"]],
  bike_rentals: ["Activities", [], 2, ["outdoor"]],
  climbing_gym: ["Activities", [], 2, ["indoor", "lively"]],
  ice_skating_rink: ["Activities", [], 2, ["indoor", "family_friendly"]],
  library: ["Activities", [], 1, ["indoor", "quiet", "work_friendly"]],
  bookstore: ["Activities", [], 1, ["indoor", "quiet"]],
};

function normalise(feature) {
  const p = feature.properties ?? {};
  const primary = p.categories?.primary;
  const entry = CAT[primary];
  if (!entry) return null;
  const name = p.names?.primary;
  if (!name) return null;
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (lat == null || lon == null) return null;
  const [category, cuisineHints, priceHint, ambianceHints] = entry;

  // alternate categories can add cuisine hints (e.g. cafe + smoothie_juice_bar)
  const alt = p.categories?.alternate ?? [];
  const extraCuisines = alt.flatMap((a) => CAT[a]?.[1] ?? []);
  const extraAmbiance = alt.flatMap((a) => CAT[a]?.[3] ?? []);

  const addr = p.addresses?.[0] ?? {};
  return {
    source: "overture",
    source_id: p.id,
    name,
    name_en: null,
    category,
    raw_type: primary,
    alternate_types: alt,
    cuisines: [...new Set([...cuisineHints, ...extraCuisines])],
    lat,
    lon,
    address: {
      freeform: addr.freeform ?? null,
      district: addr.locality ?? null,
      postcode: addr.postcode || null,
      country: addr.country ?? null,
    },
    website: p.websites?.[0] ?? null,
    socials: p.socials ?? [],
    phone: p.phones?.[0] ?? null,
    brand: p.brand?.names?.primary ?? null,
    confidence: p.confidence ?? null,
    price_band_hint: priceHint,
    ambiance_hints: [...new Set([...ambianceHints, ...extraAmbiance])],
    fetched_at: new Date().toISOString(),
  };
}

async function main() {
  const geo = JSON.parse(await readFile(inPath, "utf8"));
  const all = geo.features ?? [];
  const venues = all.map(normalise).filter(Boolean);

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify(
      {
        area: areaName,
        source: "Overture Maps Foundation (CDLA-Permissive 2.0)",
        fetched_at: new Date().toISOString(),
        count: venues.length,
        venues,
      },
      null,
      2,
    ),
  );

  const byCat = {};
  for (const v of venues) byCat[v.category] = (byCat[v.category] ?? 0) + 1;
  const pct = (n) => `${Math.round((100 * n) / venues.length)}%`;
  console.log(`${areaName}: ${all.length} overture places → ${venues.length} venues → ${outPath}`);
  console.log("by category:", byCat);
  console.log("has cuisine hint:", pct(venues.filter((v) => v.cuisines.length).length));
  console.log("has website:", pct(venues.filter((v) => v.website).length));
  console.log("has phone:", pct(venues.filter((v) => v.phone).length));
  console.log("confidence ≥0.7:", pct(venues.filter((v) => (v.confidence ?? 0) >= 0.7).length));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
