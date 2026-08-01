/**
 * Route guards (§2, §24).
 *
 * This is the FIRST line of defence only. It cheaply rejects obviously
 * unauthenticated traffic and separates the two application areas. The
 * authoritative checks are Postgres RLS plus `requirePlatformAdmin()` /
 * `requireTenantSession()` inside each server component and route handler —
 * middleware alone is never treated as sufficient.
 */
import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATHNAME_HEADER } from "@/lib/http-headers";
import { supabaseConfigured as supabaseEnvConfigured } from "@/lib/supabase/env";

const PLATFORM_PREFIX = "/platform-admin";
const APP_PREFIX = "/app";

/** Public routes that must stay reachable without a session (§2, §15). */
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/accept-invite",
  "/invite",
  "/confirm-appointment",
  "/confirm",
  "/forgot-password",
  "/reset-password",
  "/suspended",
  // The platform sign-in page itself must be reachable; everything else under
  // /platform-admin is gated by requirePlatformAdmin() in the layout.
  "/platform-admin/login",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function supabaseConfigured(): boolean {
  return supabaseEnvConfigured();
}

/** Supabase sets `sb-<ref>-auth-token` cookies once a user is signed in. */
function hasAuthCookie(req: NextRequest): boolean {
  return req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Forward the pathname to Server Components. The platform layout uses it to
  // let its own sign-in page through the guard (see lib/http-headers.ts). This
  // is a routing hint only — it grants nothing.
  const forwardedHeaders = new Headers(req.headers);
  forwardedHeaders.set(REQUEST_PATHNAME_HEADER, pathname);
  const proceed = () => NextResponse.next({ request: { headers: forwardedHeaders } });

  if (isPublic(pathname) || pathname.startsWith("/api/")) {
    return proceed();
  }

  const guarded = pathname.startsWith(PLATFORM_PREFIX) || pathname.startsWith(APP_PREFIX);
  if (!guarded) return proceed();

  // Local sandbox (no Supabase configured) is explicitly NON-PRODUCTION and has
  // no server session to check; the UI labels itself accordingly.
  if (!supabaseConfigured()) return proceed();

  if (!hasAuthCookie(req)) {
    const url = req.nextUrl.clone();
    // Platform traffic goes to the platform sign-in, tenant traffic to /login.
    url.pathname = pathname.startsWith(PLATFORM_PREFIX) ? "/platform-admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Platform vs tenant separation is finally decided server-side, where the
  // user's platform_role can be read (a cookie cannot assert it).
  return proceed();
}

export const config = {
  matcher: ["/platform-admin/:path*", "/app/:path*"],
};
