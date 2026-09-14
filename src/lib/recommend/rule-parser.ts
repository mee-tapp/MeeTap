import {
  emptyIntent,
  type AmbianceTag,
  type Category,
  type Cuisine,
  type Intent,
  type Need,
  type ParsedIntent,
  type Purpose,
} from "./intent.ts";
import type { AspectKey, CautionTag } from "./venue-intelligence.ts";
import type { Feature, Meal } from "../catalog/taxonomy.ts";

/**
 * Rule-based Turkish/English intent parser.
 *
 * Purpose: zero-cost fallback (and pre-filter) for the LLM parser. It has to
 * work when the LLM free tier is exhausted or unreachable. It is deliberately
 * conservative: it only fills fields it is sure about and reports the rest
 * in `unmapped` so the LLM can take over.
 */

// --- normalisation ---------------------------------------------------------

const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  I: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

/** Lowercase + strip Turkish diacritics so "Sakin" / "sakın" / "SAKIN" all match. */
export function normalizeTr(input: string): string {
  return input
    .replace(/[çğıöşüâîûÇĞİIÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- dictionaries (already normalised, longest phrase first when matching) ---

type Dict<T extends string> = Array<[phrases: string[], value: T]>;

const PURPOSE_DICT: Dict<Purpose> = [
  [
    [
      "sevgilim",
      "kiz arkadasim",
      "erkek arkadasim",
      "esimle",
      "esim ile",
      "randevu",
      "date",
      "flort",
      "ilk bulusma",
      "girlfriend",
      "boyfriend",
      "my wife",
      "my husband",
      "my partner",
      "date night",
      "anniversary",
      "yildonumu",
    ],
    "date",
  ],
  [
    [
      "arkadaslarimla",
      "arkadaslarim",
      "arkadasimla",
      "arkadas",
      "ekiple",
      "ekip",
      "grup",
      "kankalar",
      "friends",
      "with friends",
    ],
    "friends",
  ],
  [
    [
      "ders calis",
      "calismak",
      "calisacak",
      "odev",
      "laptop",
      "bilgisayar",
      "toplanti degil",
      "study",
      "work from",
      "to work",
      "work for",
      "get some work done",
      "remote",
    ],
    "study",
  ],
  [
    [
      "yalniz",
      "tek basima",
      "kendi basima",
      "tek gidecegim",
      "tek gidiyorum",
      "tek giderim",
      "yalniz gidecegim",
      "kendim gidecegim",
      "alone",
      "by myself",
      "solo",
      "on my own",
    ],
    "alone",
  ],
  [
    ["ailemle", "aile", "cocuklarla", "cocukla", "cocuklu", "annemle", "babamla", "family", "kids"],
    "family",
  ],
  [["is yemegi", "musteri", "toplanti", "is gorusmesi", "business", "meeting"], "business"],
];

const CUISINE_DICT: Dict<Cuisine> = [
  [["kebap", "kebab", "adana", "urfa", "doner", "durum", "iskender", "ocakbasi"], "kebab"],
  [
    [
      "ev yemekleri",
      "ev yemegi",
      "lokanta",
      "esnaf lokantasi",
      "sulu yemek",
      "tencere yemegi",
      "home cooking",
      "home-style",
    ],
    "home_cooking",
  ],
  [["turk mutfagi", "turk yemekleri", "geleneksel", "turkish"], "turkish"],
  [["meyhane", "raki", "meze", "fasil"], "meyhane"],
  [["balik", "deniz urunleri", "deniz mahsulleri", "midye", "seafood", "fish"], "seafood"],
  [["steak", "et restorani", "etci", "kasap", "biftek", "steakhouse"], "steak"],
  [["burger", "hamburger"], "burger"],
  [["pizza"], "pizza"],
  [["italyan", "makarna", "pasta ", "italian"], "italian"],
  [["sushi", "susi"], "sushi"],
  [["japon", "ramen", "japanese"], "japanese"],
  [["cin yemegi", "cin mutfagi", "chinese"], "chinese"],
  [["asya", "uzak dogu", "tayland", "thai", "kore", "korean", "vietnam", "asian"], "asian"],
  [["hint", "indian", "curry"], "indian"],
  [["meksika", "taco", "burrito", "mexican"], "mexican"],
  [["kahvalti", "serpme", "brunch", "breakfast"], "breakfast"],
  [["kahve", "coffee", "espresso", "latte", "filtre"], "coffee"],
  [["cay bahcesi", "cay icmek", "cay ", "tea"], "tea"],
  [["tatli", "pasta", "dondurma", "kunefe", "baklava", "dessert", "cake"], "dessert"],
  [["firin", "pastane", "borek", "simit", "bakery"], "bakery"],
  [["vejetaryen", "vegetarian"], "vegetarian"],
  [["vegan"], "vegan"],
  [["azerbaycan", "azeri", "azerbaijani", "milli yemek", "plov", "qutab"], "azerbaijani"],
  [["gurcu", "georgian", "hacapuri", "khachapuri"], "georgian"],
];

const AMBIANCE_DICT: Dict<AmbianceTag> = [
  [
    [
      "deniz kenari",
      "deniz kenarinda",
      "sahilde",
      "sahil kenari",
      "sahil",
      "kordon",
      "bogaz kenari",
      "bogazda",
      "denize sifir",
      "seaside",
      "sea side",
      "by the sea",
      "waterfront",
      "on the coast",
      "beachside",
      "deniz kenari",
    ],
    "seaside",
  ],
  [["canli muzik", "muzik olsun", "live music", "muzikli", "akustik"], "live_music"],
  [["sakin", "sessiz", "huzurlu", "dingin", "gurultusuz", "quiet", "calm", "peaceful"], "quiet"],
  [
    ["canli", "hareketli", "eglenceli", "enerjik", "kalabalik olsun", "lively", "vibrant", "fun"],
    "lively",
  ],
  [["romantik", "romantic", "mum isigi", "ozel gun"], "romantic"],
  [["samimi", "sicak", "kucuk", "cozy", "sirin", "rahat"], "cozy"],
  [["manzara", "manzarali", "deniz manzarasi", "bogaz manzarasi", "view", "sea view"], "view"],
  [
    ["dis mekan", "acik hava", "bahce", "bahceli", "teras", "outdoor", "terrace", "garden"],
    "outdoor",
  ],
  [["kapali", "ic mekan", "icerisi", "indoor", "inside"], "indoor"],
  [
    ["calismaya uygun", "priz", "wifi", "wi-fi", "internet", "work friendly", "laptop"],
    "work_friendly",
  ],
  [
    [
      "gruba uygun",
      "grup icin",
      "grupla",
      "grup olarak",
      "kalabalik grup",
      "buyuk masa",
      "group",
      "gruplar icin",
    ],
    "group_friendly",
  ],
  [["cocuk dostu", "aile dostu", "family friendly", "kid friendly"], "family_friendly"],
  [["trendy", "popüler", "populer", "hip", "moda", "instagramlik", "instagram"], "trendy"],
  [["gece gec", "gec saate", "gece acik", "late night", "gece hayati"], "late_night"],
  [["fine dining", "sik restoran", "lüks", "luks", "michelin", "gurme", "gourmet"], "fine_dining"],
  [["ucuz yemek", "sokak lezzeti", "street food", "cheap eats", "esnaf"], "cheap_eats"],
];

/** Catalog features (src/lib/catalog/taxonomy.ts) in Turkish / Azerbaijani / English. */
const FEATURE_DICT: Dict<Feature> = [
  [
    [
      "kabinet",
      "kabine",
      "loca",
      "ozel oda",
      "ozel bolum",
      "private room",
      "private dining",
      "xususi otaq",
      "ayri oda",
    ],
    "private_room",
  ],
  [["karaoke"], "karaoke"],
  [["canli muzik", "canli musiqi", "live music", "muzikli"], "live_music"],
  [["nargile", "qelyan", "hookah", "shisha"], "hookah"],
  [
    ["teras", "terrace", "acik hava", "acik havada", "bahce", "bahcede", "outdoor"],
    "outdoor_terrace",
  ],
  [["cati", "rooftop", "roof"], "rooftop"],
  [
    [
      "deniz manzarasi",
      "deniz manzarali",
      "denize baksin",
      "sea view",
      "deniz gorunsun",
      "deniz manzaresi",
    ],
    "sea_view",
  ],
  [["manzarali", "sehir manzarasi", "city view"], "city_view"],
  [["cocuk alani", "oyun alani", "cocuk parki", "kids area", "usaq meydancasi"], "kids_area"],
  [["cocuk menusu", "kids menu", "usaq menyusu"], "kids_menu"],
  [["otopark", "park yeri", "parking", "parkinq", "arabayla gidecegim"], "parking"],
  [["wifi", "wi-fi", "internet"], "wifi"],
  [["rezervasyon", "rezervasiya", "reservation"], "reservations"],
  [
    ["alkol olsun", "alkollu", "icki olsun", "sarap olsun", "bira olsun", "alkol servisi"],
    "serves_alcohol",
  ],
  [["alkolsuz", "alkol olmasin", "icki olmasin"], "no_alcohol"],
  [["helal", "halal"], "halal"],
  [["vejetaryen", "vegetarian", "vegetaryen"], "vegetarian_options"],
  [["vegan", "veqan"], "vegan_options"],
  [["tekerlekli sandalye", "engelli", "wheelchair", "elil"], "wheelchair"],
  [["evcil hayvan", "kopekle", "kopek", "pet friendly", "dog friendly"], "pet_friendly"],
  [
    ["gec saate kadar", "gece acik", "gece gec", "late night", "open late", "gece yarisi"],
    "late_open",
  ],
  [["24 saat", "24/7"], "open_24h"],
  [["paket servis", "eve siparis", "delivery", "catdirilma"], "delivery"],
  [["kokteyl", "cocktail"], "cocktails"],
  [["sarap listesi", "wine list", "sarap"], "wine_list"],
  [
    ["nitelikli kahve", "specialty coffee", "filtre kahve", "3. dalga", "third wave"],
    "specialty_coffee",
  ],
  [["tatli", "tatlilari", "dessert", "sirniyyat", "desert"], "dessert_menu"],
  [["cay cesitleri", "tea selection", "cay evi"], "tea_selection"],
  [["somine", "fireplace", "kamin"], "fireplace"],
  [["mac izlemek", "mac yayini", "sports bar", "mac var"], "tv_sports"],
  [["masa oyunu", "board game", "kutu oyunu"], "board_games"],
  [["sigara icilebilen", "sigara alani", "smoking"], "smoking_area"],
  [["sigarasiz", "sigara icilmeyen", "non smoking", "non-smoking"], "non_smoking"],
];

const MEAL_DICT: Dict<Meal> = [
  [["kahvalti", "kahvaltiya", "seher yemeyi", "breakfast", "sabah"], "breakfast"],
  [["brunch", "branc"], "brunch"],
  [["ogle yemegi", "oglen", "ogleyin", "nahar", "lunch"], "lunch"],
  [["aksam yemegi", "aksam", "sam yemeyi", "dinner", "axsam"], "dinner"],
  [["gece gec", "gece yarisi", "late night", "gec saat"], "late_night"],
];

const NEED_DICT: Dict<Need> = [
  [["wifi", "wi-fi", "internet"], "wifi"],
  [["priz", "sarj", "power outlet", "outlet"], "power_outlets"],
  [["vejetaryen", "vegetarian"], "vegetarian"],
  [["vegan"], "vegan"],
  [["helal", "halal"], "halal"],
  [["tekerlekli sandalye", "engelli", "wheelchair", "erisilebilir"], "wheelchair"],
  [["cocuklu", "bebek arabasi", "cocuk sandalyesi", "kids", "stroller"], "kid_friendly"],
  [["sigara icilebilen", "sigara alani", "smoking area", "nargile"], "smoking_area"],
  [["sigarasiz", "sigara icilmeyen", "no smoking", "dumansiz"], "no_smoking"],
];

// Subjective / review-evidence signals – these only ever feed
// intent.review_priorities / review_avoid (ranking), never a hard filter.
const REVIEW_PRIORITY_DICT: Dict<AspectKey> = [
  [
    [
      "yemekleri iyi",
      "yemek kalitesi",
      "yemekleri gercekten iyi",
      "yemekleri cok iyi",
      "yemekleri harika",
      "lezzetli",
      "nefis",
      "guzel yemek",
      "yemekleri guzel",
      "good food",
      "food is great",
      "great food",
      "delicious",
    ],
    "food_quality",
  ],
  [
    [
      "servisi iyi",
      "servis kalitesi",
      "ilgili personel",
      "guler yuzlu",
      "good service",
      "great service",
    ],
    "service",
  ],
  [
    [
      "paranin karsiligi",
      "fiyat performans",
      "degerinde",
      "uygun fiyat performans",
      "value for money",
      "worth the price",
    ],
    "value",
  ],
  [
    [
      "atmosferi guzel",
      "ortami guzel",
      "ambiyans",
      "atmosfer",
      "nice atmosphere",
      "great atmosphere",
    ],
    "atmosphere",
  ],
  [
    [
      "konusabilecegimiz",
      "sohbet edebilecegimiz",
      "rahat konusa",
      "sohbet",
      "can talk",
      "conversation",
    ],
    "quiet",
  ],
];

const REVIEW_AVOID_DICT: Dict<CautionTag> = [
  [["yavas servis", "servis yavas", "slow service"], "slow_service"],
  [["turistik cok", "cok turistik", "too touristy"], "touristy"],
];

// Words that precede "mutfağı/restoranı" without naming a cuisine.
const GENERIC_CUISINE_STOP = new Set([
  "bir",
  "iyi",
  "guzel",
  "bu",
  "sakin",
  "ucuz",
  "pahali",
  "romantik",
  "sik",
  "the",
  "a",
  "an",
  "good",
  "nice",
  "quiet",
  "cheap",
  "any",
  "some",
  "yakin",
  "olan",
  "acik",
  "dunya",
  "ev",
]);
/** Turkish/English cuisine words → canonical key (only where the key differs from the word). */
const CUISINE_WORD_MAP: Record<string, string> = {
  ozbek: "uzbek",
  ozbekistan: "uzbek",
  uzbek: "uzbek",
  gurcu: "georgian",
  gurcistan: "georgian",
  georgian: "georgian",
  azerbaycan: "azerbaijani",
  azeri: "azerbaijani",
  azerbaijani: "azerbaijani",
  turk: "turkish",
  turkish: "turkish",
  italyan: "italian",
  italian: "italian",
  japon: "japanese",
  cin: "chinese",
  chinese: "chinese",
  hint: "indian",
  indian: "indian",
  meksika: "mexican",
  mexican: "mexican",
  kore: "korean",
  korean: "korean",
  lubnan: "lebanese",
  lebanese: "lebanese",
  suriye: "syrian",
  syrian: "syrian",
  iran: "persian",
  fars: "persian",
  persian: "persian",
  rus: "russian",
  russian: "russian",
  fransiz: "french",
  french: "french",
  ispanyol: "spanish",
  spanish: "spanish",
  yunan: "greek",
  greek: "greek",
  arap: "arabic",
  arabic: "arabic",
  tay: "thai",
  thai: "thai",
  vietnam: "vietnamese",
  vietnamese: "vietnamese",
  deniz: "seafood",
  balik: "seafood",
  kebap: "kebab",
  kebab: "kebab",
  hamburger: "burger",
  burger: "burger",
};
/** Name keywords per canonical key (any language/script used in Istanbul & Baku). */
/**
 * Name keywords per canonical key – DEMONYMS ONLY. City names ("Buhara",
 * "Semerkand", "Halep") are popular names for ordinary Turkish kebab houses and
 * would mislabel them, so they are deliberately left out.
 */
export const CUISINE_KEYWORDS: Record<string, string[]> = {
  turkish: ["turkish", "türk", "turk", "anadolu", "karadeniz"],
  uzbek: ["uzbek", "özbek", "ozbek", "özbekistan", "uzbekistan"],
  georgian: ["georgian", "gürcü", "gurcu", "gürcistan"],
  azerbaijani: ["azerbaijani", "azerbaycan", "azərbaycan", "azeri"],
  lebanese: ["lebanese", "lübnan"],
  syrian: ["syrian", "suriye"],
  persian: ["persian", "iran", "iranian", "fars"],
  russian: ["russian", "rus"],
  korean: ["korean", "kore"],
  thai: ["thai", "tayland"],
  greek: ["greek", "yunan"],
  arabic: ["arabic", "arap", "arab"],
  indian: ["indian", "hint", "hindistan"],
  mexican: ["mexican", "meksika"],
  japanese: ["japanese", "japon"],
  sushi: ["sushi", "suşi"],
  chinese: ["chinese", "çin"],
  italian: ["italian", "italyan", "pizzeria", "trattoria", "osteria"],
  french: ["french", "fransız"],
  seafood: ["balık", "balik", "seafood", "fish"],
  meyhane: ["meyhane"],
  breakfast: ["kahvaltı", "kahvalti", "breakfast", "brunch"],
};

const CATEGORY_DICT: Dict<Category> = [
  [["kafe", "cafe", "kahveci", "coffee shop", "kahve icmek", "cay icmek"], "Cafés"],
  [
    [
      "restoran",
      "restaurant",
      "lokanta",
      "yemek yemek",
      "yemek yiyelim",
      "aksam yemegi",
      "ogle yemegi",
      "dinner",
      "lunch",
      "yemek istiyorum",
      "yemek istiyoruz",
    ],
    "Restaurants",
  ],
  [
    ["bar", "pub", "bira", "kokteyl", "cocktail", "icki", "drinks", "meyhane", "raki", "sarap"],
    "Bars",
  ],
  [
    [
      "gezmek",
      "yuruyus",
      "muze",
      "sergi",
      "park",
      "aktivite",
      "etkinlik",
      "sinema",
      "tiyatro",
      "bowling",
      "activity",
      "walk",
      "museum",
    ],
    "Activities",
  ],
];

// Negation / softening words that flip meaning of the preceding tag.
const NEGATION_RE = /\b(olmasin|istemiyorum|istemem|olmayan|not|no|without|degil)\b/;

// --- helpers ----------------------------------------------------------------

/**
 * Match dictionary phrases against text. A matched phrase is consumed so that
 * a longer phrase listed earlier ("canli muzik" → live_music) prevents a
 * shorter one inside it ("canli" → lively) from also firing.
 */
function findAll<T extends string>(text: string, dict: Dict<T>): T[] {
  const found = new Set<T>();
  let work = ` ${text} `;
  for (const [phrases, value] of dict) {
    for (const p of phrases) {
      // Phrase must start at a word boundary ("balik" must not match inside
      // "kalabalik"), but may carry a Turkish suffix ("kebap" matches "kebapci").
      const needle = ` ${p.trimStart()}`;
      if (work.includes(needle)) {
        found.add(value);
        work = work.split(needle).join(" ");
      }
    }
  }
  return [...found];
}

/** Split into clauses on commas, "ve", "ama", full stops. Keeps "veya"/"ya da" inside a clause. */
function clauses(text: string): string[] {
  return text
    .split(/[,.;!?]|\bve\b|\bama\b|\bfakat\b|\bayrica\b|\band\b|\bbut\b/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const OR_RE = /\bveya\b|\bya da\b|\byahut\b|\bor\b/;

function parseBudget(text: string): Intent["budget"] {
  const budget: Intent["budget"] = { max_per_person: null, level: null, currency: null };

  // "300 tl", "300₺", "300 lira", "kişi başı 400", "50 manat", "40 azn", "$20"
  const m =
    text.match(/(\d{2,6})\s*(tl|₺|lira|manat|azn|\$|usd|eur|€)/) ??
    text.match(/(tl|₺|manat|azn|\$|€)\s*(\d{2,6})/);
  if (m) {
    const num = Number(m[1]!.match(/\d/) ? m[1] : m[2]);
    const cur = (m[1]!.match(/\d/) ? m[2] : m[1]) ?? "";
    budget.max_per_person = num;
    budget.currency = /manat|azn/.test(cur)
      ? "AZN"
      : /\$|usd/.test(cur)
        ? "USD"
        : /€|eur/.test(cur)
          ? "EUR"
          : "TRY";
  } else {
    // "bütçem 300" without a currency word
    const b = text.match(/butce(?:m|miz)?\s*(?:ise|:)?\s*(\d{2,6})/);
    if (b) budget.max_per_person = Number(b[1]);
  }

  if (
    /pahali olmasin|cok pahali olmasin|ucuz|uygun fiyat|hesapli|butcem dar|butce dusuk|ogrenci|cheap|budget|affordable|inexpensive/.test(
      text,
    )
  ) {
    budget.level = "low";
  } else if (/orta fiyat|orta butce|makul|mid-range|moderate/.test(text)) {
    budget.level = "mid";
  } else if (
    /luks|pahali olsun|fiyat onemli degil|ozel bir yer|fine dining|expensive|splurge|upscale/.test(
      text,
    )
  ) {
    budget.level = "high";
  }
  return budget;
}

function parseDistance(text: string): Pick<Intent, "transport" | "max_distance_min"> {
  let transport: Intent["transport"] = null;
  let max: number | null = null;

  if (/yurume mesafesi|yuruyerek|yuruyus mesafesi|walking distance|on foot/.test(text)) {
    transport = "walking";
    max = 20;
  } else if (/arabayla|araba ile|arac|otopark|by car|drive|parking/.test(text)) {
    transport = "car";
  } else if (/metro|otobus|toplu tasima|vapur|tramvay|metrobus|transit|bus|ferry/.test(text)) {
    transport = "transit";
  }

  const m = text.match(/(\d{1,3})\s*(dakika|dk|min|minutes?)/);
  if (m) max = Number(m[1]);
  else if (/\byakin\b|yakinlarda|yakinda|nearby|close by|near me|hemen yakin/.test(text))
    max = max ?? 15;
  else if (/\buzak olmasin\b|not far/.test(text)) max = max ?? 25;

  return { transport, max_distance_min: max };
}

function parseGroupSize(text: string): number | null {
  const m = text.match(/(\d{1,2})\s*kisi/) ?? text.match(/(\d{1,2})\s*(people|persons|of us)/);
  if (m) return Number(m[1]);
  if (/ikimiz|iki kisi|ciftler/.test(text)) return 2;
  return null;
}

function parseTime(text: string): Intent["time"] {
  if (/bu aksam|aksam|tonight|this evening/.test(text)) return "tonight";
  if (/yarin|tomorrow/.test(text)) return "tomorrow";
  if (/hafta sonu|cumartesi|pazar gunu|weekend|saturday|sunday/.test(text)) return "weekend";
  if (/simdi|hemen|su an|right now|now/.test(text)) return "now";
  return null;
}

// --- main -------------------------------------------------------------------

export function parseIntentWithRules(raw: string): ParsedIntent {
  const text = normalizeTr(raw);
  const intent: Intent = emptyIntent();

  // Purpose: first match wins; explicit "date" words beat "friends".
  const purposes = findAll(text, PURPOSE_DICT);
  intent.purpose = purposes[0] ?? null;

  intent.cuisines = findAll(text, CUISINE_DICT);
  // Generic: "<x> mutfağı", "<x> restoranı", "<x> yemekleri", "<x> cuisine/food/restaurant"
  // → the word itself becomes a cuisine key AND a name keyword, so cuisines
  // nobody listed in code ("özbek", "gürcü", "lübnan") still work.
  const generic = [
    ...text.matchAll(
      /\b([a-z]{3,20})\s+(?:mutfagi|mutfagini|restorani|restoran|yemekleri|yemegi|lokantasi|cuisine|food|restaurant|kitchen)\b/g,
    ),
  ]
    .map((m) => m[1]!)
    .filter((w) => !GENERIC_CUISINE_STOP.has(w));
  const mappedGeneric = generic.map((w) => CUISINE_WORD_MAP[w] ?? w);
  intent.cuisines = [...new Set([...intent.cuisines, ...mappedGeneric])];
  intent.cuisine_keywords = [
    ...new Set([
      ...generic,
      ...mappedGeneric.flatMap((k) => CUISINE_KEYWORDS[k] ?? []),
      ...intent.cuisines.flatMap((k) => CUISINE_KEYWORDS[k] ?? []),
    ]),
  ];
  intent.needs = findAll(text, NEED_DICT);
  intent.features = findAll(text, FEATURE_DICT);
  intent.meals = findAll(text, MEAL_DICT);
  intent.categories = findAll(text, CATEGORY_DICT);
  // A cuisine request implies a restaurant unless the user said café/bar. This is
  // a guess, not a stated category, so mark it non-explicit: retrieval should
  // stay broad and the scorer should not hard-exclude on it (Stage A recall).
  if (intent.cuisines.length && intent.categories.length === 0) {
    const cafeish = intent.cuisines.every((c) =>
      ["coffee", "tea", "dessert", "bakery", "breakfast"].includes(c),
    );
    intent.categories = [cafeish ? "Cafés" : "Restaurants"];
    intent.category_explicit = false;
  }

  // Ambiance with OR-groups and negation, clause by clause.
  const allOf = new Set<AmbianceTag>();
  const anyOf: AmbianceTag[][] = [];
  const avoid = new Set<AmbianceTag>();
  // Subjective ranking-only signals (never a filter) – see intent.ts.
  const reviewPriorities = new Set<AspectKey>();
  const reviewAvoid = new Set<CautionTag>();

  for (const clause of clauses(text)) {
    // "kalabalık olmasın" → avoid lively ; "gürültülü olmasın" → quiet
    if (
      /kalabalik olmasin|kalabalik olmayan|gurultulu olmasin|gurultulu olmayan|gurultu olmasin|not crowded|uncrowded|not loud|not busy/.test(
        clause,
      )
    ) {
      avoid.add("lively");
      allOf.add("quiet");
      reviewAvoid.add("crowded");
      reviewAvoid.add("loud");
      continue;
    }
    for (const tag of findAll(clause, REVIEW_PRIORITY_DICT)) reviewPriorities.add(tag);
    for (const tag of findAll(clause, REVIEW_AVOID_DICT)) reviewAvoid.add(tag);
    const tags = findAll(clause, AMBIANCE_DICT);
    if (tags.length === 0) continue;
    const negated = NEGATION_RE.test(clause) && !/olsun\b/.test(clause.replace(/olmasin/g, ""));
    if (negated) {
      for (const t of tags) avoid.add(t);
    } else if (OR_RE.test(clause) && tags.length >= 2) {
      anyOf.push(tags);
    } else {
      for (const t of tags) allOf.add(t);
    }
  }
  // A tag can't be both required and avoided; "avoid" wins (user was explicit).
  for (const t of avoid) allOf.delete(t);
  // "sakin bir yer … sakin olsun veya canlı müzik olsun": the OR statement is the
  // more specific one, so a tag inside an OR-group is not also a hard requirement.
  for (const group of anyOf) for (const t of group) allOf.delete(t);
  intent.ambiance = { all_of: [...allOf], any_of: anyOf, avoid: [...avoid] };

  // Ambiance tags that are ALSO valid Venue Intelligence aspect keys double as
  // review priorities – "romantik"/"sakin"/"manzaralı" should both match the
  // venue's own tags AND reward real review evidence saying the same thing.
  const ASPECT_TAG_OVERLAP = new Set(["romantic", "quiet", "view"]);
  for (const t of allOf) if (ASPECT_TAG_OVERLAP.has(t)) reviewPriorities.add(t as AspectKey);

  intent.budget = parseBudget(text);
  // "çok pahalı olmasın" already sets budget.level="low"; also treat it as a
  // caution to weigh actual "not worth the price" review evidence.
  if (intent.budget.level === "low") reviewAvoid.add("expensive_for_value");
  intent.review_priorities = [...reviewPriorities];
  intent.review_avoid = [...reviewAvoid];
  Object.assign(intent, parseDistance(text));
  intent.group_size = parseGroupSize(text);
  intent.time = parseTime(text);
  intent.weather_sensitive =
    /yagmur|yagiyor|kar yagiyor|soguk|sicak hava|gunesli|hava guzel|ruzgar|rain|raining|snow|cold|sunny|hot outside/.test(
      text,
    );
  if (
    /yagmur|yagiyor|kar|soguk|rain|snow|cold/.test(text) &&
    !intent.ambiance.all_of.includes("outdoor")
  ) {
    if (!intent.ambiance.all_of.includes("indoor")) intent.ambiance.all_of.push("indoor");
  }
  if (
    /gunesli|hava guzel|sunny|nice weather/.test(text) &&
    !intent.ambiance.all_of.includes("indoor")
  ) {
    if (!intent.ambiance.all_of.includes("outdoor")) intent.ambiance.all_of.push("outdoor");
  }
  if (intent.purpose === "friends" && intent.group_size == null) intent.group_size = 3;
  if (intent.purpose === "date" && intent.group_size == null) intent.group_size = 2;

  // Confidence: how much of the sentence did we actually map?
  const signals =
    (intent.purpose ? 1 : 0) +
    (intent.cuisines.length ? 1 : 0) +
    (intent.ambiance.all_of.length + intent.ambiance.any_of.length + intent.ambiance.avoid.length
      ? 1
      : 0) +
    (intent.budget.max_per_person || intent.budget.level ? 1 : 0) +
    (intent.categories.length ? 1 : 0) +
    (intent.max_distance_min || intent.transport ? 1 : 0);
  const words = text.split(" ").length;
  const confidence = Math.min(1, signals / 3) * (words > 40 ? 0.7 : 1);

  return { intent, parser: "rules", raw, confidence };
}
