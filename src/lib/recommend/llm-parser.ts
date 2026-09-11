import {
  AMBIANCE_TAGS,
  CATEGORIES,
  CUISINES,
  IntentSchema,
  NEEDS,
  PURPOSES,
  type ParsedIntent,
} from "./intent.ts";
import { parseIntentWithRules } from "./rule-parser.ts";

/**
 * LLM intent parser (DeepSeek / any OpenAI-compatible chat endpoint).
 *
 * The model's only job is to turn one free-text sentence into the Intent JSON.
 * It never sees venues and never ranks. Output is validated with the same zod
 * schema the scorer uses; anything invalid falls back to the rule parser, so the
 * product keeps working when the API is down or the budget is exhausted.
 *
 * Server-side only – reads secrets from process.env.
 */

export type LlmProvider = "deepseek" | "gemini" | "groq" | "none";

type ProviderConfig = { url: string; model: string; key: string };

function providerConfig(): ProviderConfig | null {
  const provider = (process.env["LLM_PROVIDER"] ?? "none") as LlmProvider;
  if (provider === "deepseek" && process.env["DEEPSEEK_API_KEY"]) {
    return {
      url: "https://api.deepseek.com/chat/completions",
      model: process.env["DEEPSEEK_MODEL"] ?? "deepseek-chat",
      key: process.env["DEEPSEEK_API_KEY"],
    };
  }
  if (provider === "groq" && process.env["GROQ_API_KEY"]) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env["GROQ_MODEL"] ?? "llama-3.3-70b-versatile",
      key: process.env["GROQ_API_KEY"],
    };
  }
  if (provider === "gemini" && process.env["GEMINI_API_KEY"]) {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash",
      key: process.env["GEMINI_API_KEY"],
    };
  }
  return null;
}

const SYSTEM_PROMPT = `You convert ONE sentence from a user of Meetap (a venue recommendation app for Istanbul and Baku) into a strict JSON object. The sentence is usually Turkish, sometimes English or Azerbaijani.

Return ONLY a JSON object with exactly these keys:
{
  "purpose": one of ${JSON.stringify(PURPOSES)} or null,
  "categories": array from ${JSON.stringify(CATEGORIES)} (empty = any),
  "cuisines": array from ${JSON.stringify(CUISINES)},
  "ambiance": {
    "all_of": array from the ambiance list – tags the user requires,
    "any_of": array of arrays – alternatives joined by "veya / ya da / or", e.g. [["quiet","live_music"]],
    "avoid": array – tags the user explicitly does NOT want ("kalabalık olmasın" → ["lively"])
  },
  "budget": { "max_per_person": number or null, "level": "low" | "mid" | "high" | null, "currency": "TRY" | "AZN" | "USD" | "EUR" | null },
  "group_size": integer or null,
  "transport": "walking" | "car" | "transit" | null,
  "max_distance_min": number or null,
  "time": "now" | "tonight" | "tomorrow" | "weekend" | null,
  "needs": array from ${JSON.stringify(NEEDS)},
  "weather_sensitive": boolean (true if the sentence mentions weather),
  "unmapped": array of short strings – wishes you could not map to any field
}
Ambiance list: ${JSON.stringify(AMBIANCE_TAGS)}.

Rules:
- "sevgilim / kız arkadaşım / erkek arkadaşım / randevu" → purpose "date"; "arkadaşlarımla" → "friends"; "ders çalışmak / laptop" → "study"; "tek başıma" → "alone"; "ailemle / çocuklarla" → "family"; "iş yemeği / müşteri" → "business".
- "çok pahalı olmasın / ucuz / hesaplı" → budget.level "low". A number with tl/₺/lira → max_per_person with currency "TRY"; manat/azn → "AZN".
- "kebap" → cuisines ["kebab"]; "ev yemekleri / lokanta" → ["home_cooking"]; "balık" → ["seafood"]; "kahve" → ["coffee"] and categories ["Cafés"].
- If cuisines are given and no category, set categories ["Restaurants"] (or ["Cafés"] for coffee/tea/dessert/breakfast).
- "sakin / sessiz" → "quiet"; "canlı müzik" → "live_music" (NOT "lively"); "manzara / boğaz" → "view"; "bahçe / teras / açık hava" → "outdoor"; "yağmur / soğuk" → all_of "indoor" and weather_sensitive true.
- "sahil / deniz kenarı / seaside / by the sea / waterfront / Boğaz kenarı" → "seaside" (a location fact: the place is at the shore). "manzara / view" → "view". Both may apply.
- "yakın / yürüme mesafesi" → transport "walking", max_distance_min 15–20.
- Never invent constraints the user did not state. Prefer null / empty over guessing.`;

export type LlmParseResult = ParsedIntent & { latency_ms?: number; model?: string };

/**
 * Parse with the configured LLM; fall back to rules on any failure.
 * `rules` is always computed first (cheap) and used to sanity-check the model.
 */
export async function parseIntentWithLlm(
  raw: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LlmParseResult> {
  const rules = parseIntentWithRules(raw);
  const cfg = providerConfig();
  if (!cfg) return rules;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  const started = Date.now();
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: raw },
        ],
      }),
      signal: opts.signal ?? controller.signal,
    });
    if (!res.ok)
      throw new Error(`${cfg.model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty completion");

    const parsed = IntentSchema.safeParse(JSON.parse(stripFences(content)));
    if (!parsed.success) throw new Error(`schema: ${parsed.error.issues[0]?.message}`);

    const intent = parsed.data;
    // Same normalisation as the rule parser: a tag inside an OR-group is not also
    // a hard requirement, and an avoided tag is never required.
    const dropped = new Set([...intent.ambiance.any_of.flat(), ...intent.ambiance.avoid]);
    intent.ambiance.all_of = intent.ambiance.all_of.filter((t) => !dropped.has(t));
    // Cheap guard rails: numbers the rules found deterministically win over the model.
    if (rules.intent.budget.max_per_person != null && intent.budget.max_per_person == null) {
      intent.budget = {
        ...intent.budget,
        max_per_person: rules.intent.budget.max_per_person,
        currency: rules.intent.budget.currency,
      };
    }
    if (rules.intent.group_size != null && intent.group_size == null)
      intent.group_size = rules.intent.group_size;
    if (rules.intent.budget.level != null && intent.budget.level == null)
      intent.budget = { ...intent.budget, level: rules.intent.budget.level };

    return {
      intent,
      parser: "llm",
      raw,
      confidence: 0.9,
      latency_ms: Date.now() - started,
      model: cfg.model,
    };
  } catch (err) {
    console.warn(`[intent] LLM parse failed, using rules: ${(err as Error).message}`);
    return rules;
  } finally {
    clearTimeout(timer);
  }
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
