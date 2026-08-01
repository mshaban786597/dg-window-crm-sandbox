/**
 * Platform Super Admin gate (§2, §3, §10, §13, §15–§17).
 *
 * A SERVER component. `requirePlatformAdmin()` runs BEFORE any markup exists,
 * so an unauthorized caller never receives the console shell, the platform
 * navigation, or a single byte of tenant data — not even briefly.
 *
 * Outcomes:
 *   401                        → /platform-admin/login
 *   403 "MFA_REQUIRED"         → /platform-admin/login?mfa=1
 *   any other 403 (or a
 *   non-AuthError failure)     → bare "Access denied" page, no nav, no data
 *   pass                       → the client shell, with `children` inside
 *
 * This layout is the authoritative UI guard, but it is not the only one:
 * middleware rejects obviously unauthenticated traffic first, and Postgres RLS
 * plus per-page server checks remain in force underneath it.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AuthError,
  requirePlatformAdmin,
  supabaseConfigured,
} from "@/lib/auth/server-auth";
import { REQUEST_PATHNAME_HEADER } from "@/lib/http-headers";
import type { PlatformUser } from "@/lib/tenancy/types";
import { PlatformAccessDenied } from "./access-denied";
import { PlatformAdminShell } from "./platform-admin-shell";
import { PlatformAdminSandboxGate } from "./sandbox-gate";

const LOGIN_PATH = "/platform-admin/login";

/** What the guard decided. `redirect()` is called outside the try/catch. */
type GateOutcome = "authorized" | "needs_login" | "needs_mfa" | "denied";

function classify(thrown: unknown): GateOutcome {
  if (thrown instanceof AuthError) {
    if (thrown.status === 401) return "needs_login";
    if (thrown.status === 403 && thrown.message === "MFA_REQUIRED") return "needs_mfa";
  }
  // Everything else — other 403s, 404s, unexpected errors — fails closed.
  return "denied";
}

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The platform sign-in page lives under this segment, so it would otherwise
  // be redirected to itself. Middleware publishes the pathname for this single
  // routing decision; it confers no access (see lib/http-headers.ts).
  const pathname = (await headers()).get(REQUEST_PATHNAME_HEADER) ?? "";
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return <>{children}</>;
  }

  // NON-PRODUCTION: without Supabase there is no server session to verify, so
  // local development falls back to the browser-side sandbox gate. That path is
  // labelled in the UI and must never be relied on as a security boundary.
  if (!supabaseConfigured()) {
    return <PlatformAdminSandboxGate>{children}</PlatformAdminSandboxGate>;
  }

  let user: PlatformUser | null = null;
  let outcome: GateOutcome = "denied";
  try {
    user = await requirePlatformAdmin();
    outcome = "authorized";
  } catch (thrown) {
    outcome = classify(thrown);
  }

  // `redirect()` signals by throwing, so it must not run inside the try above.
  if (outcome === "needs_login") redirect(LOGIN_PATH);
  if (outcome === "needs_mfa") redirect(`${LOGIN_PATH}?mfa=1`);
  if (outcome !== "authorized" || !user) return <PlatformAccessDenied />;

  return (
    <PlatformAdminShell
      mode="server"
      user={{ first_name: user.first_name, last_name: user.last_name, email: user.email }}
    >
      {children}
    </PlatformAdminShell>
  );
}
