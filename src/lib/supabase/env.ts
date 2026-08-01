/**
 * Supabase environment resolution.
 *
 * Supabase has two generations of key naming:
 *   - legacy:  NEXT_PUBLIC_SUPABASE_ANON_KEY   / SUPABASE_SERVICE_ROLE_KEY
 *   - current: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY  (sb_publishable_… / sb_secret_…)
 *
 * Both are accepted so the app runs against either project generation without
 * duplicating a key into two variables.
 *
 * IMPORTANT: each `process.env.NEXT_PUBLIC_*` below is written as a full static
 * reference. Next.js inlines these at build time by literal textual match — a
 * computed lookup such as `process.env[name]` would resolve to undefined in the
 * browser bundle.
 */

/**
 * The public (browser-safe) Supabase key.
 * Prefers the current publishable key, falling back to the legacy anon key.
 */
export const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/**
 * True when a URL and a public key are both present.
 * Used to decide between real auth and the local non-production sandbox.
 */
export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublicKey);
}
