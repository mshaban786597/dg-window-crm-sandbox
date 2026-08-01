import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabasePublicKey } from "./env";

/**
 * Browser Supabase client. Uses the public (publishable/anon) key only —
 * never the server secret.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublicKey);
}
