/**
 * Authoritative server-side guards (§2, §3, §24).
 *
 * Every server component / route handler under /platform-admin or /app must
 * call one of these. They fail CLOSED: any missing session, wrong role,
 * inactive membership, or suspended tenant results in denial.
 */
import type { ActiveSession } from "./types";
import type { Capability } from "./authz";
import { can, isPlatformAdmin } from "./authz";
import { getServerSession } from "./session";

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

/** Require any authenticated user. */
export async function requireUser(): Promise<ActiveSession> {
  const session = await getServerSession();
  if (!session?.user) throw new AuthzError("Authentication required", 401);
  return session;
}

/**
 * Require platform super admin (§3). Tenant roles — including tenant_admin —
 * can never satisfy this; the check reads platform_role from the database.
 */
export async function requirePlatformAdmin(): Promise<ActiveSession> {
  const session = await requireUser();
  if (!isPlatformAdmin(session.user)) {
    throw new AuthzError("Platform administrator access required", 403);
  }
  return session;
}

/**
 * Require an active workspace session: accepted + active membership in a
 * tenant that is neither suspended nor cancelled (§24).
 */
export async function requireTenantSession(): Promise<ActiveSession> {
  const session = await requireUser();
  const { tenant, membership } = session;
  if (!tenant || !membership) throw new AuthzError("No active workspace", 403);
  if (!membership.active) throw new AuthzError("Your access to this workspace was disabled", 403);
  if (membership.invitation_status !== "accepted") {
    throw new AuthzError("Invitation not accepted", 403);
  }
  if (tenant.status === "suspended") {
    throw new AuthzError("This workspace is suspended", 403);
  }
  if (tenant.status === "cancelled") {
    throw new AuthzError("This workspace is closed", 403);
  }
  return session;
}

/** Require a specific capability inside the active workspace. */
export async function requireCapability(cap: Capability): Promise<ActiveSession> {
  const session = await requireTenantSession();
  if (!can(session, cap)) throw new AuthzError(`Missing permission: ${cap}`, 403);
  return session;
}

export type { Capability };
