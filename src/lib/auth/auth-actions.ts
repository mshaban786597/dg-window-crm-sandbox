import "server-only";

/**
 * Authentication server actions (§3, §4, §5, §14).
 *
 * All privileged decisions happen here, on the server:
 *   - public registration can ONLY ever create `tenant_owner` (§12)
 *   - invitation roles come from the stored invitation, never from the client
 *   - tenant ids are derived from memberships, never from request input
 *   - every security-sensitive outcome is written to the audit log
 */
import { cookies, headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  checkPassword,
  loginLimiter,
  registrationLimiter,
  inviteLimiter,
  normalizeEmail,
} from "./policy";
import {
  ACTIVE_TENANT_COOKIE,
  listActiveMemberships,
  getAuthenticatedUser,
  requireTenantRole,
  supabaseConfigured,
} from "./server-auth";
import type { AuditAction, TenantRole } from "@/lib/tenancy/types";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
}

// ── Audit (§14) ──────────────────────────────────────────────────
export interface AuditContext {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorMembershipId?: string;
  actorRole?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Best-effort request metadata. Never fails the caller. */
async function requestMeta(): Promise<{ ip?: string; ua?: string }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for") ?? "";
    return { ip: fwd.split(",")[0]?.trim() || undefined, ua: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

/**
 * Append an audit row. Auditing must never block or break the user-facing
 * operation, so failures are swallowed after being surfaced to server logs.
 */
export async function writeAudit(action: AuditAction | string, ctx: AuditContext = {}): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const supabase = await createServerSupabaseClient();
    const { ip, ua } = await requestMeta();
    await supabase.from("audit_logs").insert({
      tenant_id: ctx.tenantId ?? null,
      actor_user_id: ctx.actorUserId ?? null,
      actor_membership_id: ctx.actorMembershipId ?? null,
      actor_role: ctx.actorRole ?? null,
      action,
      entity_type: ctx.entityType ?? null,
      entity_id: ctx.entityId ?? null,
      metadata: ctx.metadata ?? null,
      ip_address: ip ?? null,
      user_agent: ua ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to record", action, e instanceof Error ? e.message : e);
  }
}

async function clientKey(fallback: string): Promise<string> {
  const { ip } = await requestMeta();
  return ip || fallback;
}

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "workspace";

// ── §3 Company registration ──────────────────────────────────────
export interface RegisterCompanyInput {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  company_name: string;
  company_phone: string;
  website?: string;
  country: string;
  state: string;
  timezone: string;
  accepted_terms: boolean;
  /** Client-generated key so a retried submit cannot create a second company. */
  idempotency_key?: string;
}

/**
 * Register a new company and its owner.
 *
 * The role is hardcoded to `tenant_owner` — there is no code path by which a
 * registration payload can request any other role, tenant or platform (§12).
 */
export async function registerCompany(input: RegisterCompanyInput): Promise<ActionResult<{ tenantId: string }>> {
  if (!supabaseConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Authentication is not configured on this deployment." };
  }
  if (!input.accepted_terms) {
    return { ok: false, code: "TERMS", error: "You must accept the Terms and Privacy Policy." };
  }

  const email = normalizeEmail(input.email);
  const limitKey = await clientKey(email);
  const limit = registrationLimiter.check(limitKey);
  if (!limit.allowed) {
    await writeAudit("security.rate_limited", { metadata: { flow: "register" } });
    return { ok: false, code: "RATE_LIMITED", error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const pw = checkPassword(input.password, { email, company: input.company_name });
  if (!pw.ok) return { ok: false, code: "WEAK_PASSWORD", error: pw.errors[0] };

  const supabase = await createServerSupabaseClient();

  // Idempotency: a retried submit for the same key returns the original tenant.
  if (input.idempotency_key) {
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("registration_key", input.idempotency_key)
      .maybeSingle();
    if (existing) return { ok: true, data: { tenantId: (existing as { id: string }).id } };
  }

  // 1. Create the auth user. Supabase sends the verification email.
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login?verified=1`,
      data: { first_name: input.first_name, last_name: input.last_name },
    },
  });
  if (signUpError || !signUp.user) {
    // Do not reveal whether the address is already registered (enumeration).
    return { ok: false, code: "SIGNUP_FAILED", error: "We could not create that account. Check your details and try again." };
  }
  const userId = signUp.user.id;

  // 2. Provision the workspace via a SECURITY DEFINER routine so the whole
  //    tenant + membership + settings creation is atomic and cannot be
  //    partially applied by a client-side failure.
  const { data: provisioned, error: provisionError } = await supabase.rpc("provision_tenant", {
    p_user_id: userId,
    p_email: email,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_company_name: input.company_name.trim(),
    p_slug: slugify(input.company_name),
    p_phone: input.company_phone,
    p_website: input.website ?? null,
    p_country: input.country,
    p_state: input.state,
    p_timezone: input.timezone,
    p_registration_key: input.idempotency_key ?? null,
  });

  if (provisionError || !provisioned) {
    await writeAudit("security.provision_failed", {
      actorUserId: userId,
      metadata: { error: provisionError?.message ?? "unknown" },
    });
    return { ok: false, code: "PROVISION_FAILED", error: "Your account was created but the workspace could not be set up. Please contact support." };
  }

  const tenantId = provisioned as string;
  await writeAudit("tenant.registered", {
    tenantId,
    actorUserId: userId,
    actorRole: "tenant_owner",
    entityType: "tenant",
    entityId: tenantId,
    metadata: { company: input.company_name },
  });

  return { ok: true, data: { tenantId } };
}

// ── §4 Client login ──────────────────────────────────────────────
export type LoginOutcome =
  | { kind: "workspace"; tenantId: string }
  | { kind: "choose_workspace"; workspaces: { id: string; name: string; role: TenantRole }[] }
  | { kind: "no_membership" }
  | { kind: "unverified" }
  | { kind: "platform_admin" };

export async function signIn(
  email: string,
  password: string
): Promise<ActionResult<LoginOutcome>> {
  if (!supabaseConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Authentication is not configured on this deployment." };
  }
  const normalized = normalizeEmail(email);
  const key = `${await clientKey("anon")}:${normalized}`;
  const limit = loginLimiter.check(key);
  if (!limit.allowed) {
    await writeAudit("auth.login_rate_limited", { metadata: { email: normalized } });
    return { ok: false, code: "RATE_LIMITED", error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });

  if (error || !data.user) {
    await writeAudit("auth.login_failed", { metadata: { email: normalized } });
    // Deliberately generic — never distinguishes "no such user" from "bad password".
    return { ok: false, code: "INVALID_CREDENTIALS", error: "Incorrect email or password." };
  }
  loginLimiter.reset(key);

  const user = await getAuthenticatedUser();
  await writeAudit("auth.login_succeeded", { actorUserId: data.user.id });

  if (!user || !user.email_verified) {
    return { ok: true, data: { kind: "unverified" } };
  }
  if (user.platform_role === "platform_super_admin") {
    // Platform admins do not enter a tenant workspace from /login.
    return { ok: true, data: { kind: "platform_admin" } };
  }

  const workspaces = await listActiveMemberships(user.id);
  if (workspaces.length === 0) return { ok: true, data: { kind: "no_membership" } };

  if (workspaces.length === 1) {
    await setActiveTenantCookie(workspaces[0].tenant.id);
    return { ok: true, data: { kind: "workspace", tenantId: workspaces[0].tenant.id } };
  }
  return {
    ok: true,
    data: {
      kind: "choose_workspace",
      workspaces: workspaces.map((w) => ({ id: w.tenant.id, name: w.tenant.name, role: w.membership.role })),
    },
  };
}

/** Set the workspace hint cookie. Membership is re-verified on every request. */
export async function setActiveTenantCookie(tenantId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

/** Switch workspace — only ever succeeds for a verified membership (§4). */
export async function switchWorkspace(tenantId: string): Promise<ActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", error: "Sign in first." };
  const workspaces = await listActiveMemberships(user.id);
  if (!workspaces.some((w) => w.tenant.id === tenantId)) {
    await writeAudit("security.cross_tenant_attempt", {
      actorUserId: user.id,
      metadata: { attempted_tenant: tenantId },
    });
    return { ok: false, code: "FORBIDDEN", error: "You do not have access to that workspace." };
  }
  await setActiveTenantCookie(tenantId);
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const user = await getAuthenticatedUser();
    await supabase.auth.signOut();
    if (user) await writeAudit("auth.session_revoked", { actorUserId: user.id });
  }
  const jar = await cookies();
  jar.delete(ACTIVE_TENANT_COOKIE);
}

/** Sign out everywhere (§10 logout from all devices). */
export async function signOutAllDevices(): Promise<ActionResult> {
  if (!supabaseConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
  const supabase = await createServerSupabaseClient();
  const user = await getAuthenticatedUser();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: error.message };
  if (user) await writeAudit("auth.session_revoked", { actorUserId: user.id, metadata: { scope: "global" } });
  const jar = await cookies();
  jar.delete(ACTIVE_TENANT_COOKIE);
  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  if (!supabaseConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
  const normalized = normalizeEmail(email);
  const supabase = await createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reset-password`,
  });
  await writeAudit("auth.password_reset_requested", { metadata: { email: normalized } });
  // Always report success so the endpoint cannot enumerate accounts.
  return { ok: true };
}

// ── §5 Invitations ───────────────────────────────────────────────
export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: TenantRole;
  manager_membership_id?: string;
  job_title?: string;
  department?: string;
}

/**
 * Create an invitation. Only owners/admins may invite, and only roles they are
 * permitted to grant. The raw token is returned ONCE for delivery by email and
 * is never persisted — only its hash is stored (§5).
 */
export async function createInvitation(
  input: CreateInvitationInput
): Promise<ActionResult<{ token: string; invitationId: string }>> {
  const ctx = await requireTenantRole(input.tenantId, ["tenant_owner", "tenant_admin"]);
  const { assignableRoles } = await import("./server-auth");
  if (!assignableRoles(ctx.membership.role).includes(input.role)) {
    return { ok: false, code: "FORBIDDEN_ROLE", error: `You may not grant the ${input.role} role.` };
  }

  const email = normalizeEmail(input.email);
  const token = generateToken();
  const token_hash = await hashToken(token);
  const expires = new Date(Date.now() + 7 * 86400_000).toISOString();

  const supabase = await createServerSupabaseClient();

  // Supersede any live invitation for the same address so only one token works.
  await supabase
    .from("tenant_invitations")
    .update({ status: "revoked" })
    .eq("tenant_id", input.tenantId)
    .eq("email", email)
    .eq("status", "pending");

  const { data, error } = await supabase
    .from("tenant_invitations")
    .insert({
      tenant_id: input.tenantId,
      email,
      role: input.role,
      manager_membership_id: input.manager_membership_id ?? null,
      token_hash,
      status: "pending",
      invited_by_user_id: ctx.user.id,
      expires_at: expires,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, code: "INSERT_FAILED", error: "Could not create the invitation." };

  await writeAudit("user.invited", {
    tenantId: input.tenantId,
    actorUserId: ctx.user.id,
    actorMembershipId: ctx.membership.id,
    actorRole: ctx.membership.role,
    entityType: "invitation",
    entityId: (data as { id: string }).id,
    metadata: { email, role: input.role },
  });

  return { ok: true, data: { token, invitationId: (data as { id: string }).id } };
}

export interface InvitationPreview {
  company: string;
  role: TenantRole;
  invitedBy: string;
  email: string;
}

/**
 * Resolve an invitation token for display (§15 shows company/role/inviter).
 * Only non-sensitive presentation fields are returned — no tenant records, no
 * secrets, and nothing that identifies other members.
 */
export async function previewInvitation(rawToken: string): Promise<ActionResult<InvitationPreview>> {
  if (!supabaseConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
  const limit = inviteLimiter.check(await clientKey("anon"));
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED", error: "Too many attempts." };

  const token_hash = await hashToken(rawToken);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("preview_invitation", { p_token_hash: token_hash });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { company: string; role: TenantRole; invited_by: string; email: string; status: string; expired: boolean }
    | undefined;

  if (!row) return { ok: false, code: "INVALID", error: "This invitation link is not valid." };
  if (row.status === "accepted") return { ok: false, code: "ALREADY_USED", error: "This invitation has already been used." };
  if (row.status === "revoked") return { ok: false, code: "REVOKED", error: "This invitation is no longer valid." };
  if (row.expired) return { ok: false, code: "EXPIRED", error: "This invitation has expired." };

  return {
    ok: true,
    data: { company: row.company, role: row.role, invitedBy: row.invited_by, email: row.email },
  };
}

/**
 * Accept an invitation.
 *
 * The membership's tenant and role come from the STORED invitation, never from
 * the request. The signed-in account's email must match the invited address, so
 * an invitation cannot be transferred or redeemed into another tenant (§5).
 */
export async function acceptInvitation(rawToken: string): Promise<ActionResult<{ tenantId: string }>> {
  if (!supabaseConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
  const limit = inviteLimiter.check(await clientKey("anon"));
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED", error: "Too many attempts." };

  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, code: "UNAUTHENTICATED", error: "Sign in or create an account to accept." };

  const token_hash = await hashToken(rawToken);
  const supabase = await createServerSupabaseClient();

  // Single SECURITY DEFINER routine performs validate → activate → consume
  // atomically, so a token cannot be redeemed twice by concurrent requests.
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token_hash: token_hash,
    p_user_id: user.id,
    p_user_email: normalizeEmail(user.email),
  });

  const result = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; code: string; tenant_id: string | null }
    | undefined;

  if (error || !result || !result.ok) {
    const code = result?.code ?? "INVALID";
    await writeAudit("security.invitation_rejected", {
      actorUserId: user.id,
      metadata: { code },
    });
    const messages: Record<string, string> = {
      EXPIRED: "This invitation has expired.",
      ALREADY_USED: "This invitation has already been used.",
      REVOKED: "This invitation is no longer valid.",
      EMAIL_MISMATCH: "This invitation was sent to a different email address.",
      INVALID: "This invitation link is not valid.",
    };
    return { ok: false, code, error: messages[code] ?? messages.INVALID };
  }

  const tenantId = result.tenant_id as string;
  await setActiveTenantCookie(tenantId);
  await writeAudit("user.invitation_accepted", {
    tenantId,
    actorUserId: user.id,
    entityType: "invitation",
    metadata: { email: user.email },
  });
  return { ok: true, data: { tenantId } };
}
