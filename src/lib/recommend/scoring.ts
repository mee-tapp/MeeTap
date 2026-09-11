import type { AmbianceTag, Category, Intent, Purpose } from "./intent.ts";

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
  outdoor_seating: boolean | null;
  indoor_seating: boolean | null;
  wifi: string | null;
  rating_avg: number | null;
  rating_count: number;
  /** open-data confidence 0..1 (Overture); used as a quality prior when unrated */
  confidence?: number | null;
  /** null = unknown (no opening hours data) */
  open_now: boolean | null;
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

/** Cuisine aliases: intent key → values that may appear in OSM/Overture data. */
const CUISINE_ALIASES: Record<string, string[]> = {
  kebab: ["kebab", "kebap", "turkish", "ocakbasi", "doner", "durum", "grill"],
  home_cooking: ["home_cooking", "turkish", "regional", "local", "lokanta", "esnaf"],
  turkish: ["turkish", "regional", "kebab", "meyhane", "local"],
  meyhane: ["meyhane", "turkish", "meze"],
  seafood: ["seafood", "fish", "fish_and_chips"],
  steak: ["steak_house", "steak", "grill", "barbecue"],
  burger: ["burger", "american", "fast_food"],
  pizza: ["pizza", "italian"],
  italian: ["italian", "pasta"], // a pizza chain is not what "Italian" means
  sushi: ["sushi", "japanese"],
  japanese: ["japanese", "sushi", "ramen"],
  chinese: ["chinese"],
  asian: ["asian", "thai", "korean", "vietnamese", "chinese", "japanese"],
  indian: ["indian"],
  mexican: ["mexican"],
  breakfast: ["breakfast", "brunch"],
  coffee: ["coffee_shop", "coffee", "cafe"],
  tea: ["tea", "cay"],
  dessert: ["dessert", "cake", "ice_cream", "pastry", "waffle", "kunefe", "baklava"],
  bakery: ["bakery", "pastry", "borek"],
  vegetarian: ["vegetarian", "vegan"],
  vegan: ["vegan"],
  azerbaijani: ["azerbaijani", "regional", "local", "national"],
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

function t(locale: "tr" | "en", tr: string, en: string): string {
  return locale === "tr" ? tr : en;
}

function scoreCuisine(intent: Intent, c: Candidate, locale: "tr" | "en"): ComponentResult {
  if (intent.cuisines.length === 0) return { score: null };
  if (c.cuisines.length === 0) {
    return { score: 0.35 }; // unknown – don't punish hard, real data is sparse
  }
  const have = c.cuisines.map((x) => x.toLowerCase());
  // Exact key first ("home_cooking" venue for a home_cooking request), then
  // aliases ("turkish" also satisfies kebab) – so the explanation names the
  // cuisine the venue actually has.
  const exact = intent.cuisines.find((want) => have.includes(want));
  const want =
    exact ?? intent.cuisines.find((w) => have.some((h) => (CUISINE_ALIASES[w] ?? [w]).includes(h)));
  if (want) {
    return {
      score: 1,
      reason: t(locale, `${labelCuisine(want, "tr")} var`, `serves ${labelCuisine(want, "en")}`),
    };
  }
  // Known cuisine, and it's something else → hard mismatch.
  return { score: 0, exclude: true };
}

function labelCuisine(key: string, locale: "tr" | "en"): string {
  const L: Record<string, [string, string]> = {
    kebab: ["kebap", "kebab"],
    home_cooking: ["ev yemekleri", "home-style food"],
    turkish: ["Türk mutfağı", "Turkish food"],
    meyhane: ["meyhane", "meyhane"],
    seafood: ["balık", "seafood"],
    steak: ["et", "steak"],
    burger: ["burger", "burgers"],
    pizza: ["pizza", "pizza"],
    italian: ["İtalyan", "Italian"],
    sushi: ["sushi", "sushi"],
    japanese: ["Japon", "Japanese"],
    chinese: ["Çin", "Chinese"],
    asian: ["Asya", "Asian"],
    indian: ["Hint", "Indian"],
    mexican: ["Meksika", "Mexican"],
    breakfast: ["kahvaltı", "breakfast"],
    coffee: ["kahve", "coffee"],
    tea: ["çay", "tea"],
    dessert: ["tatlı", "dessert"],
    bakery: ["fırın", "bakery"],
    vegetarian: ["vejetaryen", "vegetarian"],
    vegan: ["vegan", "vegan"],
    azerbaijani: ["Azerbaycan mutfağı", "Azerbaijani food"],
    georgian: ["Gürcü", "Georgian"],
    international: ["dünya mutfağı", "international"],
  };
  const pair = L[key];
  return pair ? (locale === "tr" ? pair[0] : pair[1]) : key;
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
  const reason =
    minutes <= limit * 0.5
      ? t(
          locale,
          `${minutes} dk ${walkLabel}, çok yakın`,
          `${minutes} min ${walkLabel}, very close`,
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
  const score = hits.length === 0 ? 0.15 : Math.min(1, 0.5 + hits.length * 0.25);
  const purposeLabel: Record<Purpose, [string, string]> = {
    date: ["randevu için", "for a date"],
    friends: ["arkadaş buluşması için", "for meeting friends"],
    study: ["çalışmak için", "for studying"],
    alone: ["tek başına için", "for time alone"],
    family: ["aile için", "for family"],
    business: ["iş görüşmesi için", "for business"],
  };
  const pl = locale === "tr" ? purposeLabel[intent.purpose][0] : purposeLabel[intent.purpose][1];
  const reason = score >= 0.75 ? t(locale, `${pl} iyi`, `good ${pl}`) : undefined;
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
): ScoredVenue | null {
  const locale = ctx.locale ?? "en";

  // Hard filters
  if (intent.categories.length && !intent.categories.includes(c.category)) return null;
  if (c.open_now === false) return null;

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
  };
  if (Object.values(results).some((r) => r.exclude)) return null;

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
): ScoredVenue[] {
  return candidates
    .map((c) => scoreCandidate(intent, c, ctx, weights))
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
