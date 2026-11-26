"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

/** Browser Supabase client (PKCE flow; session kept in cookies shared with the server). */
export function supabaseBrowser(): SupabaseClient {
  return (client ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));
}
