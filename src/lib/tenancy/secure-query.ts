/**
 * Tenant-scoped query helpers (§1, §12).
 *
 * Defense in depth. RLS in Postgres is the authoritative boundary, but every
 * server-side read/write also goes through these helpers so that:
 *   1. a tenant_id is STRUCTURALLY required (you cannot build a query without it)
 *   2. the caller's membership in that tenant is verified before the query runs
 *   3. writes stamp tenant_id from the SESSION, never from client input
 *
 * Client-supplied tenant ids are treated as untrusted and are only ever used to
 * *look up* a membership — never to scope a query directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveSession } from "./types";

/** Tables that MUST always be tenant-scoped. */
export const TENANT_SCOPED_TABLES = [
  "tenant_settings",
  "team_memberships",
  "leads",
  "lead_contacts",
  "customers",
  "properties",
  "appointments",
  "measurements",
  "window_openings",
  "quotes",
  "quote_items",
  "quote_item_snapshots",
  "purchase_orders",
  "purchase_order_items",
  "jobs",
  "crews",
  "crew_members",
  "tasks",
  "assignments",
  "communications",
  "notifications",
  "appointment_confirmations",
  "lead_activities",
  "catalog_series",
  "catalog_window_types",
  "catalog_universal_ranges",
  "catalog_items",
  "catalog_attributes",
  "catalog_attribute_options",
  "materials",
  "inventory_logs",
  "marketing_campaigns",
  "invoices",
  "payments",
  "reviews",
  "files",
  "audit_logs",
] as const;
export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

/**
 * Resolve the tenant the caller may operate in.
 * Throws unless the session has an ACTIVE, ACCEPTED membership in a
 * non-suspended tenant. This is the single choke point for workspace access.
 */
export function requireTenant(session: ActiveSession | null | undefined): {
  tenantId: string;
  membershipId: string;
} {
  if (!session?.tenant || !session.membership) {
    throw new TenantScopeError("No active tenant context");
  }
  const { tenant, membership } = session;
  if (membership.tenant_id !== tenant.id) {
    throw new TenantScopeError("Membership/tenant mismatch");
  }
  if (!membership.active) throw new TenantScopeError("Membership is inactive");
  if (membership.invitation_status !== "accepted") {
    throw new TenantScopeError("Membership invitation is not accepted");
  }
  if (tenant.status === "suspended") throw new TenantScopeError("Tenant is suspended");
  if (tenant.status === "cancelled") throw new TenantScopeError("Tenant is cancelled");
  return { tenantId: tenant.id, membershipId: membership.id };
}

/**
 * Verify that a client-supplied tenant id matches the session's active tenant.
 * Prevents query-parameter tenant swapping (§29 "API query manipulation").
 */
export function assertTenantMatches(
  session: ActiveSession | null | undefined,
  claimedTenantId: string | null | undefined
): string {
  const { tenantId } = requireTenant(session);
  if (claimedTenantId && claimedTenantId !== tenantId) {
    throw new TenantScopeError("Cross-tenant access denied");
  }
  return tenantId;
}

/**
 * Assert a fetched row belongs to the session's tenant before returning it.
 * Guards against direct-URL / id-guessing access (§29).
 */
export function assertRowInTenant<T extends { tenant_id?: string | null }>(
  session: ActiveSession | null | undefined,
  row: T | null | undefined
): T {
  const { tenantId } = requireTenant(session);
  if (!row) throw new TenantScopeError("Record not found");
  if (!row.tenant_id || row.tenant_id !== tenantId) {
    // Deliberately identical to "not found" for callers, so existence of another
    // tenant's record is not disclosed.
    throw new TenantScopeError("Record not found");
  }
  return row;
}

/** Filter a collection down to the session's tenant (belt-and-braces). */
export function scopeToTenant<T extends { tenant_id?: string | null }>(
  session: ActiveSession | null | undefined,
  rows: T[]
): T[] {
  const { tenantId } = requireTenant(session);
  return rows.filter((r) => r.tenant_id === tenantId);
}

/**
 * Build a tenant-scoped Supabase query. There is no way to call this without a
 * verified tenant, which is the point.
 */
export function tenantQuery(
  client: SupabaseClient,
  session: ActiveSession | null | undefined,
  table: TenantScopedTable
) {
  const { tenantId } = requireTenant(session);
  return client.from(table).select("*").eq("tenant_id", tenantId);
}

/** Insert with a server-stamped tenant_id (client input is ignored). */
export function tenantInsert<T extends Record<string, unknown>>(
  client: SupabaseClient,
  session: ActiveSession | null | undefined,
  table: TenantScopedTable,
  values: T | T[]
) {
  const { tenantId } = requireTenant(session);
  const stamp = (v: T) => ({ ...v, tenant_id: tenantId });
  const payload = Array.isArray(values) ? values.map(stamp) : stamp(values);
  return client.from(table).insert(payload).select();
}

/** Update constrained to the session's tenant. */
export function tenantUpdate<T extends Record<string, unknown>>(
  client: SupabaseClient,
  session: ActiveSession | null | undefined,
  table: TenantScopedTable,
  id: string,
  patch: T
) {
  const { tenantId } = requireTenant(session);
  // tenant_id is never patchable — records cannot be moved between tenants.
  const safe = { ...patch } as Record<string, unknown>;
  delete safe.tenant_id;
  delete safe.id;
  return client.from(table).update(safe).eq("id", id).eq("tenant_id", tenantId).select();
}

/** Delete constrained to the session's tenant. */
export function tenantDelete(
  client: SupabaseClient,
  session: ActiveSession | null | undefined,
  table: TenantScopedTable,
  id: string
) {
  const { tenantId } = requireTenant(session);
  return client.from(table).delete().eq("id", id).eq("tenant_id", tenantId);
}

/** Storage prefix for a tenant's files (§19). */
export function tenantStoragePath(
  session: ActiveSession | null | undefined,
  ...segments: string[]
): string {
  const { tenantId } = requireTenant(session);
  const clean = segments
    .map((s) => String(s).replace(/\.\./g, "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return ["tenants", tenantId, ...clean].join("/");
}

/** Reject any storage key that escapes the caller's tenant prefix (§19). */
export function assertStoragePathInTenant(
  session: ActiveSession | null | undefined,
  path: string
): string {
  const { tenantId } = requireTenant(session);
  const prefix = `tenants/${tenantId}/`;
  const normalized = path.replace(/\\/g, "/");
  if (normalized.includes("..") || !normalized.startsWith(prefix)) {
    throw new TenantScopeError("File not found");
  }
  return normalized;
}
