#!/usr/bin/env node
/**
 * Meetap – batch ambiance tagging with the configured LLM (DeepSeek by default).
 *
 * Usage:
 *   node --env-file=.env scripts/tag/ambiance-llm.mjs --city Istanbul --radius-km 3 --limit 500
 *   node --env-file=.env scripts/tag/ambiance-llm.mjs --city Baku --district "Səbail" --limit 300
 *   node --env-file=.env scripts/tag/ambiance-llm.mjs --city Istanbul --limit 40 --dry-run
 *
 * For every untagged venue the model sees only what we know (name, category,
 * type, cuisine, district, price band, existing hints) and returns ambiance
 * tags from the fixed vocabulary plus a "not a venue" flag for records that are
 * clearly not places to go (visa offices, wedding halls, wholesalers…).
 *
 * Writes: venues.ambiance_tags (union with factual OSM hints), ambiance_source
 * = 'inferred', ambiance_tagged_at, llm_notes; and is_active = false with
 * deactivated_reason = 'llm:not_venue' for flagged records (reversible).
 */

import postgres from "postgres";

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
const city = args.city;
if (!city) {
  console.error("--city is required");
  process.exit(1);
}
const LIMIT = Number(args.limit ?? 500);
const RADIUS_KM = args["radius-km"] ? Number(args["radius-km"]) : null;
const DISTRICT = typeof args.district === "string" ? args.district : null;
const DRY = args["dry-run"] === true;
const BATCH = Number(args.batch ?? 40);
const CONCURRENCY = Number(args.concurrency ?? 4);

const PROVIDER = process.env.LLM_PROVIDER ?? "deepseek";
const API = {
  deepseek: {
    url: "https://api.deepseek.com/chat/completions",
    key: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  },
}[PROVIDER];
if (!API?.key) {
  console.error(`No API key for LLM_PROVIDER=${PROVIDER}`);
  process.exit(1);
}

// DeepSeek list prices (USD per 1M tokens) for the cost estimate; others are rough.
const PRICE = { deepseek: [0.27, 1.1], groq: [0, 0], gemini: [0.3, 2.5] }[PROVIDER] ?? [0, 0];

const TAGS = [
  "quiet",
  "lively",
  "romantic",
  "cozy",
  "group_friendly",
  "work_friendly",
  "outdoor",
  "indoor",
  "live_music",
  "view",
  "family_friendly",
  "trendy",
  "late_night",
  "breakfast",
  "fine_dining",
  "cheap_eats",
];
const CENTERS = { Istanbul: [41.0369, 28.985], Baku: [40.3777, 49.852] };

const SYSTEM = `You label real venues in ${city} for a "where should I go" app. For each venue you get: name, category (Cafés/Restaurants/Bars/Activities), open-data type, cuisines, district, price band (1 cheap … 4 expensive) and hints we already know.

Return ONLY JSON: {"items":[{"i":<index>,"tags":[...],"not_venue":<bool>,"note":"<max 8 words or empty>"}]}.

Rules:
- tags come ONLY from this list: ${JSON.stringify(TAGS)}. Pick 1–4 tags that a local would agree with. Use what the name, type and cuisine imply (e.g. "Ocakbaşı" → lively, group_friendly; "Şarap Evi"/"wine bar" → romantic, quiet; "Çay Bahçesi" → outdoor, quiet, cheap_eats; "Nargile"/"hookah" → late_night, lively; "Steakhouse" → fine_dining; "Kantin"/"Büfe"/"Döner" → cheap_eats; "Rooftop"/"Terrace"/"Sahil"/"Boğaz" → view, outdoor; "Kütüphane"/"study cafe"/"coworking" → work_friendly, quiet; "Pub"/"Meyhane" → lively, group_friendly; "Bistro"/"Patisserie" → cozy).
- Keep any hint tags that are facts (outdoor, indoor, work_friendly from data) unless clearly wrong.
- not_venue = true ONLY when the record is clearly not a place people go out to eat, drink or spend leisure time: visa/travel agencies, wedding halls, wholesalers, catering companies, kiosks in office buildings, hospital canteens, factory cafeterias, hotels' generic entries, companies named "… Ltd/A.Ş./MMC". Restaurants, cafés, bars, patisseries, parks, museums are venues.
- When unsure about a tag, leave it out. Never invent facts.`;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function callLlm(items, attempt = 1) {
  const body = {
    model: API.model,
    temperature: 0,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(items) },
    ],
  };
  const res = await fetch(API.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) {
    if (attempt >= 4)
      throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
    return callLlm(items, attempt + 1);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    if (attempt >= 3) throw new Error("bad JSON from model");
    return callLlm(items, attempt + 1);
  }
  return { items: Array.isArray(parsed.items) ? parsed.items : [], usage: json.usage ?? {} };
}

async function main() {
  const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 2, prepare: false });
  const [lat, lon] = CENTERS[city] ?? CENTERS.Istanbul;
  const rows = await sql`
    select id, name, category, raw_type, cuisines, district, price_band, ambiance_tags, outdoor_seating, indoor_seating, wifi
      from public.venues
     where city = ${city} and is_active and ambiance_tagged_at is null
       and category <> 'Activities'
       ${DISTRICT ? sql`and district = ${DISTRICT}` : sql``}
       ${RADIUS_KM ? sql`and st_dwithin(location, st_setsrid(st_makepoint(${lon}, ${lat}), 4326)::geography, ${RADIUS_KM * 1000})` : sql``}
     order by confidence desc nulls last, rating_count desc
     limit ${LIMIT}`;
  console.log(`${city}: ${rows.length} untagged venues selected (${DRY ? "dry run" : "writing"})`);
  if (rows.length === 0) {
    await sql.end();
    return;
  }

  const batches = chunk(rows, BATCH);
  let done = 0;
  let inTok = 0;
  let outTok = 0;
  let flagged = 0;
  let tagged = 0;
  const started = Date.now();

  async function worker(queue) {
    for (;;) {
      const batch = queue.shift();
      if (!batch) return;
      const items = batch.map((r, i) => ({
        i,
        name: r.name,
        category: r.category,
        type: r.raw_type,
        cuisines: r.cuisines ?? [],
        district: r.district,
        price_band: r.price_band,
        hints: r.ambiance_tags ?? [],
      }));
      let result;
      try {
        result = await callLlm(items);
      } catch (err) {
        console.error(`  batch failed: ${err.message}`);
        continue;
      }
      inTok += result.usage.prompt_tokens ?? 0;
      outTok += result.usage.completion_tokens ?? 0;

      for (const out of result.items) {
        const r = batch[out.i];
        if (!r) continue;
        const facts = [];
        if (r.outdoor_seating === true) facts.push("outdoor");
        if (r.indoor_seating === true) facts.push("indoor");
        if (r.wifi && r.wifi !== "no") facts.push("work_friendly");
        const tags = [
          ...new Set([
            ...(Array.isArray(out.tags) ? out.tags : []).filter((t) => TAGS.includes(t)),
            ...facts,
          ]),
        ].slice(0, 6);
        const notVenue = out.not_venue === true;
        const note = typeof out.note === "string" ? out.note.slice(0, 120) : null;
        if (DRY) {
          console.log(
            `  ${notVenue ? "✗" : "✓"} ${r.name} [${r.category}/${r.raw_type}] → ${tags.join(", ")}${note ? `  (${note})` : ""}`,
          );
        } else {
          await sql`
            update public.venues
               set ambiance_tags = ${tags},
                   ambiance_source = case when ambiance_source in ('user','reviewed') then ambiance_source else 'inferred' end,
                   ambiance_tagged_at = now(),
                   llm_notes = ${note},
                   is_active = case when ${notVenue} then false else is_active end,
                   deactivated_reason = case when ${notVenue} then 'llm:not_venue' else deactivated_reason end,
                   updated_at = now()
             where id = ${r.id}`;
        }
        if (notVenue) flagged++;
        else tagged++;
      }
      done += batch.length;
      const cost = (inTok * PRICE[0] + outTok * PRICE[1]) / 1e6;
      process.stdout.write(
        `  ${done}/${rows.length} · tagged ${tagged} · flagged ${flagged} · ~$${cost.toFixed(3)} · ${Math.round((Date.now() - started) / 1000)}s\r`,
      );
    }
  }

  const queue = [...batches];
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
  console.log();
  const cost = (inTok * PRICE[0] + outTok * PRICE[1]) / 1e6;
  console.log(
    `finished: ${done} venues, tagged ${tagged}, flagged not-venue ${flagged}, tokens in ${inTok} / out ${outTok}, cost ≈ $${cost.toFixed(3)} (${((cost / Math.max(1, done)) * 1000).toFixed(3)} $ per 1000 venues)`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
