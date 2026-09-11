#!/usr/bin/env node
/**
 * Compare the rule parser and the LLM parser on one or more sentences.
 *
 * Usage: node --env-file=.env scripts/intent-smoke.mjs "cümle 1" "cümle 2" …
 */
import { parseIntentWithRules } from "../src/lib/recommend/rule-parser.ts";
import { parseIntentWithLlm } from "../src/lib/recommend/llm-parser.ts";

const sentences = process.argv.slice(2);
if (sentences.length === 0) {
  console.error('Usage: intent-smoke.mjs "sentence" …');
  process.exit(1);
}

for (const s of sentences) {
  console.log("\n" + "=".repeat(80) + "\n" + s);
  const r = parseIntentWithRules(s);
  console.log("RULES :", JSON.stringify(r.intent));
  const l = await parseIntentWithLlm(s);
  console.log(
    `${l.parser === "llm" ? `LLM   ` : "LLM(fallback)"}:`,
    JSON.stringify(l.intent),
    l.latency_ms ? `(${l.latency_ms} ms, ${l.model})` : "",
  );
}
