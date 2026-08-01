/**
 * Platform administrator sign-in (§2, §10, §13, §15, §16).
 *
 * ─────────────────────────────────────────────────────────────────
 * OPERATOR FLOW — bootstrap → sign in → enrol MFA → verify
 * ─────────────────────────────────────────────────────────────────
 *
 * 1. BOOTSTRAP (once, off-app, on a trusted machine)
 *    a. The person who will hold the role creates an ordinary account and
 *       verifies their email address (or is invited from the Supabase
 *       dashboard). Nothing here grants platform access.
 *    b. Set `PLATFORM_ADMIN_EMAIL` and `SUPABASE_SERVICE_ROLE_KEY` in the server
 *       environment and run `npm run bootstrap:platform-admin`.
 *       That script is the ONLY sanctioned path to `platform_super_admin`; no
 *       screen, form or API in this application can grant the role, and this
 *       page deliberately has no registration or "create account" affordance.
 *
 * 2. SIGN IN (this page, `/platform-admin/login`)
 *    Email + password are posted to `platformSignInAction`. The server checks
 *    the password, then RE-READS `platform_role` from the database. Anyone who
 *    is not `platform_super_admin` is signed straight back out and receives the
 *    same generic "Invalid credentials." as a wrong password — the screen never
 *    confirms that an address exists or that it lacks the role.
 *
 * 3. ENROL MFA (first sign-in only)
 *    With no TOTP factor on the account, `enrollMfaAction` issues one and the
 *    page shows the setup key and `otpauth://` URI exactly once. The operator
 *    adds it to an authenticator app and submits the 6-digit code.
 *
 * 4. VERIFY (every sign-in)
 *    `verifyMfaAction` runs challenge + verify, which raises the session to
 *    AAL2 and writes an `auth.mfa_verified` audit row. Only then does the
 *    browser move to `/platform-admin`, where `requirePlatformAdmin()` in the
 *    layout independently re-checks role AND MFA before any markup is rendered.
 *    MFA is mandatory: a password alone never opens the console.
 *
 * RECOVERY: a lost authenticator is resolved out-of-band by unenrolling the
 * factor with the service-role key. There is no self-service MFA reset here.
 * ─────────────────────────────────────────────────────────────────
 *
 * This route is public by design (see `PUBLIC_PATHS` in `src/middleware.ts`)
 * and is the one path under `/platform-admin` that the layout guard lets
 * through — otherwise the guard would redirect the sign-in page to itself.
 */

import type { Metadata } from "next";
import { supabaseConfigured } from "@/lib/auth/server-auth";
import { PlatformLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Window CRM Platform Administration",
  robots: { index: false, follow: false },
};

interface PlatformAdminLoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlatformAdminLoginPage({
  searchParams,
}: PlatformAdminLoginPageProps) {
  const params = await searchParams;
  const raw = params.mfa;
  // `?mfa=1` means the layout bounced an authenticated-but-unverified session
  // back here; the form resumes at the MFA step instead of asking for a
  // password that has already been accepted.
  const resumeMfa = (Array.isArray(raw) ? raw[0] : raw) === "1";

  // Same call the layout makes, so the sign-in screen and the guard can never
  // disagree about which gate is in force.
  return <PlatformLoginForm resumeMfa={resumeMfa} sandboxFallback={!supabaseConfigured()} />;
}
