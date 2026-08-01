import { describe, it, expect } from "vitest";
import { canSeeRoute, NAV_CAPABILITY, can } from "@/lib/tenancy/authz";
import type { ActiveSession, TenantRole } from "@/lib/tenancy/types";

const ALL_ROUTES = Object.keys(NAV_CAPABILITY);

function sessionFor(role: TenantRole): ActiveSession {
  return {
    user: { id: `u-${role}`, email: `${role}@x.com`, first_name: role, last_name: "", email_verified: true, created_at: "" },
    tenant: {
      id: "tenant-a", name: "A", slug: "a", status: "active", owner_user_id: "u-owner",
      timezone: "UTC", currency: "USD", onboarding_status: "completed",
      onboarding_completed_steps: [], created_at: "",
    },
    membership: {
      id: `mem-${role}`, tenant_id: "tenant-a", user_id: `u-${role}`, role,
      active: true, invitation_status: "accepted", created_at: "",
    },
  };
}

const visibleFor = (role: TenantRole) => ALL_ROUTES.filter((r) => canSeeRoute(sessionFor(role), r));

describe("§13 role-based navigation", () => {
  it("crew sees only Dashboard, Jobs and Calendar", () => {
    expect(visibleFor("crew").sort()).toEqual(["/app/calendar", "/app/dashboard", "/app/jobs"]);
  });

  it("sales representative sees Dashboard, Leads, Quotes, Customers, Calendar (+Reviews) — not Team/Settings/Inventory", () => {
    const v = visibleFor("sales_representative");
    for (const required of ["/app/dashboard", "/app/leads", "/app/quotes", "/app/customers", "/app/calendar"]) {
      expect(v).toContain(required);
    }
    // Must NOT see admin/management sections.
    expect(v).not.toContain("/app/team");
    expect(v).not.toContain("/app/settings");
    expect(v).not.toContain("/app/inventory");
    expect(v).not.toContain("/app/orders");
    expect(v).not.toContain("/app/estimates");
    expect(v).not.toContain("/app/reports");
    expect(v).not.toContain("/app/marketing");
    expect(v).not.toContain("/app/crews");
  });

  it("manager sees Dashboard, Leads, Quotes, Jobs, Calendar, Team and Reports", () => {
    const v = visibleFor("manager");
    for (const required of [
      "/app/dashboard", "/app/leads", "/app/quotes", "/app/jobs",
      "/app/calendar", "/app/team", "/app/reports",
    ]) {
      expect(v).toContain(required);
    }
    // A manager is not a tenant administrator.
    expect(v).not.toContain("/app/settings");
  });

  it("tenant owner and admin see the full workspace", () => {
    expect(visibleFor("tenant_owner")).toEqual(expect.arrayContaining(ALL_ROUTES));
    const admin = visibleFor("tenant_admin");
    expect(admin).toContain("/app/settings");
    expect(admin).toContain("/app/team");
    expect(admin).toContain("/app/inventory");
  });

  it("marketing sees marketing + reports but no quotes or inventory management", () => {
    const v = visibleFor("marketing");
    expect(v).toContain("/app/marketing");
    expect(v).toContain("/app/reports");
    expect(v).not.toContain("/app/quotes");
    expect(v).not.toContain("/app/inventory");
    expect(v).not.toContain("/app/team");
  });

  it("accountant has finance/reports but no team administration or quotes", () => {
    const s = sessionFor("accountant");
    expect(can(s, "finance.view")).toBe(true);
    expect(can(s, "team.invite")).toBe(false);
    expect(visibleFor("accountant")).not.toContain("/app/quotes");
  });

  it("sales rep keeps catalog READ access for the quote configurator", () => {
    // inventory.view (browse catalog while quoting) but not the management page.
    expect(can(sessionFor("sales_representative"), "inventory.view")).toBe(true);
    expect(can(sessionFor("sales_representative"), "inventory.write")).toBe(false);
  });

  it("no navigation is visible without an active workspace", () => {
    const noWorkspace: ActiveSession = { user: sessionFor("manager").user };
    expect(ALL_ROUTES.filter((r) => canSeeRoute(noWorkspace, r))).toEqual([]);
  });

  it("a suspended tenant hides the entire workspace", () => {
    const s = sessionFor("tenant_owner");
    const suspended: ActiveSession = { ...s, tenant: { ...s.tenant!, status: "suspended" } };
    expect(ALL_ROUTES.filter((r) => canSeeRoute(suspended, r))).toEqual([]);
  });
});
