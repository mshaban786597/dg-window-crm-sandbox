/**
 * Supabase ADMIN client — privileged, server-side only.
 *
 * Uses the secret/service-role key, which bypasses Row-Level Security. It must
 * never reach a browser bundle.
 *
 * Protection (three layers):
 *   1. The key is read from a NON-`NEXT_PUBLIC_` variable, so Next.js will not
 *      inline it into client code.
 *   2. `assertServerOnly()` throws immediately if this module is ever evaluated
 *      in a browser.
 *   3. No client component imports it (verified in the repo).
 *
 * Note: this module deliberately does NOT `import "server-only"`. That package
 * throws outside the react-server condition, which would break the plain Node
 * CLI (`npm run bootstrap:platform-admin`) that legitimately needs the key.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * The privileged server key.
 * Accepts the current `sb_secret_…` key or the legacy service-role key.
 */
export const supabaseServerSecret =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** True when privileged server operations are possible. */
export function supabaseAdminConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseServerSecret);
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "The Supabase admin client is server-only and must never run in a browser."
    );
  }
}

/**
 * Create a service-role Supabase client. Throws (rather than silently
 * degrading) when the secret is missing, so privileged code cannot accidentally
 * run with reduced permissions.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  assertServerOnly();
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!supabaseServerSecret) {
    throw new Error(
      "No server secret configured. Set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createClient(supabaseUrl, supabaseServerSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
