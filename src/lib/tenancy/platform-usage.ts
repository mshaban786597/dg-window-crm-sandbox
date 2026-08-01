"use client";

/**
 * Per-tenant usage read-model for the platform admin area (§15, §16, §17).
 *
 * Business records now carry `tenant_id` (§1/§27), so CRM counts are attributed
 * by real ownership rather than guessed. Rows that predate the tenancy
 * migration and are still unscoped are counted for NO tenant — they are never
 * silently attributed to whichever workspace happens to be open. With Supabase
 * connected these counts come from tenant-scoped `count(*)` queries.
 */
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useCRMStoreRaw } from "@/lib/store/crm-store";
import { useTenancyStore } from "./tenancy-store";

export interface TenantUsage {
  users: number;
  activeUsers: number;
  pendingInvitations: number;
  leads: number;
  quotes: number;
  jobs: number;
  /** ISO timestamp of the most recent signal, or null when never touched. */
  lastActivity: string | null;
  /**
   * True once CRM records carry `tenant_id` so counts reflect real ownership.
   * Legacy unscoped rows are excluded from every tenant rather than guessed.
   */
  crmAttributable: boolean;
}

export type TenantUsageLookup = (tenantId: string) => TenantUsage;

/** Group tenant-owned rows by tenant_id. Unscoped legacy rows are excluded. */
function countByTenant(rows: { tenant_id?: string }[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (!r.tenant_id) continue; // never attributed to an arbitrary tenant
    out[r.tenant_id] = (out[r.tenant_id] ?? 0) + 1;
  }
  return out;
}

const maxIso = (a: string | null, b: string | null | undefined): string | null => {
  if (!b) return a;
  if (!a) return b;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
};

export function useTenantUsageLookup(): TenantUsageLookup {
  const tenancy = useTenancyStore(
    useShallow((s) => ({
      memberships: s.memberships,
      invitations: s.invitations,
      auditLogs: s.auditLogs,
      tenants: s.tenants,
      activeTenantId: s.activeTenantId,
    }))
  );

  // Select the raw arrays (stable element references compare fine under
  // useShallow) and derive the per-tenant counts in a memo. Building the
  // grouped objects *inside* the selector would return a fresh nested object on
  // every store read — useShallow only compares one level deep, so that would
  // never settle and would re-render forever.
  const crmRows = useCRMStoreRaw(
    useShallow((s) => ({ leads: s.leads, quotes: s.quotes, jobs: s.jobs }))
  );

  const crm = useMemo(
    () => ({
      leadsByTenant: countByTenant(crmRows.leads),
      quotesByTenant: countByTenant(crmRows.quotes),
      jobsByTenant: countByTenant(crmRows.jobs),
    }),
    [crmRows]
  );

  return useMemo<TenantUsageLookup>(() => {
    return (tenantId: string): TenantUsage => {
      const memberships = tenancy.memberships.filter((m) => m.tenant_id === tenantId);
      const pendingInvitations = tenancy.invitations.filter(
        (i) => i.tenant_id === tenantId && i.status === "pending"
      ).length;

      let lastActivity: string | null = null;
      for (const m of memberships) {
        lastActivity = maxIso(lastActivity, m.last_accessed_at);
        lastActivity = maxIso(lastActivity, m.accepted_at);
      }
      for (const log of tenancy.auditLogs) {
        if (log.tenant_id === tenantId) lastActivity = maxIso(lastActivity, log.created_at);
      }
      const tenant = tenancy.tenants.find((t) => t.id === tenantId);
      lastActivity = maxIso(lastActivity, tenant?.updated_at);

      return {
        users: memberships.length,
        activeUsers: memberships.filter((m) => m.active && m.invitation_status === "accepted").length,
        pendingInvitations,
        // Attributed by tenant_id ownership — correct for every tenant, not
        // just the one currently open.
        leads: crm.leadsByTenant[tenantId] ?? 0,
        quotes: crm.quotesByTenant[tenantId] ?? 0,
        jobs: crm.jobsByTenant[tenantId] ?? 0,
        lastActivity,
        crmAttributable: true,
      };
    };
  }, [tenancy, crm]);
}
