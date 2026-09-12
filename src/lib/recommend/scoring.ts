import type { AmbianceTag, Category, Intent, Purpose } from "./intent.ts";
import type { VenueIntelligence } from "./venue-intelligence.ts";

/**
 * Deterministic multi-factor scorer.
 *
 * Input: a structured Intent + real candidate venues + context (location, weather, time).
 * Output: ranked venues, each with a per-factor breakdown and human-readable
 * pros/cons. The LLM never ranks; it only ever rephrases these explanations.
 */

// --- inputs -----------------------------------------------------------------

export type Candidate = {
  id: string;
  name: string;
  category: Category;
  cuisines: string[];
  lat: number;
  lon: number;
  /** 1 cheap … 4 expensive, null = unknown */
  price_band: number | null;
  /** per-person estimate in local currency, null = unknown */
  price_estimate: number | null;
  /** where the estimate came from – "band" means a rough guess from the price band */
  price_estimate_source?: "band" | "source" | "user" | null;
  ambiance_tags: string[];
  /** where the ambiance tags came from: 'inferred' (LLM guess from name/category),
   * 'source' (open data), 'user' / 'reviewed' (people) – wording depends on it */
  ambiance_source?: string | null;
  /** open-data type, e.g. "uzbek_restaurant" */
  raw_type?: string | null;
  outdoor_seating: boolean | null;
  indoor_seating: boolean | null;
  wifi: string | null;
  rating_avg: number | null;
  rating_count: number;
  /** open-data confidence 0..1 (Overture); used as a quality prior when unrated */
  confidence?: number | null;
  /** null = unknown (no opening hours data) */
  open_now: boolean | null;
  /** Real, validated review-derived evidence (see venue-intelligence.ts) –
   * absent for the vast majority of venues today. Missing is NEUTRAL, never
   * a penalty (see scoreVenueIntelligence). */
  intelligence?: VenueIntelligence | null;
};

export type Weather = {
  is_raining: boolean;
  temp_c: number | null;
  is_windy?: boolean;
};

export type ScoringContext = {
  user_lat: number;
  user_lon: number;
  weather: Weather | null;
  now?: Date;
  locale?: "tr" | "en";
};

// --- weights (single source of truth; tune here) ------------------------------

export const DEFAULT_WEIGHTS = {
  // An explicitly requested cuisine is the strongest signal: a romantic place
  // that isn't Italian must not outrank an Italian place when Italian was asked.
  cuisine: 2.5,
  ambiance: 1.5,
  budget: 1.3,
  distance: 1.1,
  purpose: 1.0,
  weather: 0.8,
  quality: 0.8,
  needs: 0.6,
  // Only ever non-null when (a) the feature flag is on, (b) the user actually
  // asked for something subjective, and (c) the venue has real review
  // evidence for it – see scoreVenueIntelligence. Otherwise this weight never
  // enters the weighted average, so existing behavior is unchanged.
  review_intelligence: 1.4,
} as const;
export type Weights = { [K in keyof typeof DEFAULT_WEIGHTS]: number };

/** What each purpose "wants" from a venue when the user didn't spell it out. */
export const PURPOSE_TAGS: Record<Purpose, AmbianceTag[]> = {
  date: ["romantic", "quiet", "cozy", "view", "seaside"],
  friends: ["lively", "group_friendly"],
  study: ["work_friendly", "quiet"],
  alone: ["cozy", "quiet"],
  family: ["family_friendly", "group_friendly"],
  business: ["quiet", "work_friendly"],
};

/** Same idea, but against Venue Intelligence's good_for tags instead of the
 * venue's own ambiance_tags – real review evidence of what a place is for. */
const PURPOSE_TO_GOOD_FOR: Record<Purpose, string[]> = {
  date: ["date", "romantic", "special_occasion"],
  friends: ["friends", "group", "conversation"],
  study: ["work_study"],
  alone: ["solo"],
  family: ["family"],
  business: ["business"],
};

/**
 * Cuisine aliases: intent key → data values that GENUINELY mean the same thing.
 * Deliberately no generic words ("regional", "local", "turkish" for kebab…):
 * a Black Sea restaurant tagged "regional" must never be described as serving
 * Azerbaijani food. Unknown keys fall back to the key itself + name keywords.
 */
const CUISINE_ALIASES: Record<string, string[]> = {
  kebab: ["kebab", "kebap", "ocakbasi", "doner", "durum", "grill"],
  home_cooking: ["home_cooking", "lokanta", "esnaf"],
  turkish: ["turkish", "kebab", "meyhane", "lokanta"],
  meyhane: ["meyhane", "meze"],
  seafood: ["seafood", "fish", "fish_and_chips"],
  steak: ["steak_house", "steak", "barbecue"],
  burger: ["burger", "fast_food"],
  pizza: ["pizza"],
  italian: ["italian", "pasta"],
  sushi: ["sushi"],
  japanese: ["japanese", "sushi", "ramen"],
  chinese: ["chinese"],
  asian: ["asian", "thai", "korean", "vietnamese", "chinese", "japanese", "uzbek"],
  indian: ["indian"],
  mexican: ["mexican"],
  breakfast: ["breakfast", "brunch"],
  coffee: ["coffee_shop", "coffee", "cafe"],
  tea: ["tea", "cay"],
  dessert: ["dessert", "cake", "ice_cream", "pastry", "waffle", "kunefe", "baklava"],
  bakery: ["bakery", "pastry", "borek"],
  vegetarian: ["vegetarian", "vegan"],
  vegan: ["vegan"],
  azerbaijani: ["azerbaijani"],
  georgian: ["georgian"],
  international: ["international"],
};

// --- component scores ---------------------------------------------------------

export type ComponentKey = keyof Weights;
export type ComponentResult = {
  /** 0..1, or null when the factor doesn't apply (weight dropped) */
  score: number | null;
  /** short reason, positive or negative */
  reason?: string;
  /** true means the candidate must be excluded */
  exclude?: boolean;
};

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const WALK_M_PER_MIN = 80;
/** Rough urban driving pace (~30 km/h) for the "by car" hint on far results. */
const CAR_M_PER_MIN = 500;

function t(locale: "tr" | "en", tr: string, en: string): string {
  return locale === "tr" ? tr : en;
}

/** "özbek" matches "Özbek Sofrası" and "Özbekler"; "pilav" must not match "pilavcısı"'s
 * cousins by accident, so a keyword has to start a word in the name. */
function wordInName(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}`, "iu").test(name);
}

function scoreCuisine(intent: Intent, c: Candidate, locale: "tr" | "en"): ComponentResult {
  if (intent.cuisines.length === 0) return { score: null };
  const have = c.cuisines.map((x) => x.toLowerCase());
  const rawType = (c.raw_type ?? "").toLowerCase();
  const name = c.name.toLowerCase();

  // Evidence per requested cuisine, strongest first:
  //   1. the data says so (exact key, genuine alias, or the open-data type
  //      itself – "uzbek_restaurant" satisfies "uzbek");
  //   2. the venue's own NAME says so ("Özbek Sofrası");
  //   3. nothing – the venue may still serve it, we just can't tell.
  // With several cuisines asked for ("Azerbaijani food and good desserts"),
  // a place matching more of them ranks higher, and the explanation says
  // which part we could confirm and which we could not.
  const byData: string[] = [];
  const byName: string[] = [];
  const missing: string[] = [];
  const keywords = intent.cuisine_keywords.filter((k) => k.length >= 3);
  let nameUsed = false;
  for (const want of intent.cuisines) {
    const aliases = CUISINE_ALIASES[want] ?? [want];
    const inData =
      have.some((h) => aliases.includes(h)) || rawType === want || rawType.startsWith(`${want}_`);
    if (inData) {
      byData.push(want);
      continue;
    }
    // Name keywords are not attributed to a specific cuisine; they describe
    // the main one, so the first unconfirmed cuisine gets the credit once.
    if (!nameUsed && keywords.some((k) => wordInName(name, k))) {
      byName.push(want);
      nameUsed = true;
      continue;
    }
    missing.push(want);
  }

  // The first cuisine is the main one ("an Azerbaijani place with desserts"):
  // it weighs 1, every further one 0.5, so a dessert-only café cannot tie
  // with a real Azerbaijani restaurant that just lacks dessert data.
  const weight = (key: string) => (key === intent.cuisines[0] ? 1 : 0.5);
  const totalWeight = intent.cuisines.reduce((sum, k) => sum + weight(k), 0);
  const matched =
    byData.reduce((sum, k) => sum + weight(k), 0) +
    0.95 * byName.reduce((sum, k) => sum + weight(k), 0);
  if (matched === 0) {
    if (c.cuisines.length === 0) {
      return { score: 0.35 }; // unknown – don't punish hard, real data is sparse
    }
    // Known cuisine, and it's something else. Only a hard exclude when the parse
    // itself is confident – an uncertain read of the sentence should downrank,
    // not silently drop, a candidate that might still be right.
    if (intent.confidence >= 0.5) return { score: 0, exclude: true };
    return { score: 0.15, reason: t(locale, "mutfak belirsiz", "cuisine uncertain") };
  }

  // One cuisine confirmed by data = 1 (as before); a partial match on a
  // multi-cuisine wish lands at 0.6–1 so it still counts as "serves it".
  const score = intent.cuisines.length === 1 ? matched : 0.6 + 0.4 * (matched / totalWeight);
  const labels = (keys: string[]) => keys.map((k) => labelCuisine(k, locale)).join(", ");
  const parts: string[] = [];
  if (byData.length) parts.push(t(locale, `${labels(byData)} var`, `serves ${labels(byData)}`));
  if (byName.length)
    parts.push(t(locale, `${labels(byName)} (adına göre)`, `${labels(byName)} (by name)`));
  let reason = parts.join(", ");
  if (missing.length)
    reason += t(locale, ` (${labels(missing)} bilgisi yok)`, ` (no ${labels(missing)} info)`);
  return { score, reason };
}

export function labelCuisine(key: string, locale: "tr" | "en"): string {
  const L: Record<string, [string, string]> = {
    kebab: ["kebap", "kebab"],
    home_cooking: ["ev yemekleri", "home-style food"],
    turkish: ["Türk mutfağı", "Turkish food"],
    meyhane: ["meyhane", "meyhane"],
    seafood: ["balık", "seafood"],
    steak: ["et/steak", "steak"],
    burger: ["burger", "burgers"],
    pizza: ["pizza", "pizza"],
    italian: ["İtalyan mutfağı", "Italian food"],
    sushi: ["sushi", "sushi"],
    japanese: ["Japon mutfağı", "Japanese food"],
    chinese: ["Çin mutfağı", "Chinese food"],
    asian: ["Asya mutfağı", "Asian food"],
    indian: ["Hint mutfağı", "Indian food"],
    mexican: ["Meksika mutfağı", "Mexican food"],
    breakfast: ["kahvaltı", "breakfast"],
    coffee: ["kahve", "coffee"],
    tea: ["çay", "tea"],
    dessert: ["tatlı", "dessert"],
    bakery: ["fırın", "bakery"],
    vegetarian: ["vejetaryen", "vegetarian"],
    vegan: ["vegan", "vegan"],
    azerbaijani: ["Azerbaycan mutfağı", "Azerbaijani food"],
    georgian: ["Gürcü mutfağı", "Georgian food"],
    international: ["dünya mutfağı", "international"],
  };
  const extra: Record<string, [string, string]> = {
    uzbek: ["Özbek mutfağı", "Uzbek food"],
    lebanese: ["Lübnan mutfağı", "Lebanese food"],
    syrian: ["Suriye mutfağı", "Syrian food"],
    persian: ["İran mutfağı", "Persian food"],
    russian: ["Rus mutfağı", "Russian food"],
    korean: ["Kore mutfağı", "Korean food"],
    thai: ["Tayland mutfağı", "Thai food"],
    greek: ["Yunan mutfağı", "Greek food"],
    arabic: ["Arap mutfağı", "Arabic food"],
    french: ["Fransız mutfağı", "French food"],
    spanish: ["İspanyol mutfağı", "Spanish food"],
    vietnamese: ["Vietnam mutfağı", "Vietnamese food"],
  };
  const pair = L[key] ?? extra[key];
  if (pair) return locale === "tr" ? pair[0] : pair[1];
  const words = key.replace(/_/g, " ");
  const pretty = words.charAt(0).toUpperCase() + words.slice(1);
  return locale === "tr" ? `${pretty} mutfağı` : `${pretty} food`;
}

function scoreAmbiance(intent: Intent, c: Candidate, locale: "tr" | "en"): ComponentResult {
  const { all_of, any_of, avoid } = intent.ambiance;
  if (all_of.length + any_of.length + avoid.length === 0) return { score: null };
  const have = new Set(c.ambiance_tags);
  if (have.size === 0) return { score: 0.4 }; // untagged venue – neutral-ish

  let total = 0;
  let got = 0;
  const hits: string[] = [];
  for (const tag of all_of) {
    total += 1;
    if (have.has(tag)) {
      got += 1;
      hits.push(tag);
    }
  }
  for (const group of any_of) {
    total += 1;
    const hit = group.find((tag) => have.has(tag));
    if (hit) {
      got += 1;
      hits.push(hit);
    }
  }
  let score = total ? got / total : 1;
  const clashes = avoid.filter((tag) => have.has(tag));
  score = Math.max(0, score - 0.5 * clashes.length);

  let reason: string | undefined;
  if (hits.length && score >= 0.99)
    reason = hits.map((h) => labelTag(h as AmbianceTag, locale)).join(", ");
  else if (clashes.length)
    reason = t(
      locale,
      `${clashes.map((h) => labelTag(h, locale)).join(", ")} olabilir`,
      `may be ${clashes.map((h) => labelTag(h, locale)).join(", ")}`,
    );
  else if (score < 0.4)
    reason = t(locale, "istediğin ortama tam uymuyor", "atmosphere may not match");
  return { score, ...(reason ? { reason } : {}) };
}

export function labelTag(tag: AmbianceTag, locale: "tr" | "en"): string {
  const L: Record<AmbianceTag, [string, string]> = {
    quiet: ["sakin", "quiet"],
    lively: ["hareketli", "lively"],
    romantic: ["romantik", "romantic"],
    cozy: ["samimi", "cozy"],
    group_friendly: ["gruba uygun", "good for groups"],
    work_friendly: ["çalışmaya uygun", "good for working"],
    outdoor: ["açık hava", "outdoor seating"],
    indoor: ["kapalı alan", "indoor"],
    live_music: ["canlı müzik", "live music"],
    view: ["manzaralı", "great view"],
    seaside: ["deniz kenarı", "by the sea"],
    family_friendly: ["aile dostu", "family friendly"],
    trendy: ["popüler", "trendy"],
    late_night: ["gece açık", "open late"],
    breakfast: ["kahvaltı", "breakfast"],
    fine_dining: ["şık", "fine dining"],
    cheap_eats: ["uygun fiyatlı", "cheap eats"],
  };
  return locale === "tr" ? L[tag][0] : L[tag][1];
}

function scoreBudget(intent: Intent, c: Candidate, locale: "tr" | "en"): ComponentResult {
  const { max_per_person, level } = intent.budget;
  if (max_per_person == null && level == null) return { score: null };

  // A band-derived estimate is a guess: say so, and never let it sound certain.
  const est = c.price_estimate_source === "band" ? t(locale, " (tahmini)", " (estimated)") : "";

  if (max_per_person != null && c.price_estimate != null) {
    const ratio = c.price_estimate / max_per_person;
    if (ratio <= 0.8)
      return { score: 1, reason: t(locale, "bütçene uygun", "fits your budget") + est };
    if (ratio <= 1.0)
      return { score: 0.85, reason: t(locale, "bütçene uygun", "fits your budget") + est };
    if (ratio <= 1.25)
      return {
        score: 0.45,
        reason: t(locale, "bütçeni biraz aşabilir", "slightly over your budget") + est,
      };
    return { score: 0.1, reason: t(locale, "bütçenin üstünde", "over your budget") + est };
  }

  if (c.price_band == null) return { score: 0.5 };
  const wanted: Record<NonNullable<typeof level>, number[]> = {
    low: [1, 0.8, 0.3, 0],
    mid: [0.6, 1, 0.9, 0.3],
    high: [0.2, 0.5, 1, 1],
  };
  const lvl = level ?? (max_per_person != null ? "mid" : "mid");
  const score = wanted[lvl][c.price_band - 1] ?? 0.5;
  const reason =
    score >= 0.8
      ? t(locale, "bütçene uygun (tahmini)", "fits your budget (estimated)")
      : score <= 0.3
        ? t(locale, "bütçenin üstünde olabilir", "may exceed your budget")
        : undefined;
  return { score, ...(reason ? { reason } : {}) };
}

function scoreDistance(
  intent: Intent,
  c: Candidate,
  ctx: ScoringContext,
  locale: "tr" | "en",
): ComponentResult & { minutes: number } {
  const meters = haversineMeters(ctx.user_lat, ctx.user_lon, c.lat, c.lon);
  const speed =
    intent.transport === "car" ? 400 : intent.transport === "transit" ? 250 : WALK_M_PER_MIN;
  const minutes = Math.max(1, Math.round(meters / speed));
  const limit = intent.max_distance_min ?? (intent.transport === "car" ? 30 : 30);
  const score = Math.max(0, 1 - minutes / (limit * 1.5));
  const walkLabel =
    intent.transport === "car"
      ? t(locale, "araçla", "by car")
      : intent.transport === "transit"
        ? t(locale, "toplu taşımayla", "by transit")
        : t(locale, "yürüme", "walk");
  // Beyond twice the limit "a bit far" would be a lie: say it is far, and –
  // when the user did not mention a car – how long the drive roughly is.
  const carMinutes = Math.max(5, Math.round((meters * 1.3) / CAR_M_PER_MIN));
  const carHint =
    intent.transport == null || intent.transport === "walking"
      ? t(locale, ` (arabayla ~${carMinutes} dk)`, ` (~${carMinutes} min by car)`)
      : "";
  const reason =
    minutes <= limit * 0.5
      ? t(
          locale,
          `${minutes} dk ${walkLabel}, çok yakın`,
          `${minutes} min ${walkLabel}, very close`,
        )
      : minutes > limit * 2
        ? t(
            locale,
            `${minutes} dk ${walkLabel}, uzak${carHint}`,
            `${minutes} min ${walkLabel}, far${carHint}`,
          )
        : minutes > limit
          ? t(
              locale,
              `${minutes} dk ${walkLabel}, biraz uzak`,
              `${minutes} min ${walkLabel}, a bit far`,
            )
          : t(locale, `${minutes} dk ${walkLabel}`, `${minutes} min ${walkLabel}`);
  return { score, reason, minutes };
}

function scorePurpose(intent: Intent, c: Candidate, locale: "tr" | "en"): ComponentResult {
  if (!intent.purpose) return { score: null };
  const want = PURPOSE_TAGS[intent.purpose];
  if (c.ambiance_tags.length === 0) return { score: 0.4 };
  const have = new Set(c.ambiance_tags);
  const hits = want.filter((tag) => have.has(tag));
  // Tags guessed from the name/category are weaker evidence than tags people
  // confirmed: cap the score and say "looks good for" rather than "good for".
  const inferred = c.ambiance_source == null || c.ambiance_source === "inferred";
  const raw = hits.length === 0 ? 0.15 : Math.min(1, 0.5 + hits.length * 0.25);
  const score = inferred ? Math.min(raw, 0.8) : raw;
  const purposeLabel: Record<Purpose, [string, string]> = {
    date: ["randevu için", "for a date"],
    friends: ["arkadaş buluşması için", "for meeting friends"],
    study: ["çalışmak için", "for studying"],
    alone: ["tek başına için", "for time alone"],
    family: ["aile için", "for family"],
    business: ["iş görüşmesi için", "for business"],
  };
  const pl = locale === "tr" ? purposeLabel[intent.purpose][0] : purposeLabel[intent.purpose][1];
  const reason =
    score >= 0.75
      ? inferred
        ? t(locale, `${pl} uygun görünüyor`, `looks good ${pl}`)
        : t(locale, `${pl} iyi`, `good ${pl}`)
      : undefined;
  return { score, ...(reason ? { reason } : {}) };
}

function scoreWeather(
  intent: Intent,
  c: Candidate,
  ctx: ScoringContext,
  locale: "tr" | "en",
): ComponentResult {
  const w = ctx.weather;
  if (!w) return { score: null };
  const hasIndoor =
    c.indoor_seating === true || c.outdoor_seating !== true || c.ambiance_tags.includes("indoor");
  const hasOutdoor = c.outdoor_seating === true || c.ambiance_tags.includes("outdoor");
  const cold = w.temp_c != null && w.temp_c < 12;
  const nice = !w.is_raining && w.temp_c != null && w.temp_c >= 18 && w.temp_c <= 30;

  if (w.is_raining || cold) {
    if (hasIndoor)
      return {
        score: 1,
        reason: t(
          locale,
          w.is_raining ? "yağmurlu hava için uygun" : "soğuk hava için uygun",
          w.is_raining ? "good for rainy weather" : "good for cold weather",
        ),
      };
    return {
      score: 0.2,
      reason: t(locale, "sadece açık alan, havaya dikkat", "outdoor only, mind the weather"),
    };
  }
  if (nice && hasOutdoor)
    return {
      score: 1,
      reason: t(locale, "hava güzel, açık alanı var", "nice weather and it has outdoor seating"),
    };
  return { score: 0.7 };
}

function scoreQuality(c: Candidate, locale: "tr" | "en"): ComponentResult {
  if (c.rating_avg == null || c.rating_count === 0) {
    // No community ratings yet: lean on how confident the open data is that
    // this is a real, current venue (low-confidence records sink).
    if (c.confidence == null) return { score: 0.5 };
    return { score: 0.25 + 0.5 * Math.max(0, Math.min(1, c.confidence)) };
  }
  // Bayesian shrinkage towards a prior of 3.8 with 10 pseudo-ratings.
  const prior = 3.8;
  const k = 10;
  const adj = (prior * k + c.rating_avg * c.rating_count) / (k + c.rating_count);
  const score = Math.max(0, Math.min(1, (adj - 2.5) / 2.5));
  const reason =
    adj >= 4.4
      ? t(locale, "kullanıcılar çok beğenmiş", "highly rated by users")
      : adj <= 3.2
        ? t(locale, "puanı düşük", "low ratings")
        : undefined;
  return { score, ...(reason ? { reason } : {}) };
}

function scoreNeeds(intent: Intent, c: Candidate, locale: "tr" | "en"): ComponentResult {
  if (intent.needs.length === 0) return { score: null };
  let known = 0;
  let met = 0;
  for (const need of intent.needs) {
    if (need === "wifi" || need === "power_outlets") {
      if (c.wifi != null) {
        known += 1;
        if (c.wifi !== "no") met += 1;
      }
    }
  }
  if (known === 0) return { score: 0.5 };
  const score = met / known;
  return { score, ...(score === 1 ? { reason: t(locale, "wifi var", "has wifi") } : {}) };
}

// User-facing natural-language labels. Internal enum/tag names (food_quality,
// local_food, crowded, …) and raw confidence numbers must NEVER reach the UI –
// everything rendered to a user goes through one of these three maps.
const ASPECT_LABEL: Record<string, [string, string]> = {
  food_quality: ["yemek kalitesi", "food quality"],
  service: ["servis", "service"],
  atmosphere: ["atmosfer", "atmosphere"],
  quiet: ["sakinlik", "quietness"],
  romantic: ["romantiklik", "romantic feel"],
  value: ["fiyat/performans", "value for money"],
  cleanliness: ["temizlik", "cleanliness"],
  crowding: ["kalabalık", "crowding"],
  view: ["manzara", "view"],
  authenticity: ["otantiklik", "authenticity"],
  speed_of_service: ["servis hızı", "service speed"],
};
/** What the venue seems well-suited FOR, as a natural noun phrase ("X için uygun"). */
const GOOD_FOR_LABEL: Record<string, [string, string]> = {
  date: ["çiftler", "couples"],
  romantic: ["romantik buluşmalar", "romantic dates"],
  friends: ["arkadaş grupları", "groups of friends"],
  group: ["kalabalık gruplar", "larger groups"],
  conversation: ["sohbet ortamı arayanlar", "conversation"],
  family: ["aileler", "families"],
  business: ["iş yemekleri", "business meals"],
  work_study: ["çalışmak isteyenler", "working"],
  solo: ["tek başına gidenler", "solo visits"],
  special_occasion: ["özel günler", "special occasions"],
  local_food: ["yerel yemek deneyimi", "a local food experience"],
};
const CAUTION_LABEL: Record<string, [string, string]> = {
  loud: ["gürültülü olabiliyor", "can be loud"],
  crowded: ["kalabalık olabiliyor", "can be crowded"],
  slow_service: ["servis yavaş kalabiliyor", "service can be slow"],
  expensive_for_value: [
    "fiyatına göre beklentiyi karşılamayabiliyor",
    "may not feel worth the price",
  ],
  touristy: ["oldukça turistik", "quite touristy"],
  inconsistent_food: [
    "yemek kalitesi değişkenlik gösterebiliyor",
    "food quality can be inconsistent",
  ],
  inconsistent_service: ["servis değişkenlik gösterebiliyor", "service can be inconsistent"],
};
// Exported so the named-venue path (engine.ts) can use the exact same
// natural-language labels instead of a second copy of this vocabulary.
export function labelAspect(key: string, locale: "tr" | "en"): string {
  return ASPECT_LABEL[key]?.[locale === "tr" ? 0 : 1] ?? key;
}
export function labelGoodFor(key: string, locale: "tr" | "en"): string {
  return GOOD_FOR_LABEL[key]?.[locale === "tr" ? 0 : 1] ?? key;
}
export function labelCaution(key: string, locale: "tr" | "en"): string {
  return CAUTION_LABEL[key]?.[locale === "tr" ? 0 : 1] ?? key;
}

/**
 * Optional Venue Intelligence component (real review evidence only – never
 * fabricated from name/category). Gated three ways so it can never dominate
 * an objective query or penalize a venue Tripadvisor simply hasn't reached:
 *   1. VENUE_INTELLIGENCE_ENABLED must be on.
 *   2. The user must have actually asked for something subjective
 *      (review_priorities / review_avoid / a purpose with a good_for match) –
 *      "500m kahve" never touches this component at all.
 *   3. The venue must have real intelligence data with real confidence –
 *      missing data or zero matching evidence returns null (neutral), it
 *      never scores 0.
 */
function scoreVenueIntelligence(
  intent: Intent,
  c: Candidate,
  locale: "tr" | "en",
): ComponentResult {
  if (process.env["VENUE_INTELLIGENCE_ENABLED"] !== "true") return { score: null };
  const vi = c.intelligence;
  const purposeGoodFor = intent.purpose ? (PURPOSE_TO_GOOD_FOR[intent.purpose] ?? []) : [];
  const asked =
    intent.review_priorities.length > 0 ||
    intent.review_avoid.length > 0 ||
    purposeGoodFor.length > 0;
  if (!vi || !asked) return { score: null };

  // Additive, confidence-scaled deviation from neutral (0.5) – NOT a plain
  // average. Averaging would let a single low-confidence signal move the
  // score exactly as far as a high-confidence one (dividing by its own
  // confidence cancels it out); this must not happen, so each contribution's
  // pull is `(score - neutral) * confidence` and they accumulate.
  let delta = 0;
  let evidenceCount = 0;
  let confidenceSum = 0;
  const aspectHits: string[] = [];
  const goodForHits: string[] = [];
  const concerns: string[] = [];

  for (const key of intent.review_priorities) {
    const s = vi.aspects[key];
    if (!s) continue;
    delta += (s.score - 0.5) * s.confidence;
    evidenceCount += 1;
    confidenceSum += s.confidence;
    if (s.score >= 0.6 && s.confidence >= 0.3) aspectHits.push(labelAspect(key, locale));
  }
  for (const tag of purposeGoodFor) {
    const g = vi.good_for.find((x) => x.tag === tag);
    if (!g) continue;
    delta += (g.score - 0.5) * g.confidence;
    evidenceCount += 1;
    confidenceSum += g.confidence;
    if (g.score >= 0.6 && g.confidence >= 0.3) goodForHits.push(labelGoodFor(tag, locale));
  }
  for (const tag of intent.review_avoid) {
    const caution = vi.cautions.find((x) => x.tag === tag);
    if (!caution) continue;
    delta -= caution.score * caution.confidence;
    evidenceCount += 1;
    confidenceSum += caution.confidence;
    if (caution.score >= 0.5 && caution.confidence >= 0.3) concerns.push(labelCaution(tag, locale));
  }

  if (evidenceCount === 0) return { score: null }; // asked, but zero real evidence either way – stay neutral
  const score = Math.max(0, Math.min(1, 0.5 + delta));

  // Natural-language only past this point – no enum names, no confidence
  // decimals ever reach the reason string. A qualitative "limited reviews"
  // note replaces the raw number when the evidence backing this is thin.
  const avgConfidence = confidenceSum / evidenceCount;
  const limited = avgConfidence < 0.4;
  const sentences: string[] = [];
  if (aspectHits.length) {
    sentences.push(
      t(
        locale,
        `kullanıcı yorumlarında özellikle ${aspectHits.join(" ve ")} olumlu öne çıkıyor`,
        `user reviews particularly highlight ${aspectHits.join(" and ")}`,
      ),
    );
  }
  if (goodForHits.length) {
    sentences.push(
      t(
        locale,
        `${goodForHits.join(" ve ")} için uygun görünüyor`,
        `seems well suited for ${goodForHits.join(" and ")}`,
      ),
    );
  }
  if (concerns.length) {
    sentences.push(t(locale, `${concerns.join(", ")}`, `reviews note it ${concerns.join(", ")}`));
  }
  if (limited && sentences.length) {
    sentences.push(t(locale, "yorum verisi henüz sınırlı", "based on limited review data so far"));
  }
  const reason = sentences.length ? sentences.join(t(locale, "; ", "; ")) : undefined;
  return { score, ...(reason ? { reason } : {}) };
}

// --- ranking ------------------------------------------------------------------

export type ScoredVenue = {
  candidate: Candidate;
  score: number; // 0..1 weighted
  components: Partial<Record<ComponentKey, number | null>>;
  pros: string[];
  cons: string[];
  distance_min: number;
};

export function scoreCandidate(
  intent: Intent,
  c: Candidate,
  ctx: ScoringContext,
  weights: Weights = DEFAULT_WEIGHTS,
  /** Dev/debug only – called with the reason just before a hard exclude returns null. */
  onExclude?: (reason: "category" | "cuisine" | "open_now") => void,
): ScoredVenue | null {
  const locale = ctx.locale ?? "en";

  // Hard filters. Category only gates here when it was explicitly stated
  // ("restoran", "kafe" …) – a category merely inferred from a cuisine word
  // must not silently prune the whole candidate pool (Stage A recall).
  if (
    intent.categories.length &&
    intent.category_explicit &&
    !intent.categories.includes(c.category)
  ) {
    onExclude?.("category");
    return null;
  }
  if (c.open_now === false) {
    onExclude?.("open_now");
    return null;
  }

  const dist = scoreDistance(intent, c, ctx, locale);
  const results: Record<ComponentKey, ComponentResult> = {
    cuisine: scoreCuisine(intent, c, locale),
    ambiance: scoreAmbiance(intent, c, locale),
    budget: scoreBudget(intent, c, locale),
    distance: dist,
    purpose: scorePurpose(intent, c, locale),
    weather: scoreWeather(intent, c, ctx, locale),
    quality: scoreQuality(c, locale),
    needs: scoreNeeds(intent, c, locale),
    review_intelligence: scoreVenueIntelligence(intent, c, locale),
  };
  if (Object.values(results).some((r) => r.exclude)) {
    onExclude?.("cuisine"); // cuisine is the only component that sets exclude today
    return null;
  }

  let weighted = 0;
  let weightSum = 0;
  const components: ScoredVenue["components"] = {};
  const pros: string[] = [];
  const cons: string[] = [];

  for (const key of Object.keys(results) as ComponentKey[]) {
    const r = results[key];
    components[key] = r.score;
    if (r.score == null) continue;
    let w = weights[key];
    if (key === "weather" && intent.weather_sensitive) w *= 1.6;
    weighted += w * r.score;
    weightSum += w;
    if (r.reason) {
      if (r.score >= 0.75) pros.push(r.reason);
      else if (r.score <= 0.45) cons.push(r.reason);
    }
  }

  return {
    candidate: c,
    score: weightSum ? weighted / weightSum : 0,
    components,
    pros,
    cons,
    distance_min: dist.minutes,
  };
}

export function rankCandidates(
  intent: Intent,
  candidates: Candidate[],
  ctx: ScoringContext,
  weights: Weights = DEFAULT_WEIGHTS,
  onExclude?: (reason: "category" | "cuisine" | "open_now") => void,
): ScoredVenue[] {
  return candidates
    .map((c) => scoreCandidate(intent, c, ctx, weights, onExclude))
    .filter((s): s is ScoredVenue => s !== null)
    .sort((a, b) => b.score - a.score);
}

/** "Fits your budget · 8 min walk · quiet" – template explanation, no LLM. */
export function explain(s: ScoredVenue, locale: "tr" | "en" = "en"): string {
  const parts = [...s.pros];
  if (s.cons.length)
    parts.push(locale === "tr" ? `ama ${s.cons.join(", ")}` : `but ${s.cons.join(", ")}`);
  return parts.join(" · ");
}
