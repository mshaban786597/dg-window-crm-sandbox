import { describe, it, expect, beforeEach } from "vitest";
import {
  scopedList,
  scopedFind,
  withTenant,
  backfillTenantId,
  migrateStoreToTenant,
  findUnscopedRows,
} from "@/lib/store/tenant-scope";
import { useCRMStore, useCRMStoreRaw } from "@/lib/store/crm-store";
import type { ActiveSession } from "@/lib/tenancy/types";

const sessionA = {
  user: { id: "u-a", email: "a@x.com", first_name: "A", last_name: "", email_verified: true, created_at: "" },
  tenant: {
    id: "tenant-a", name: "A", slug: "a", status: "active", owner_user_id: "u-a",
    timezone: "UTC", currency: "USD", onboarding_status: "completed",
    onboarding_completed_steps: [], created_at: "",
  },
  membership: {
    id: "mem-a", tenant_id: "tenant-a", user_id: "u-a", role: "tenant_owner",
    active: true, invitation_status: "accepted", created_at: "",
  },
} as ActiveSession;

const sessionB = {
  ...sessionA,
  tenant: { ...sessionA.tenant!, id: "tenant-b", name: "B", slug: "b" },
  membership: { ...sessionA.membership!, id: "mem-b", tenant_id: "tenant-b" },
} as ActiveSession;

describe("§1/§27 store tenant scoping", () => {
  const rows = [
    { id: "1", tenant_id: "tenant-a" },
    { id: "2", tenant_id: "tenant-b" },
    { id: "3", tenant_id: "tenant-a" },
    { id: "4" }, // legacy unscoped
  ];

  it("scopedList returns only the active tenant's rows", () => {
    expect(scopedList(rows, sessionA).map((r) => r.id)).toEqual(["1", "3"]);
    expect(scopedList(rows, sessionB).map((r) => r.id)).toEqual(["2"]);
  });

  it("scopedList returns nothing without a workspace (fails closed)", () => {
    expect(scopedList(rows, null)).toEqual([]);
    expect(scopedList(rows, { user: sessionA.user } as ActiveSession)).toEqual([]);
  });

  it("scopedFind hides another tenant's record like a 404", () => {
    expect(scopedFind(rows, sessionA, (r) => r.id === "1")?.id).toBe("1");
    // Tenant A asking for Tenant B's id gets undefined, not the row.
    expect(scopedFind(rows, sessionA, (r) => r.id === "2")).toBeUndefined();
    // Legacy unscoped rows are also not returned.
    expect(scopedFind(rows, sessionA, (r) => r.id === "4")).toBeUndefined();
  });

  it("withTenant stamps the active tenant on new records", () => {
    expect(withTenant({ name: "x" }, sessionA).tenant_id).toBe("tenant-a");
    expect(withTenant({ name: "x" }, null).tenant_id).toBeUndefined();
  });

  it("backfill is idempotent and never re-labels another tenant's rows", () => {
    const out = backfillTenantId(rows, "tenant-a");
    expect(out.find((r) => r.id === "4")!.tenant_id).toBe("tenant-a"); // legacy stamped
    expect(out.find((r) => r.id === "2")!.tenant_id).toBe("tenant-b"); // untouched
    // running again changes nothing
    expect(backfillTenantId(out, "tenant-a")).toEqual(out);
  });
});

describe("§27 migrate existing CRM data into one tenant", () => {
  beforeEach(() => {
    useCRMStore.setState({
      leads: [
        { id: "l1", full_name: "Legacy One" },
        { id: "l2", full_name: "Legacy Two" },
      ],
      quotes: [{ id: "q1" }],
      jobs: [],
    } as never);
  });

  it("stamps every legacy business row and reports zero unscoped after", () => {
    expect(findUnscopedRows().length).toBeGreaterThan(0);
    const { stamped } = migrateStoreToTenant("tenant-a");
    // Covers the seeded leads/quotes AND any other seeded tenant-owned rows
    // (team members, default catalog series) — nothing may stay unscoped.
    expect(stamped).toBeGreaterThanOrEqual(3);
    expect(findUnscopedRows()).toEqual([]);
    const leads = useCRMStoreRaw.getState().leads;
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.tenant_id === "tenant-a")).toBe(true);
    expect(useCRMStoreRaw.getState().quotes.every((q) => q.tenant_id === "tenant-a")).toBe(true);
  });

  it("is safe to re-run (no double stamping, no cross-tenant relabel)", () => {
    migrateStoreToTenant("tenant-a");
    useCRMStore.setState({
      leads: [...useCRMStoreRaw.getState().leads, { id: "l3", full_name: "B lead", tenant_id: "tenant-b" }],
    } as never);
    const second = migrateStoreToTenant("tenant-a");
    expect(second.stamped).toBe(0);
    const bLead = useCRMStoreRaw.getState().leads.find((l) => l.id === "l3")!;
    expect(bLead.tenant_id).toBe("tenant-b"); // NOT relabelled
  });

  it("after migration, tenant B sees none of tenant A's migrated leads", () => {
    migrateStoreToTenant("tenant-a");
    const leads = useCRMStoreRaw.getState().leads;
    expect(scopedList(leads, sessionA)).toHaveLength(2);
    expect(scopedList(leads, sessionB)).toHaveLength(0);
  });
});
