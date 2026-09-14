/**
 * Meetap catalog taxonomy – the CLOSED vocabularies every pilot venue is
 * described with (decision 2026-09-14). The intent parser maps sentences to
 * these keys; anything it cannot map goes to `unmapped` and is reported to
 * the user. A new concept means a new key here + data for it, never a
 * one-off rule in the engine.
 *
 * Labels are user-facing (tr = Turkish/Azerbaijani UI wording, en = English).
 * Mapping tables at the bottom translate Google Places and Tripadvisor
 * vocabularies into ours; they are used by scripts/catalog/*.
 */

export const ESTABLISHMENT_TYPES = [
  "restaurant",
  "cafe_coffee",
  "bar_pub",
  "dessert_bakery",
  "quick_bites",
  "lounge_hookah",
  "tea_house",
] as const;
export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

/** Maps establishment types onto the four coarse `venues.category` values the UI already uses. */
export const ESTABLISHMENT_CATEGORY: Record<EstablishmentType, "Restaurants" | "Cafés" | "Bars"> = {
  restaurant: "Restaurants",
  cafe_coffee: "Cafés",
  bar_pub: "Bars",
  dessert_bakery: "Cafés",
  quick_bites: "Restaurants",
  lounge_hookah: "Bars",
  tea_house: "Cafés",
};

export const CATALOG_CUISINES = [
  "azerbaijani",
  "turkish",
  "georgian",
  "uzbek",
  "russian",
  "ukrainian",
  "european",
  "french",
  "italian",
  "pizza",
  "spanish",
  "greek",
  "mediterranean",
  "middle_eastern",
  "lebanese",
  "persian",
  "indian",
  "pakistani",
  "chinese",
  "japanese",
  "sushi",
  "korean",
  "thai",
  "vietnamese",
  "asian",
  "american",
  "burger",
  "steakhouse",
  "barbecue_kebab",
  "seafood",
  "breakfast_brunch",
  "cafe_food",
  "dessert",
  "bakery_pastry",
  "vegetarian_vegan",
  "healthy",
  "international",
] as const;
export type CatalogCuisine = (typeof CATALOG_CUISINES)[number];

export const MEALS = ["breakfast", "brunch", "lunch", "dinner", "late_night"] as const;
export type Meal = (typeof MEALS)[number];

/** What the place is good FOR – from real reviews (LLM profile) and Google booleans. */
export const GOOD_FOR = [
  "date_romantic",
  "celebration",
  "family_kids",
  "friends_groups",
  "business",
  "solo_work",
  "tourists",
  "quick_meal",
  "big_groups",
] as const;
export type GoodFor = (typeof GOOD_FOR)[number];

/** Concrete, checkable features. "kabinet" lives here as private_room. */
export const FEATURES = [
  "private_room",
  "karaoke",
  "live_music",
  "dj_nightlife",
  "hookah",
  "outdoor_terrace",
  "garden",
  "rooftop",
  "sea_view",
  "city_view",
  "kids_area",
  "kids_menu",
  "parking",
  "wifi",
  "reservations",
  "serves_alcohol",
  "no_alcohol",
  "halal",
  "vegetarian_options",
  "vegan_options",
  "wheelchair",
  "pet_friendly",
  "late_open",
  "open_24h",
  "delivery",
  "takeaway",
  "card_payment",
  "smoking_area",
  "non_smoking",
  "tv_sports",
  "board_games",
  "wine_list",
  "cocktails",
  "specialty_coffee",
  "breakfast_all_day",
] as const;
export type Feature = (typeof FEATURES)[number];

export const PRICE_LEVELS = [1, 2, 3, 4] as const;

type Label = [tr: string, en: string];

export const ESTABLISHMENT_LABEL: Record<EstablishmentType, Label> = {
  restaurant: ["restoran", "restaurant"],
  cafe_coffee: ["kafe / kahve", "café / coffee"],
  bar_pub: ["bar / pub", "bar / pub"],
  dessert_bakery: ["tatlıcı / fırın", "dessert / bakery"],
  quick_bites: ["hızlı yemek", "quick bites"],
  lounge_hookah: ["lounge / nargile", "lounge / hookah"],
  tea_house: ["çay evi", "tea house"],
};

export const CUISINE_LABEL: Record<CatalogCuisine, Label> = {
  azerbaijani: ["Azerbaycan mutfağı", "Azerbaijani"],
  turkish: ["Türk mutfağı", "Turkish"],
  georgian: ["Gürcü mutfağı", "Georgian"],
  uzbek: ["Özbek mutfağı", "Uzbek"],
  russian: ["Rus mutfağı", "Russian"],
  ukrainian: ["Ukrayna mutfağı", "Ukrainian"],
  european: ["Avrupa mutfağı", "European"],
  french: ["Fransız mutfağı", "French"],
  italian: ["İtalyan mutfağı", "Italian"],
  pizza: ["pizza", "pizza"],
  spanish: ["İspanyol mutfağı", "Spanish"],
  greek: ["Yunan mutfağı", "Greek"],
  mediterranean: ["Akdeniz mutfağı", "Mediterranean"],
  middle_eastern: ["Orta Doğu mutfağı", "Middle Eastern"],
  lebanese: ["Lübnan mutfağı", "Lebanese"],
  persian: ["İran mutfağı", "Persian"],
  indian: ["Hint mutfağı", "Indian"],
  pakistani: ["Pakistan mutfağı", "Pakistani"],
  chinese: ["Çin mutfağı", "Chinese"],
  japanese: ["Japon mutfağı", "Japanese"],
  sushi: ["sushi", "sushi"],
  korean: ["Kore mutfağı", "Korean"],
  thai: ["Tayland mutfağı", "Thai"],
  vietnamese: ["Vietnam mutfağı", "Vietnamese"],
  asian: ["Asya mutfağı", "Asian"],
  american: ["Amerikan mutfağı", "American"],
  burger: ["burger", "burgers"],
  steakhouse: ["et / steak", "steakhouse"],
  barbecue_kebab: ["mangal / kebap", "barbecue / kebab"],
  seafood: ["balık / deniz ürünleri", "seafood"],
  breakfast_brunch: ["kahvaltı / brunch", "breakfast / brunch"],
  cafe_food: ["kafe yemekleri", "café food"],
  dessert: ["tatlı", "dessert"],
  bakery_pastry: ["fırın / pastane", "bakery / pastry"],
  vegetarian_vegan: ["vejetaryen / vegan", "vegetarian / vegan"],
  healthy: ["sağlıklı", "healthy"],
  international: ["dünya mutfağı", "international"],
};

export const MEAL_LABEL: Record<Meal, Label> = {
  breakfast: ["kahvaltı", "breakfast"],
  brunch: ["brunch", "brunch"],
  lunch: ["öğle yemeği", "lunch"],
  dinner: ["akşam yemeği", "dinner"],
  late_night: ["gece geç saat", "late night"],
};

export const GOOD_FOR_LABEL: Record<GoodFor, Label> = {
  date_romantic: ["randevu / romantik", "date / romantic"],
  celebration: ["kutlama (yıl dönümü, doğum günü)", "celebration (anniversary, birthday)"],
  family_kids: ["aile / çocuklu", "family / kids"],
  friends_groups: ["arkadaş grubu", "friends"],
  business: ["iş yemeği", "business"],
  solo_work: ["tek başına / çalışma", "solo / work"],
  tourists: ["turistler", "tourists"],
  quick_meal: ["hızlı yemek", "quick meal"],
  big_groups: ["kalabalık grup", "big groups"],
};

export const FEATURE_LABEL: Record<Feature, Label> = {
  private_room: ["kabinet / özel oda", "private room"],
  karaoke: ["karaoke", "karaoke"],
  live_music: ["canlı müzik", "live music"],
  dj_nightlife: ["DJ / gece hayatı", "DJ / nightlife"],
  hookah: ["nargile", "hookah"],
  outdoor_terrace: ["teras / açık alan", "terrace / outdoor"],
  garden: ["bahçe", "garden"],
  rooftop: ["çatı katı", "rooftop"],
  sea_view: ["deniz manzarası", "sea view"],
  city_view: ["şehir manzarası", "city view"],
  kids_area: ["çocuk alanı", "kids area"],
  kids_menu: ["çocuk menüsü", "kids menu"],
  parking: ["otopark", "parking"],
  wifi: ["wifi", "wifi"],
  reservations: ["rezervasyon", "reservations"],
  serves_alcohol: ["alkol servisi", "serves alcohol"],
  no_alcohol: ["alkolsüz", "no alcohol"],
  halal: ["helal", "halal"],
  vegetarian_options: ["vejetaryen seçenek", "vegetarian options"],
  vegan_options: ["vegan seçenek", "vegan options"],
  wheelchair: ["tekerlekli sandalye erişimi", "wheelchair accessible"],
  pet_friendly: ["evcil hayvan dostu", "pet friendly"],
  late_open: ["gece geç saate açık", "open late"],
  open_24h: ["24 saat açık", "open 24h"],
  delivery: ["paket servis", "delivery"],
  takeaway: ["al götür", "takeaway"],
  card_payment: ["kartla ödeme", "card payment"],
  smoking_area: ["sigara alanı", "smoking area"],
  non_smoking: ["sigarasız", "non-smoking"],
  tv_sports: ["maç yayını", "sports on TV"],
  board_games: ["masa oyunları", "board games"],
  wine_list: ["şarap listesi", "wine list"],
  cocktails: ["kokteyl", "cocktails"],
  specialty_coffee: ["nitelikli kahve", "specialty coffee"],
  breakfast_all_day: ["tüm gün kahvaltı", "all-day breakfast"],
};

// ---------------------------------------------------------------------------
// Source vocabularies → ours. Used by scripts/catalog/* when building venues.

/** Google Places (New) `types` / `primaryType` → establishment type + cuisine. */
export const GOOGLE_TYPE_MAP: Record<
  string,
  { type?: EstablishmentType; cuisine?: CatalogCuisine }
> = {
  restaurant: { type: "restaurant" },
  fine_dining_restaurant: { type: "restaurant" },
  cafe: { type: "cafe_coffee" },
  coffee_shop: { type: "cafe_coffee", cuisine: "cafe_food" },
  tea_house: { type: "tea_house" },
  bar: { type: "bar_pub" },
  pub: { type: "bar_pub" },
  wine_bar: { type: "bar_pub" },
  bar_and_grill: { type: "bar_pub" },
  night_club: { type: "bar_pub" },
  karaoke: { type: "bar_pub" },
  hookah_bar: { type: "lounge_hookah" },
  bakery: { type: "dessert_bakery", cuisine: "bakery_pastry" },
  dessert_shop: { type: "dessert_bakery", cuisine: "dessert" },
  dessert_restaurant: { type: "dessert_bakery", cuisine: "dessert" },
  ice_cream_shop: { type: "dessert_bakery", cuisine: "dessert" },
  confectionery: { type: "dessert_bakery", cuisine: "dessert" },
  donut_shop: { type: "dessert_bakery", cuisine: "bakery_pastry" },
  fast_food_restaurant: { type: "quick_bites" },
  sandwich_shop: { type: "quick_bites" },
  hamburger_restaurant: { type: "quick_bites", cuisine: "burger" },
  pizza_restaurant: { cuisine: "pizza" },
  italian_restaurant: { cuisine: "italian" },
  french_restaurant: { cuisine: "french" },
  spanish_restaurant: { cuisine: "spanish" },
  greek_restaurant: { cuisine: "greek" },
  mediterranean_restaurant: { cuisine: "mediterranean" },
  middle_eastern_restaurant: { cuisine: "middle_eastern" },
  lebanese_restaurant: { cuisine: "lebanese" },
  turkish_restaurant: { cuisine: "turkish" },
  afghani_restaurant: { cuisine: "middle_eastern" },
  indian_restaurant: { cuisine: "indian" },
  chinese_restaurant: { cuisine: "chinese" },
  japanese_restaurant: { cuisine: "japanese" },
  sushi_restaurant: { cuisine: "sushi" },
  ramen_restaurant: { cuisine: "japanese" },
  korean_restaurant: { cuisine: "korean" },
  thai_restaurant: { cuisine: "thai" },
  vietnamese_restaurant: { cuisine: "vietnamese" },
  asian_restaurant: { cuisine: "asian" },
  american_restaurant: { cuisine: "american" },
  steak_house: { cuisine: "steakhouse" },
  barbecue_restaurant: { cuisine: "barbecue_kebab" },
  seafood_restaurant: { cuisine: "seafood" },
  breakfast_restaurant: { cuisine: "breakfast_brunch" },
  brunch_restaurant: { cuisine: "breakfast_brunch" },
  vegetarian_restaurant: { cuisine: "vegetarian_vegan" },
  vegan_restaurant: { cuisine: "vegetarian_vegan" },
};

/** Google Places (New) boolean fields → our features. */
export const GOOGLE_FEATURE_MAP: Record<string, Feature> = {
  outdoorSeating: "outdoor_terrace",
  liveMusic: "live_music",
  reservable: "reservations",
  servesWine: "wine_list",
  servesCocktails: "cocktails",
  servesBeer: "serves_alcohol",
  servesVegetarianFood: "vegetarian_options",
  goodForChildren: "kids_area",
  menuForChildren: "kids_menu",
  allowsDogs: "pet_friendly",
  delivery: "delivery",
  takeout: "takeaway",
  goodForWatchingSports: "tv_sports",
};

/** Tripadvisor `features` strings (lowercased) → our features. */
export const TRIPADVISOR_FEATURE_MAP: Record<string, Feature> = {
  "private dining": "private_room",
  "live music": "live_music",
  "outdoor seating": "outdoor_terrace",
  seating: "outdoor_terrace",
  reservations: "reservations",
  "serves alcohol": "serves_alcohol",
  "full bar": "serves_alcohol",
  "wine and beer": "serves_alcohol",
  "wheelchair accessible": "wheelchair",
  "free wifi": "wifi",
  "parking available": "parking",
  "street parking": "parking",
  "validated parking": "parking",
  "accepts credit cards": "card_payment",
  delivery: "delivery",
  takeout: "takeaway",
  "non-smoking restaurants": "non_smoking",
  television: "tv_sports",
  "highchairs available": "kids_menu",
  "dog friendly": "pet_friendly",
  waterfront: "sea_view",
  beach: "sea_view",
  "digital payments": "card_payment",
};

/** Words in a venue's NAME (whole word, lowercase) that reveal its type or a feature. */
export const NAME_HINTS: Array<{ words: string[]; type?: EstablishmentType; feature?: Feature }> = [
  { words: ["karaoke"], feature: "karaoke" },
  {
    words: ["nargile", "qelyan", "qəlyan", "hookah", "shisha"],
    type: "lounge_hookah",
    feature: "hookah",
  },
  { words: ["lounge"], type: "lounge_hookah" },
  { words: ["pub", "bar", "beer", "pivo", "bira"], type: "bar_pub" },
  { words: ["çay evi", "chay evi", "çayxana", "chaykhana"], type: "tea_house" },
  { words: ["rooftop", "roof"], feature: "rooftop" },
  { words: ["terrace", "teras", "terrasa"], feature: "outdoor_terrace" },
  { words: ["garden", "bağ", "bagh", "bahçe"], feature: "garden" },
  { words: ["sahil", "seaside", "beach", "dəniz", "deniz"], feature: "sea_view" },
];
