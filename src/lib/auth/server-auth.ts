import "server-only";

/**
 * Server-side authentication & authorization helpers (§6, §8).
 *
 * These are the ONLY sanctioned way for server code to learn who the caller is
 * and which tenant they may touch. Every one of them fails closed.
 *
 * Hard rules enforced here:
 *   - `tenant_id` is NEVER taken from request input. It is derived from the
 *     authenticated user's membership, or validated against it.
 *   - A tenant id supplied by the client is only ever used to *look up* a
 *     membership; it can never widen access.
 *   - Suspended/cancelled tenants and inactive/unaccepted memberships are
 *     treated as "no access" everywhere.
 */
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseConfigured as supabaseEnvConfigured } from "@/lib/supabase/env";
import type {
  PlatformUser,
  Tenant,
  TenantMembership,
  TenantRole,
} from "@/lib/tenancy/types";

export const ACTIVE_TENANT_COOKIE = "dg_active_tenant";

/** HTTP-shaped authorization failure (§8: 401 / 403 / 404). */
export class AuthError extends Error {
  status: 401 | 403 | 404;
  constructor(message: string, status: 401 | 403 | 404) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export const unauthenticated = () => new AuthError("Authentication required", 401);
export const forbidden = (msg = "Not permitted") => new AuthError(msg, 403);
/** Used where confirming existence would itself leak data (§8). */
export const notFound = () => new AuthError("Not found", 404);

export function supabaseConfigured(): boolean {
  return supabaseEnvConfigured();
}

// ── §6 getAuthenticatedUser ──────────────────────────────────────
/** The authenticated user's profile, or null. Never throws. */
export async function getAuthenticatedUser(): Promise<PlatformUser | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("app_users").select("*").eq("id", user.id).maybeSingle();
  if (!data) return null;
  return data as PlatformUser;
}

export async function requireAuthenticatedUser(): Promise<PlatformUser> {
  const user = await getAuthenticatedUser();
  if (!user) throw unauthenticated();
  // Unverified emails may authenticate but may not use the product (§4).
  if (!user.email_verified) throw forbidden("Email verification required");
  return user;
}

// ── §6 getActiveMembership ───────────────────────────────────────
export interface ActiveMembership {
  user: PlatformUser;
  tenant: Tenant;
  membership: TenantMembership;
}

/** All usable memberships: active + accepted + tenant not suspended/cancelled. */
export async function listActiveMemberships(
  userId: string
): Promise<{ tenant: Tenant; membership: TenantMembership }[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("tenant_memberships")
    .select("*, tenants(*)")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("invitation_status", "accepted");

  return ((data ?? []) as unknown as (TenantMembership & { tenants: Tenant | null })[])
    .filter((row) => row.tenants && !["suspended", "cancelled"].includes(row.tenants.status))
    .map((row) => ({ tenant: row.tenants as Tenant, membership: row }));
}

/**
 * Resolve the caller's active workspace.
 *
 * The tenant cookie is a *hint only*: it is matched against the user's real
 * memberships. A forged or stale cookie can never grant access — worst case it
 * is ignored (§4).
 */
export async function getActiveMembership(): Promise<ActiveMembership | null> {
  const user = await getAuthenticatedUser();
  if (!user || !user.email_verified) return null;

  const workspaces = await listActiveMemberships(user.id);
  if (workspaces.length === 0) return null;

  const jar = await cookies();
  const hinted = jar.get(ACTIVE_TENANT_COOKIE)?.value;
  const chosen =
    workspaces.find((w) => w.tenant.id === hinted) ??
    (workspaces.length === 1 ? workspaces[0] : undefined);

  if (!chosen) return null; // ambiguous → caller must pick a workspace
  return { user, tenant: chosen.tenant, membership: chosen.membership };
}

// ── §6 requireTenantMembership ───────────────────────────────────
/**
 * Require an active membership in `tenantId`.
 * If `tenantId` is omitted the caller's current workspace is used.
 */
export async function requireTenantMembership(tenantId?: string): Promise<ActiveMembership> {
  const user = await requireAuthenticatedUser();
  const workspaces = await listActiveMemberships(user.id);

  if (tenantId) {
    const match = workspaces.find((w) => w.tenant.id === tenantId);
    // Do not disclose whether the tenant exists at all.
    if (!match) throw notFound();
    return { user, tenant: match.tenant, membership: match.membership };
  }

  const active = await getActiveMembership();
  if (!active) throw forbidden("No active workspace");
  return active;
}

// ── §6 requireTenantRole ─────────────────────────────────────────
export async function requireTenantRole(
  tenantId: string,
  allowedRoles: readonly TenantRole[]
): Promise<ActiveMembership> {
  const ctx = await requireTenantMembership(tenantId);
  if (!allowedRoles.includes(ctx.membership.role)) {
    throw forbidden(`Requires one of: ${allowedRoles.join(", ")}`);
  }
  return ctx;
}

// ── §6 requirePlatformAdmin ──────────────────────────────────────
/**
 * Platform super admin only. No tenant role can satisfy this — the check reads
 * `platform_role` from the database, which is not self-assignable (§2, §12).
 * MFA is mandatory for this role (§2, §10).
 */
export async function requirePlatformAdmin(): Promise<PlatformUser> {
  const user = await requireAuthenticatedUser();
  if (user.platform_role !== "platform_super_admin") {
    throw forbidden("Platform administrator access required");
  }
  if (!(await hasVerifiedMFA())) {
    throw forbidden("MFA_REQUIRED");
  }
  return user;
}

/**
 * True when the current Supabase session has completed an MFA (AAL2) challenge.
 * Returns false when the provider has no MFA support configured.
 */
export async function hasVerifiedMFA(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal2";
}

/** Whether the platform admin still needs to enrol/verify MFA. */
export async function platformAdminMFAStatus(): Promise<{
  enrolled: boolean;
  verified: boolean;
}> {
  if (!supabaseConfigured()) return { enrolled: false, verified: false };
  const supabase = await createServerSupabaseClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolled = Boolean(factors?.totp?.some((f) => f.status === "verified"));
  return { enrolled, verified: await hasVerifiedMFA() };
}

// ── §6 canAccessTenantRecord ─────────────────────────────────────
/**
 * Does `userId` have an active membership in `tenantId`?
 * Used for defence-in-depth checks alongside RLS.
 */
export async function canAccessTenantRecord(
  userId: string,
  tenantId: string
): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("tenant_memberships")
    .select("id, tenants!inner(status)")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .eq("invitation_status", "accepted")
    .maybeSingle();
  if (!data) return false;
  const status = (data as unknown as { tenants?: { status?: string } }).tenants?.status;
  return status !== "suspended" && status !== "cancelled";
}

/**
 * Assert a fetched row belongs to the caller's tenant.
 * Throws 404 (not 403) so another tenant's record ids stay unenumerable (§8).
 */
export function assertRecordInTenant<T extends { tenant_id?: string | null }>(
  row: T | null | undefined,
  tenantId: string
): T {
  if (!row || !row.tenant_id || row.tenant_id !== tenantId) throw notFound();
  return row;
}

// ── §6 canManageMembership ───────────────────────────────────────
/**
 * May `actor` modify `target`? Encodes the §12 role-assignment rules:
 *   - same tenant only
 *   - owner may manage anyone; admin may manage all except the owner
 *   - manager may manage only their direct reports
 *   - nobody may modify their own membership (no self-promotion)
 */
export function canManageMembership(
  actor: TenantMembership,
  target: TenantMembership
): boolean {
  if (actor.tenant_id !== target.tenant_id) return false;
  if (!actor.active || actor.invitation_status !== "accepted") return false;
  if (actor.id === target.id) return false; // no self-service role changes

  switch (actor.role) {
    case "tenant_owner":
      return true;
    case "tenant_admin":
      return target.role !== "tenant_owner";
    case "manager":
      return target.manager_membership_id === actor.id;
    default:
      return false;
  }
}

/**
 * Roles an actor is allowed to grant (§12).
 * `platform_super_admin` is not a tenant role and can never appear here.
 */
export function assignableRoles(actorRole: TenantRole): TenantRole[] {
  switch (actorRole) {
    case "tenant_owner":
      return [
        "tenant_admin",
        "manager",
        "sales_representative",
        "estimator",
        "crew",
        "marketing",
        "accountant",
        "read_only",
      ];
    case "tenant_admin":
      // An admin may not mint owners, and may not create other admins unless
      // the owner has explicitly delegated it (handled by a settings flag).
      return [
        "manager",
        "sales_representative",
        "estimator",
        "crew",
        "marketing",
        "accountant",
        "read_only",
      ];
    default:
      return []; // managers and below cannot invite
  }
}

/** Guard for role changes: blocks privilege escalation outright (§12). */
export function canAssignRole(
  actor: TenantMembership,
  target: TenantMembership,
  nextRole: TenantRole
): { ok: boolean; reason?: string } {
  if (!canManageMembership(actor, target)) {
    return { ok: false, reason: "You may not manage this member" };
  }
  // Checked first so the caller gets the actionable explanation: ownership
  // transfer is a separate, confirmed flow — never a plain role edit (§12).
  if (nextRole === "tenant_owner") {
    return { ok: false, reason: "Ownership transfer requires the dedicated flow" };
  }
  if (!assignableRoles(actor.role).includes(nextRole)) {
    return { ok: false, reason: `You may not grant the ${nextRole} role` };
  }
  return { ok: true };
}
