#!/usr/bin/env node
/**
 * Meetap – intent parser evaluation.
 *
 * Usage:
 *   node scripts/eval/intent-eval.mjs                 # rule parser only, no keys needed
 *   node --env-file=.env scripts/eval/intent-eval.mjs --llm   # also the LLM parser
 *
 * Each case in intent-cases.json lists what a correct parse MUST contain
 * (not the full intent), so the score is "how many expectations were met".
 * Add a case whenever a real user sentence is misunderstood – that is the
 * regression suite for the parser.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseIntentWithRules } from "../../src/lib/recommend/rule-parser.ts";
import { parseIntentWithLlm } from "../../src/lib/recommend/llm-parser.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await readFile(path.join(here, "intent-cases.json"), "utf8"));
const useLlm = process.argv.includes("--llm");

function check(intent, expect) {
  const misses = [];
  const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
  if (expect.purpose && intent.purpose !== expect.purpose)
    misses.push(`purpose=${intent.purpose}≠${expect.purpose}`);
  if (expect.categories)
    for (const c of expect.categories) if (!has(intent.categories, c)) misses.push(`category ${c}`);
  if (expect.cuisines_any && !expect.cuisines_any.some((c) => has(intent.cuisines, c)))
    misses.push(`cuisine any of ${expect.cuisines_any}`);
  if (expect.ambiance_all) {
    const all = [...intent.ambiance.all_of, ...intent.ambiance.any_of.flat()];
    for (const t of expect.ambiance_all) if (!all.includes(t)) misses.push(`ambiance ${t}`);
  }
  if (expect.ambiance_any_group) {
    const ok = intent.ambiance.any_of.some((g) =>
      expect.ambiance_any_group.every((t) => g.includes(t)),
    );
    if (!ok) misses.push(`OR-group ${expect.ambiance_any_group}`);
  }
  if (expect.avoid)
    for (const t of expect.avoid) if (!has(intent.ambiance.avoid, t)) misses.push(`avoid ${t}`);
  if (expect.budget_level && intent.budget.level !== expect.budget_level)
    misses.push(`budget.level=${intent.budget.level}≠${expect.budget_level}`);
  if (expect.budget_max != null && intent.budget.max_per_person !== expect.budget_max)
    misses.push(`budget.max=${intent.budget.max_per_person}≠${expect.budget_max}`);
  if (expect.currency && intent.budget.currency !== expect.currency)
    misses.push(`currency=${intent.budget.currency}≠${expect.currency}`);
  if (expect.group_size != null && intent.group_size !== expect.group_size)
    misses.push(`group=${intent.group_size}≠${expect.group_size}`);
  if (expect.transport && intent.transport !== expect.transport)
    misses.push(`transport=${intent.transport}≠${expect.transport}`);
  if (expect.time && intent.time !== expect.time) misses.push(`time=${intent.time}≠${expect.time}`);
  if (expect.needs)
    for (const n of expect.needs) if (!has(intent.needs, n)) misses.push(`need ${n}`);
  if (expect.needs_any && !expect.needs_any.some((n) => has(intent.needs, n)))
    misses.push(`need any of ${expect.needs_any}`);
  if (expect.weather_sensitive != null && intent.weather_sensitive !== expect.weather_sensitive)
    misses.push(`weather_sensitive=${intent.weather_sensitive}`);
  if (
    expect.max_distance_max != null &&
    !(intent.max_distance_min != null && intent.max_distance_min <= expect.max_distance_max)
  )
    misses.push(`max_distance=${intent.max_distance_min}`);
  return misses;
}

async function run(label, parse) {
  let expectations = 0;
  let met = 0;
  let perfect = 0;
  const failures = [];
  for (const c of cases) {
    const { intent } = await parse(c.q);
    const misses = check(intent, c.expect);
    const total = Object.keys(c.expect).length;
    expectations += total;
    met += total - misses.length;
    if (misses.length === 0) perfect++;
    else failures.push(`  ✗ ${c.q}\n      ${misses.join(" · ")}`);
  }
  console.log(
    `\n${label}: ${perfect}/${cases.length} sentences fully correct · ${met}/${expectations} expectations met (${Math.round((100 * met) / expectations)}%)`,
  );
  if (failures.length) console.log(failures.join("\n"));
}

await run("RULES", async (q) => parseIntentWithRules(q));
if (useLlm) await run("LLM  ", (q) => parseIntentWithLlm(q));
