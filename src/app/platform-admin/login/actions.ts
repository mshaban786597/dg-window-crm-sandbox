"use server";

/**
 * Platform administrator sign-in Server Actions (§2, §10, §13, §16).
 *
 * Design rules enforced here:
 *   - The client NEVER asserts a role. After the password check succeeds the
 *     `platform_role` is re-read from the database on the server.
 *   - A non-platform account that authenticates correctly is signed straight
 *     back out, so no half-authenticated session is left behind, and the caller
 *     receives the same generic message as a wrong password.
 *   - MFA is mandatory: a password alone never reaches `/platform-admin`, which
 *     is independently re-checked by `requirePlatformAdmin()` in the layout.
 *   - Every outcome is audited. Only the one-time TOTP enrolment material is
 *     ever returned to the browser; access/refresh tokens never are.
 */

import { signIn, signOut, writeAudit } from "@/lib/auth/auth-actions";
import {
  getAuthenticatedUser,
  platformAdminMFAStatus,
  supabaseConfigured,
} from "@/lib/auth/server-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  PlatformMfaEnrolResult,
  PlatformMfaStatusResult,
  PlatformMfaVerifyResult,
  PlatformSignInResult,
} from "./types";

/** One message for every rejection — never confirms an address or a role (§8). */
const GENERIC_FAILURE = "Invalid credentials.";
const NOT_CONFIGURED = "Authentication is not configured on this deployment.";
const PLATFORM_ROLE = "platform_super_admin";

/**
 * The signed-in user, but only if they really are a platform super admin with a
 * verified email. Returns null for everyone else — callers must not distinguish.
 */
async function currentPlatformAdmin() {
  const user = await getAuthenticatedUser();
  if (!user || !user.email_verified || user.platform_role !== PLATFORM_ROLE) return null;
  return user;
}

// ── Step 1: password ─────────────────────────────────────────────
export async function platformSignInAction(
  email: string,
  password: string
): Promise<PlatformSignInResult> {
  if (!supabaseConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", error: NOT_CONFIGURED };
  }

  const outcome = await signIn(email, password);

  if (!outcome.ok || !outcome.data) {
    await writeAudit("auth.login_failed", {
      metadata: { area: "platform", reason: outcome.code ?? "INVALID_CREDENTIALS" },
    });
    if (outcome.code === "RATE_LIMITED") {
      return { ok: false, code: "RATE_LIMITED", error: outcome.error ?? "Too many attempts." };
    }
    if (outcome.code === "NOT_CONFIGURED") {
      return { ok: false, code: "NOT_CONFIGURED", error: NOT_CONFIGURED };
    }
    return { ok: false, code: "INVALID_CREDENTIALS", error: GENERIC_FAILURE };
  }

  // Authoritative re-check: the credentials were valid, but do they belong to a
  // platform administrator? `signIn` may report `platform_admin`, `workspace`,
  // `unverified`, … — none of that is trusted here.
  const admin = await currentPlatformAdmin();
  if (!admin) {
    const impostor = await getAuthenticatedUser();
    // Audit BEFORE tearing the session down — the insert runs under the
    // caller's session and would be rejected once it is gone.
    await writeAudit("auth.login_failed", {
      actorUserId: impostor?.id ?? null,
      metadata: { area: "platform", reason: "NOT_PLATFORM_ADMIN" },
    });
    // Never leave a usable, partially-authenticated session on this screen.
    await signOut();
    return { ok: false, code: "INVALID_CREDENTIALS", error: GENERIC_FAILURE };
  }

  await writeAudit("auth.login_succeeded", {
    actorUserId: admin.id,
    actorRole: PLATFORM_ROLE,
    metadata: { area: "platform" },
  });

  const status = await platformAdminMFAStatus();
  return {
    ok: true,
    next: status.verified ? "authorized" : status.enrolled ? "mfa_challenge" : "mfa_enroll",
  };
}

// ── Step 2a: where is this session in the MFA lifecycle? ──────────
export async function platformMfaStatusAction(): Promise<PlatformMfaStatusResult> {
  if (!supabaseConfigured()) {
    return { ok: false, enrolled: false, verified: false, error: NOT_CONFIGURED };
  }
  // Resuming an MFA step still requires a real platform session (the layout
  // redirects here with ?mfa=1 once the password step is already behind us).
  if (!(await currentPlatformAdmin())) {
    return { ok: false, enrolled: false, verified: false, error: GENERIC_FAILURE };
  }
  const status = await platformAdminMFAStatus();
  return { ok: true, enrolled: status.enrolled, verified: status.verified };
}

// ── Step 2b: enrol a TOTP factor ─────────────────────────────────
export async function enrollMfaAction(): Promise<PlatformMfaEnrolResult> {
  if (!supabaseConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const admin = await currentPlatformAdmin();
  if (!admin) return { ok: false, error: GENERIC_FAILURE };

  const supabase = await createServerSupabaseClient();

  // Discard abandoned, never-verified factors first. Without this, a retried
  // enrolment accumulates dead factors and can collide on friendly names.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Window CRM Platform",
  });
  if (error || !data) {
    // Do not surface the provider message — it can describe account internals.
    return { ok: false, error: "Could not start authenticator enrolment. Please try again." };
  }

  await writeAudit("auth.mfa_enrolment_started", {
    actorUserId: admin.id,
    actorRole: PLATFORM_ROLE,
    metadata: { area: "platform", factor_id: data.id },
  });

  // Only the enrolment material the operator must scan/type leaves the server.
  return {
    ok: true,
    data: { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret },
  };
}

// ── Step 3: challenge + verify ───────────────────────────────────
export async function verifyMfaAction(
  factorId: string,
  code: string
): Promise<PlatformMfaVerifyResult> {
  if (!supabaseConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const admin = await currentPlatformAdmin();
  if (!admin) return { ok: false, error: GENERIC_FAILURE };

  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }

  const supabase = await createServerSupabaseClient();

  // The enrolment step knows its brand-new factor id. The plain challenge step
  // does not, so the already-verified TOTP factor is resolved here rather than
  // trusting the browser to name one.
  let targetFactorId = factorId;
  if (!targetFactorId) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    targetFactorId = factors?.totp?.[0]?.id ?? "";
  }
  if (!targetFactorId) {
    return { ok: false, error: "No authenticator is registered for this account." };
  }

  const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: targetFactorId });
  if (!challenge) {
    return { ok: false, error: "Could not start the verification challenge. Please try again." };
  }

  // On success Supabase rotates the session to AAL2 and the SSR client writes
  // the new cookies. The tokens themselves are deliberately not touched here.
  const { error } = await supabase.auth.mfa.verify({
    factorId: targetFactorId,
    challengeId: challenge.id,
    code: normalized,
  });

  if (error) {
    await writeAudit("auth.mfa_failed", {
      actorUserId: admin.id,
      actorRole: PLATFORM_ROLE,
      metadata: { area: "platform" },
    });
    return { ok: false, error: "That code is not valid. Try the next code from your app." };
  }

  await writeAudit("auth.mfa_verified", {
    actorUserId: admin.id,
    actorRole: PLATFORM_ROLE,
    metadata: { area: "platform" },
  });
  return { ok: true };
}
