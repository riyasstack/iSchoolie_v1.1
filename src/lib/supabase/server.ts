import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/** Server Supabase client bound to the request cookies (route handlers and server components). */
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Server components can't set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}
