#!/usr/bin/env node
/**
 * Meetap – apply SQL migrations in supabase/migrations/ in filename order.
 *
 * Usage:
 *   node --env-file=.env scripts/db/apply-migrations.mjs
 *
 * Needs SUPABASE_DB_URL in .env (Project Settings → Database → Connection string, URI).
 * Idempotent: every migration is written with IF NOT EXISTS / OR REPLACE and the
 * applied list is kept in public._migrations.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL;
if (!url || url.includes("XXXX")) {
  console.error("SUPABASE_DB_URL is not set in .env");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
const dir = path.join("supabase", "migrations");

try {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from public._migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const body = await readFile(path.join(dir, file), "utf8");
    console.log(`apply  ${file} …`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._migrations (name) values (${file})`;
    });
    console.log(`done   ${file}`);
  }
} finally {
  await sql.end();
}
