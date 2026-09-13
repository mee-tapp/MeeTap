import { createClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string;
const key = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string;

/** Browser Supabase client — anon key only, session kept in localStorage. */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "meetap-auth" },
});
