"use server";

/**
 * Server Action surface for the authentication UI (§3, §4, §5, §15).
 *
 * These are deliberately THIN. Every privileged decision — which role a
 * registration creates, which tenant a login may enter, which role an
 * invitation grants — is made inside `@/lib/auth/*`, never here and never in
 * the browser. This module only:
 *
 *   1. accepts plain, serialisable arguments from client components,
 *   2. forwards them to the authoritative server module,
 *   3. normalises thrown `AuthError`s into the `{ok, error?, code?, data?}`
 *      shape the UI already understands.
 *
 * Client components MUST call the product through these actions: importing
 * `@/lib/auth/auth-actions` directly into a client bundle is blocked by
 * `server-only`.
 *
 * NOTE: a `"use server"` module may only export async functions, so the shared
 * result and outcome types live in `@/lib/auth/auth-actions` and are pulled in
 * by the pages with `import type` — erased at compile time, so no server-only
 * code ever reaches the client bundle.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  acceptInvitation,
  previewInvitation,
  registerCompany,
  requestPasswordReset,
  signIn,
  signOut,
  switchWorkspace,
  writeAudit,
  type ActionResult,
  type InvitationPreview,
  type LoginOutcome,
  type RegisterCompanyInput,
} from "@/lib/auth/auth-actions";
import { AuthError, getAuthenticatedUser, supabaseConfigured } from "@/lib/auth/server-auth";
import { checkPassword, normalizeEmail } from "@/lib/auth/policy";

// ── Error normalisation ──────────────────────────────────────────

/** Stable, UI-facing code for an authorization failure. */
function codeForAuthError(error: AuthError): string {
  if (error.message === "MFA_REQUIRED") return "MFA_REQUIRED";
  if (error.status === 401) return "UNAUTHENTICATED";
  if (error.status === 403) return "FORBIDDEN";
  return "NOT_FOUND";
}

/**
 * Convert anything thrown by the auth layer into an `ActionResult`.
 * Unexpected errors are logged server-side and reported generically so an
 * internal failure can never become an information-disclosure channel.
 */
function toFailure(error: unknown): ActionResult<never> {
  if (error instanceof AuthError) {
    return { ok: false, code: codeForAuthError(error), error: error.message };
  }
  console.error("[auth-action] unexpected failure", error);
  return {
    ok: false,
    code: "UNEXPECTED",
    error: "Something went wrong. Please try again.",
  };
}

const notConfigured = (): ActionResult<never> => ({
  ok: false,
  code: "NOT_CONFIGURED",
  error: "Authentication is not configured on this deployment.",
});

// ── §3 Registration ──────────────────────────────────────────────

/**
 * Register a company and its first user.
 *
 * The role is fixed to `tenant_owner` by `registerCompany`; no role travels in
 * this payload and none would be honoured if it did (§12).
 */
export async function registerCompanyAction(
  input: RegisterCompanyInput
): Promise<ActionResult<{ tenantId: string }>> {
  try {
    return await registerCompany(input);
  } catch (error) {
    return toFailure(error);
  }
}

// ── §4 Login ─────────────────────────────────────────────────────

export async function signInAction(
  email: string,
  password: string
): Promise<ActionResult<LoginOutcome>> {
  try {
    return await signIn(email, password);
  } catch (error) {
    return toFailure(error);
  }
}

/** Choose the active workspace. Membership is re-verified server-side. */
export async function switchWorkspaceAction(tenantId: string): Promise<ActionResult> {
  try {
    return await switchWorkspace(tenantId);
  } catch (error) {
    return toFailure(error);
  }
}

export async function signOutAction(): Promise<ActionResult> {
  try {
    await signOut();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Minimal, non-sensitive description of the current visitor.
 * Used by the invitation page to decide between "accept" and "sign in first".
 */
export async function getViewerAction(): Promise<
  ActionResult<{ signedIn: boolean; email: string | null }>
> {
  try {
    if (!supabaseConfigured()) return notConfigured();
    const user = await getAuthenticatedUser();
    return { ok: true, data: { signedIn: Boolean(user), email: user?.email ?? null } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Password reset (§10) ─────────────────────────────────────────

/**
 * Request a reset link.
 *
 * Always succeeds from the caller's point of view (except when the deployment
 * is unconfigured) so the endpoint cannot be used to discover which addresses
 * have accounts.
 */
export async function requestPasswordResetAction(email: string): Promise<ActionResult> {
  try {
    return await requestPasswordReset(email);
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Exchange the `?code=` on a recovery link for a session so the visitor may set
 * a new password. Failure is reported generically — a bad or replayed code
 * looks the same as an expired one.
 */
export async function exchangeRecoveryCodeAction(code: string): Promise<ActionResult> {
  try {
    if (!supabaseConfigured()) return notConfigured();
    if (!code) {
      return { ok: false, code: "INVALID_LINK", error: "This reset link is not valid." };
    }
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return {
        ok: false,
        code: "INVALID_LINK",
        error: "This reset link is no longer valid. Request a new one.",
      };
    }
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Set a new password for the recovery session.
 * The policy is re-checked here; the client-side check is only a convenience.
 */
export async function updatePasswordAction(password: string): Promise<ActionResult> {
  try {
    if (!supabaseConfigured()) return notConfigured();

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        error: "This reset link is no longer valid. Request a new one.",
      };
    }

    const check = checkPassword(password, { email: user.email ?? undefined });
    if (!check.ok) {
      return { ok: false, code: "WEAK_PASSWORD", error: check.errors[0] };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return {
        ok: false,
        code: "UPDATE_FAILED",
        error: "We could not update your password. Request a new reset link and try again.",
      };
    }
    await writeAudit("auth.password_changed", { actorUserId: user.id });
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── §5 Invitations ───────────────────────────────────────────────

/** Company / role / inviter for display. Returns nothing else about the tenant. */
export async function previewInvitationAction(
  token: string
): Promise<ActionResult<InvitationPreview>> {
  try {
    return await previewInvitation(token);
  } catch (error) {
    return toFailure(error);
  }
}

/** Redeem an invitation for the signed-in account. */
export async function acceptInvitationAction(
  token: string
): Promise<ActionResult<{ tenantId: string }>> {
  try {
    return await acceptInvitation(token);
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Create an account for an invited address and redeem the invitation.
 *
 * The email is read from the STORED invitation, never from the request body —
 * an invitation therefore cannot be redirected to another address by editing
 * the form (§5). Only the name and password come from the visitor.
 */
export async function signUpForInvitationAction(
  token: string,
  input: { first_name: string; last_name: string; password: string }
): Promise<ActionResult<{ tenantId: string | null; verificationRequired: boolean }>> {
  try {
    if (!supabaseConfigured()) return notConfigured();

    // The invitation is the source of truth for the address and its validity.
    const preview = await previewInvitation(token);
    if (!preview.ok || !preview.data) {
      return { ok: false, code: preview.code ?? "INVALID", error: preview.error };
    }
    const email = normalizeEmail(preview.data.email);

    const check = checkPassword(input.password, {
      email,
      company: preview.data.company,
    });
    if (!check.ok) return { ok: false, code: "WEAK_PASSWORD", error: check.errors[0] };

    const first_name = input.first_name.trim();
    const last_name = input.last_name.trim();
    if (!first_name || !last_name) {
      return { ok: false, code: "NAME_REQUIRED", error: "First and last name are required." };
    }

    const supabase = await createServerSupabaseClient();
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite/${encodeURIComponent(token)}`,
        data: { first_name, last_name },
      },
    });

    if (signUpError || !signUp.user) {
      // Never distinguishes "already registered" from any other failure.
      return {
        ok: false,
        code: "SIGNUP_FAILED",
        error:
          "We could not create that account. If you already have one, sign in to accept the invitation.",
      };
    }

    // Email confirmation is on: no session yet, so the invitation stays
    // pending until the address is verified and the link is reopened.
    if (!signUp.session) {
      return { ok: true, data: { tenantId: null, verificationRequired: true } };
    }

    // Keep the profile row in step with the new auth user before redeeming.
    await supabase
      .from("app_users")
      .upsert({ id: signUp.user.id, email, first_name, last_name, email_verified: true },
        { onConflict: "id" });

    const accepted = await acceptInvitation(token);
    if (!accepted.ok || !accepted.data) {
      return { ok: false, code: accepted.code ?? "INVALID", error: accepted.error };
    }
    return { ok: true, data: { tenantId: accepted.data.tenantId, verificationRequired: false } };
  } catch (error) {
    return toFailure(error);
  }
}
