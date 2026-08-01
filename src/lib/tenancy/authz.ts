/**
 * Tenant authorization core (§7, §13, §14, §29).
 *
 * Pure, dependency-free predicates so the SAME rules run in:
 *   - server route guards / API handlers   (authoritative)
 *   - RLS helper equivalents               (see 0003_multi_tenant.sql)
 *   - client selectors                     (UX only, never trusted)
 *
 * Nothing here reads global state — callers pass the resolved session.
 */
import type {
  ActiveSession,
  TenantMembership,
  TenantRole,
  PlatformUser,
} from "./types";

// ── Platform-level ───────────────────────────────────────────────
export function isPlatformAdmin(user: Pick<PlatformUser, "platform_role"> | null | undefined): boolean {
  return user?.platform_role === "platform_super_admin";
}
export function isPlatformStaff(user: Pick<PlatformUser, "platform_role"> | null | undefined): boolean {
  return user?.platform_role === "platform_super_admin" || user?.platform_role === "platform_support";
}

// ── Capabilities ─────────────────────────────────────────────────
export const CAPABILITIES = [
  "tenant.manage_settings",
  "tenant.manage_billing",
  "tenant.transfer_ownership",
  "team.view",
  "team.invite",
  "team.manage_roles",
  "team.deactivate",
  "work.assign",
  "work.assign_any",
  "leads.view_all",
  "leads.view_assigned",
  "leads.write",
  "quotes.view_all",
  "quotes.view_managed",
  "quotes.view_own",
  "quotes.write",
  "jobs.view_all",
  "jobs.view_assigned",
  "jobs.write",
  "inventory.view",
  "inventory.write",
  "inventory.view_cost",
  "measurements.view",
  "reports.view",
  "marketing.view",
  "finance.view",
  "integrations.manage",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const OWNER_CAPS: Capability[] = [...CAPABILITIES];

const ADMIN_CAPS: Capability[] = CAPABILITIES.filter(
  (c) => c !== "tenant.transfer_ownership" && c !== "tenant.manage_billing"
);

const ROLE_CAPABILITIES: Record<TenantRole, Capability[]> = {
  tenant_owner: OWNER_CAPS,
  tenant_admin: ADMIN_CAPS,
  manager: [
    "team.view",
    "work.assign",
    "leads.view_all",
    "leads.write",
    "quotes.view_managed",
    "quotes.write",
    "jobs.view_all",
    "jobs.write",
    "inventory.view",
    "inventory.write",
    "measurements.view",
    "reports.view",
  ],
  // Sales reps browse the catalog inside the quote configurator
  // ("inventory.view") but do NOT get the inventory management section, which
  // is gated on "inventory.write" (§13).
  sales_representative: [
    "leads.view_assigned",
    "leads.write",
    "quotes.view_own",
    "quotes.write",
    "inventory.view",
  ],
  estimator: [
    "leads.view_assigned",
    "quotes.view_own",
    "quotes.write",
    "inventory.view",
    "measurements.view",
  ],
  crew: ["jobs.view_assigned", "jobs.write"],
  marketing: ["marketing.view", "reports.view", "leads.view_all"],
  accountant: ["finance.view", "reports.view"],
  read_only: [
    "leads.view_all",
    "quotes.view_all",
    "jobs.view_all",
    "inventory.view",
    "measurements.view",
    "reports.view",
  ],
};

/** Roles that may never mutate data (§7 read_only). */
export const READ_ONLY_ROLES: TenantRole[] = ["read_only"];

export function roleCapabilities(role: TenantRole): Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

/**
 * Authoritative capability check for a session.
 * A read-only support session downgrades every write capability (§26).
 */
export function can(session: ActiveSession | null | undefined, cap: Capability): boolean {
  if (!session) return false;
  const { membership, tenant, support } = session;

  // Platform admins acting through support inherit the support mode's limits.
  if (support && support.mode === "read_only" && isWriteCapability(cap)) return false;

  if (!membership || !tenant) {
    // No tenant context: only platform staff have any standing, and only for
    // explicitly audited support flows (handled by the platform guard).
    return false;
  }
  if (!membership.active) return false;
  if (membership.invitation_status !== "accepted") return false;
  // Suspended/cancelled tenants lose workspace access entirely (§24).
  if (tenant.status === "suspended" || tenant.status === "cancelled") return false;
  if (READ_ONLY_ROLES.includes(membership.role) && isWriteCapability(cap)) return false;

  return roleCapabilities(membership.role).includes(cap);
}

const WRITE_CAP_PATTERN = /\.(write|invite|assign|assign_any|manage_roles|deactivate|manage_settings|manage_billing|transfer_ownership|manage)$/;
export function isWriteCapability(cap: Capability): boolean {
  return WRITE_CAP_PATTERN.test(cap);
}

// ── Record-level visibility ──────────────────────────────────────
/** Membership ids managed (directly) by a manager membership. */
export function managedMembershipIds(
  memberships: TenantMembership[],
  managerMembershipId: string
): string[] {
  return memberships
    .filter((m) => m.manager_membership_id === managerMembershipId)
    .map((m) => m.id);
}

/**
 * Owner ids whose records the session may see.
 * `null` = all records in the tenant. `[]` = none.
 */
export function visibleOwnerMembershipIds(
  session: ActiveSession | null | undefined,
  memberships: TenantMembership[]
): string[] | null {
  const m = session?.membership;
  if (!m || !m.active) return [];
  switch (m.role) {
    case "tenant_owner":
    case "tenant_admin":
    case "read_only":
      return null;
    case "manager":
      return [m.id, ...managedMembershipIds(memberships, m.id)];
    case "sales_representative":
    case "estimator":
    case "crew":
      return [m.id];
    case "marketing":
    case "accountant":
      return null; // scoped by capability instead (no quote access)
    default:
      return [];
  }
}

/** Can this session see a record owned by `ownerMembershipId`? */
export function canViewRecord(
  session: ActiveSession | null | undefined,
  ownerMembershipId: string | undefined,
  memberships: TenantMembership[]
): boolean {
  const ids = visibleOwnerMembershipIds(session, memberships);
  if (ids === null) return true;
  if (ids.length === 0) return false;
  return !!ownerMembershipId && ids.includes(ownerMembershipId);
}

// ── Assignment rules (§14) ───────────────────────────────────────
export interface AssignmentCheck {
  ok: boolean;
  reason?: string;
}

export function canAssignWorkTo(
  session: ActiveSession | null | undefined,
  target: TenantMembership | undefined,
  memberships: TenantMembership[]
): AssignmentCheck {
  const actor = session?.membership;
  if (!actor || !session?.tenant) return { ok: false, reason: "No tenant context" };
  if (!target) return { ok: false, reason: "Assignee not found" };
  // Cross-tenant assignment is impossible by construction.
  if (target.tenant_id !== session.tenant.id) {
    return { ok: false, reason: "Assignee belongs to another tenant" };
  }
  if (!target.active) return { ok: false, reason: "Inactive users cannot receive new work" };
  if (!can(session, "work.assign")) return { ok: false, reason: "Not permitted to assign work" };

  if (can(session, "work.assign_any")) return { ok: true };

  // Managers: self + directly managed members.
  if (actor.role === "manager") {
    const allowed = [actor.id, ...managedMembershipIds(memberships, actor.id)];
    return allowed.includes(target.id)
      ? { ok: true }
      : { ok: false, reason: "Managers may only assign to themselves or their team" };
  }
  return { ok: false, reason: "Not permitted to assign work" };
}

// ── Manager graph integrity (§8) ─────────────────────────────────
export function wouldCreateManagerCycle(
  memberships: TenantMembership[],
  membershipId: string,
  candidateManagerId: string | undefined
): boolean {
  if (!candidateManagerId) return false;
  if (candidateManagerId === membershipId) return true; // self-management
  const byId = new Map(memberships.map((m) => [m.id, m]));
  const seen = new Set<string>();
  let cursor: string | undefined = candidateManagerId;
  while (cursor) {
    if (cursor === membershipId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.manager_membership_id;
  }
  return false;
}

/** Members eligible to receive NEW assignments (§8, §14). */
export function assignableMemberships(memberships: TenantMembership[]): TenantMembership[] {
  return memberships.filter((m) => m.active && m.invitation_status === "accepted");
}

// ── Navigation gating (§13) ──────────────────────────────────────
export const NAV_CAPABILITY: Record<string, Capability | "always"> = {
  "/app/dashboard": "always",
  "/app/leads": "leads.view_assigned",
  "/app/quotes": "quotes.view_own",
  "/app/customers": "leads.view_assigned",
  "/app/estimates": "measurements.view",
  "/app/orders": "inventory.write",
  "/app/jobs": "jobs.view_assigned",
  "/app/calendar": "always",
  "/app/crews": "jobs.view_all",
  "/app/inventory": "inventory.write",
  "/app/reviews": "leads.view_assigned",
  "/app/reports": "reports.view",
  "/app/marketing": "marketing.view",
  "/app/team": "team.view",
  "/app/settings": "tenant.manage_settings",
};

/**
 * True when the session has a usable workspace: active + accepted membership in
 * a tenant that is neither suspended nor cancelled. Mirrors requireTenant().
 */
export function hasActiveWorkspace(session: ActiveSession | null | undefined): boolean {
  const { tenant, membership } = session ?? {};
  if (!tenant || !membership) return false;
  if (!membership.active || membership.invitation_status !== "accepted") return false;
  return tenant.status !== "suspended" && tenant.status !== "cancelled";
}

export function canSeeRoute(session: ActiveSession | null | undefined, href: string): boolean {
  const cap = NAV_CAPABILITY[href];
  if (!cap) return false;
  // Even "always" routes require a usable workspace — a suspended tenant or a
  // deactivated membership must expose no navigation at all (§24).
  if (!hasActiveWorkspace(session)) return false;
  if (cap === "always") return true;
  // A role with ANY of the read variants may see the section.
  if (cap === "leads.view_assigned") {
    return can(session, "leads.view_assigned") || can(session, "leads.view_all");
  }
  if (cap === "quotes.view_own") {
    return (
      can(session, "quotes.view_own") ||
      can(session, "quotes.view_managed") ||
      can(session, "quotes.view_all")
    );
  }
  if (cap === "jobs.view_assigned") {
    return can(session, "jobs.view_assigned") || can(session, "jobs.view_all");
  }
  return can(session, cap);
}
