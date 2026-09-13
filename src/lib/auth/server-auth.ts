import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Server-only helper: turns a browser session's access token into a verified
 * Supabase user. Used by server functions that need to know who's asking
 * (saved venues, history, reviews) without trusting a client-supplied id.
 */

let cached: SupabaseClient | null = null;

function anonClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env["VITE_SUPABASE_URL"];
  const key = process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Verifies the token against Supabase Auth; returns null for anonymous/invalid tokens. */
export async function verifyAccessToken(
  accessToken: string | null | undefined,
): Promise<User | null> {
  if (!accessToken) return null;
  const { data, error } = await anonClient().auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
