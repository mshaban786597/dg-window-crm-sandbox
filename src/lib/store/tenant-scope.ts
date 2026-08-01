"use client";

/**
 * Tenant scoping for the local CRM store (§1, §27).
 *
 * ⚠️ NON-PRODUCTION. These selectors mirror the Postgres RLS predicates so the
 * sandbox behaves like the real deployment, but browser storage is not a
 * security boundary — see lib/tenancy/tenancy-store.ts.
 *
 * Every read of tenant-owned collections in the workspace UI should go through
 * `scopedList` / `useScoped` so no view can accidentally render another
 * tenant's rows.
 */
import { useCRMStore, useCRMStoreRaw } from "./crm-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";
import type { ActiveSession } from "@/lib/tenancy/types";

export interface TenantOwned {
  tenant_id?: string;
}

/** Filter any tenant-owned collection to the session's active tenant. */
export function scopedList<T extends TenantOwned>(
  rows: T[] | undefined,
  session: ActiveSession | null | undefined
): T[] {
  const tenantId = session?.tenant?.id;
  if (!tenantId) return [];
  return (rows ?? []).filter((r) => r.tenant_id === tenantId);
}

/**
 * Assert a single record belongs to the active tenant before use.
 * Returns undefined (i.e. "not found") for foreign records so direct-URL
 * access cannot reveal another tenant's data.
 */
export function scopedFind<T extends TenantOwned>(
  rows: T[] | undefined,
  session: ActiveSession | null | undefined,
  predicate: (row: T) => boolean
): T | undefined {
  const tenantId = session?.tenant?.id;
  if (!tenantId) return undefined;
  const found = (rows ?? []).find(predicate);
  if (!found || found.tenant_id !== tenantId) return undefined;
  return found;
}

/**
 * Hook: the active tenancy session.
 *
 * Delegates to `useTenancySession()` — `resolveSession()` builds a fresh object
 * on every call, so using it directly as a Zustand selector would never compare
 * equal and would re-render forever.
 */
export function useSession(): ActiveSession | null {
  return useTenancySession();
}

/** Hook: the active tenant id (undefined when no workspace is selected). */
export function useTenantId(): string | undefined {
  return useTenancySession()?.tenant?.id;
}

/**
 * Stamp the active tenant onto a new record before it is written.
 * Callers must use this for every create so nothing lands unscoped.
 */
export function withTenant<T extends object>(
  values: T,
  session: ActiveSession | null | undefined
): T & { tenant_id?: string } {
  const tenantId = session?.tenant?.id;
  return tenantId ? { ...values, tenant_id: tenantId } : values;
}

/**
 * §27 migration helper: stamp every existing (pre-tenant) business record with
 * the initial tenant. Idempotent — rows that already carry a tenant_id are left
 * untouched, so a second tenant's data can never be re-labelled.
 */
export function backfillTenantId<T extends TenantOwned>(rows: T[] | undefined, tenantId: string): T[] {
  return (rows ?? []).map((r) => (r.tenant_id ? r : { ...r, tenant_id: tenantId }));
}

/** Collections in the CRM store that are tenant-owned. */
export const TENANT_OWNED_COLLECTIONS = [
  "leads",
  "customers",
  "quotes",
  "jobs",
  "estimates",
  "purchaseOrders",
  "communications",
  "reviews",
  "invoices",
  "crews",
  "materials",
  "scheduleEvents",
  "marketingCampaigns",
  "inventoryLogs",
  "teamMembers",
  "notifications",
  "appointmentConfirmations",
  "leadActivities",
  "catalogSeries",
  "catalogWindowTypes",
  "catalogUniversalRanges",
  "catalogItems",
] as const;
export type TenantOwnedCollection = (typeof TENANT_OWNED_COLLECTIONS)[number];

/**
 * Backfill the whole CRM store into one tenant (§27 steps 3-4).
 * Called once when a workspace first becomes active and legacy unscoped rows
 * are present.
 */
export function migrateStoreToTenant(tenantId: string): { stamped: number } {
  // Raw state: the migration runs across the tenancy boundary, so it must see
  // unscoped legacy rows that the scoped read would hide.
  const state = useCRMStoreRaw.getState() as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  let stamped = 0;

  for (const key of TENANT_OWNED_COLLECTIONS) {
    const rows = state[key];
    if (!Array.isArray(rows)) continue;
    const unscoped = (rows as TenantOwned[]).filter((r) => !r.tenant_id).length;
    if (unscoped > 0) {
      patch[key] = backfillTenantId(rows as TenantOwned[], tenantId);
      stamped += unscoped;
    }
  }
  if (Object.keys(patch).length > 0) {
    useCRMStore.setState(patch as never);
  }
  return { stamped };
}

/** §31 verification: any tenant-owned row still missing a tenant_id. */
export function findUnscopedRows(): { collection: string; count: number }[] {
  // Raw state: the migration runs across the tenancy boundary, so it must see
  // unscoped legacy rows that the scoped read would hide.
  const state = useCRMStoreRaw.getState() as unknown as Record<string, unknown>;
  const out: { collection: string; count: number }[] = [];
  for (const key of TENANT_OWNED_COLLECTIONS) {
    const rows = state[key];
    if (!Array.isArray(rows)) continue;
    const count = (rows as TenantOwned[]).filter((r) => !r.tenant_id).length;
    if (count > 0) out.push({ collection: key, count });
  }
  return out;
}
