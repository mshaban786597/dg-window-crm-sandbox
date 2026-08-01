/**
 * Isomorphic HTTP header names shared by middleware and Server Components.
 *
 * Kept dependency-free (no `server-only`, no Node built-ins) so it can be
 * imported from the Edge middleware runtime as well as from the server.
 */

/**
 * Middleware copies the resolved request pathname onto this header.
 *
 * Next.js does not expose the current pathname to Server Components, but the
 * platform layout needs it for exactly one decision: letting its own sign-in
 * page (`/platform-admin/login`) render without running the admin guard, which
 * would otherwise redirect the sign-in page to itself.
 *
 * It is a *routing* hint only. Nothing security-relevant is derived from it —
 * a forged value can at most reveal the unauthenticated sign-in screen, which
 * is public by design (see `PUBLIC_PATHS` in `src/middleware.ts`).
 */
export const REQUEST_PATHNAME_HEADER = "x-dg-pathname";
