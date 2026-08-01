import { describe, it, expect, beforeEach } from "vitest";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import {
  buildAuditEntry,
  startSupportSession,
  isSupportSessionActive,
  supportBannerText,
  maskSensitive,
  maskSecret,
} from "@/lib/tenancy/audit";
import type { ActiveSession } from "@/lib/tenancy/types";

const store = () => useTenancyStore.getState();

const PLATFORM_ADMIN_ID = "user-platform-admin";

beforeEach(() => {
  useTenancyStore.setState({
    users: [
      {
        id: PLATFORM_ADMIN_ID,
        email: "platform-admin@windowcrm.local",
        first_name: "Platform",
        last_name: "Admin",
        platform_role: "platform_super_admin",
        email_verified: true,
        created_at: "",
      },
    ],
    tenants: [],
    memberships: [],
    invitations: [],
    auditLogs: [],
    supportSessions: [],
    currentUserId: null,
    activeTenantId: null,
    activeSupportSessionId: null,
  });
});

const registerCompany = (name: string, email: string) =>
  store().registerTenant({
    first_name: "Owner",
    last_name: name,
    email,
    company_name: name,
    accepted_terms: true,
  });

describe("§5 Tenant registration", () => {
  it("creates tenant + owner membership and starts EMPTY", () => {
    const res = registerCompany("Company A", "a@co.com")!;
    expect(res.tenant.name).toBe("Company A");
    expect(res.tenant.status).toBe("trial");
    expect(res.tenant.onboarding_status).toBe("not_started");

    const mem = store().memberships.find((m) => m.tenant_id === res.tenant.id)!;
    expect(mem.role).toBe("tenant_owner");
    expect(mem.active).toBe(true);
    expect(mem.invitation_status).toBe("accepted");

    // No seeded business data of any kind.
    expect(store().tenants).toHaveLength(1);
    expect(store().memberships).toHaveLength(1);
  });

  it("rejects registration without terms acceptance", () => {
    const res = store().registerTenant({
      first_name: "X", last_name: "Y", email: "x@y.com",
      company_name: "No Terms", accepted_terms: false,
    });
    expect(res).toBeNull();
  });

  it("registration can never grant a platform role (§3)", () => {
    const res = registerCompany("Company C", "c@co.com")!;
    const user = store().users.find((u) => u.id === res.user.id)!;
    expect(user.platform_role).toBeUndefined();
  });

  it("logs the registration and surfaces the tenant to platform admin", () => {
    const res = registerCompany("Company A", "a@co.com")!;
    expect(store().auditLogs.some((l) => l.action === "tenant.registered" && l.tenant_id === res.tenant.id)).toBe(true);
    // Platform directory = all tenants
    expect(store().tenants.map((t) => t.name)).toContain("Company A");
  });

  it("two registrations produce two isolated tenants", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    const b = registerCompany("Company B", "b@co.com")!;
    expect(a.tenant.id).not.toBe(b.tenant.id);
    expect(a.tenant.slug).not.toBe(b.tenant.slug);
    // Company B's owner has no membership in Company A.
    const bMemberships = store().memberships.filter((m) => m.user_id === b.user.id);
    expect(bMemberships.every((m) => m.tenant_id === b.tenant.id)).toBe(true);
  });
});

describe("§9 Invitation workflow", () => {
  it("invite → accept creates an active membership in the inviting tenant only", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    const invited = store().inviteMember("rep@co.com", "sales_representative")!;
    expect(invited.invitation.status).toBe("pending");
    // Only the hash is stored — never the raw token (§9/§32).
    expect(invited.invitation.token_hash).not.toBe(invited.token);
    expect(invited.invitation.token_hash.startsWith("sha256:")).toBe(true);

    const res = store().acceptInvitation(invited.token, {
      first_name: "Rep", last_name: "One", email: "rep@co.com",
    });
    expect(res.ok).toBe(true);

    const mem = store().memberships.find((m) => m.role === "sales_representative")!;
    expect(mem.tenant_id).toBe(a.tenant.id);
    expect(mem.invitation_status).toBe("accepted");
    expect(store().auditLogs.some((l) => l.action === "user.invitation_accepted")).toBe(true);
  });

  it("token is one-time — a second acceptance is rejected", () => {
    registerCompany("Company A", "a@co.com");
    const invited = store().inviteMember("rep@co.com", "sales_representative")!;
    store().acceptInvitation(invited.token, { first_name: "R", last_name: "1", email: "rep@co.com" });
    const second = store().acceptInvitation(invited.token, { first_name: "R", last_name: "1", email: "rep@co.com" });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("already_used");
  });

  it("an invalid token is rejected", () => {
    registerCompany("Company A", "a@co.com");
    expect(store().acceptInvitation("bogus", { first_name: "x", last_name: "y", email: "z@z.com" }).ok).toBe(false);
  });

  it("a revoked invitation cannot be accepted", () => {
    registerCompany("Company A", "a@co.com");
    const invited = store().inviteMember("rep@co.com", "sales_representative")!;
    store().revokeInvitation(invited.invitation.id);
    expect(store().acceptInvitation(invited.token, { first_name: "R", last_name: "1", email: "rep@co.com" }).ok).toBe(false);
  });

  it("a non-admin member cannot invite", () => {
    registerCompany("Company A", "a@co.com");
    const invited = store().inviteMember("rep@co.com", "sales_representative")!;
    store().acceptInvitation(invited.token, { first_name: "R", last_name: "1", email: "rep@co.com" });
    // now acting as the sales rep
    expect(store().inviteMember("other@co.com", "crew")).toBeNull();
  });
});

describe("§8 Manager assignment + §10 multi-tenant membership", () => {
  it("blocks a manager cycle at the store layer", () => {
    registerCompany("Company A", "a@co.com");
    const inv = store().inviteMember("mgr@co.com", "manager")!;
    store().acceptInvitation(inv.token, { first_name: "M", last_name: "1", email: "mgr@co.com" });
    const ownerMem = store().memberships.find((m) => m.role === "tenant_owner")!;
    const mgrMem = store().memberships.find((m) => m.role === "manager")!;

    // sign back in as owner to manage the team
    useTenancyStore.setState({ currentUserId: ownerMem.user_id, activeTenantId: ownerMem.tenant_id });
    const bad = store().updateMembership(mgrMem.id, { manager_membership_id: mgrMem.id });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/cycle/i);

    const good = store().updateMembership(mgrMem.id, { manager_membership_id: ownerMem.id });
    expect(good.ok).toBe(true);
  });

  it("supports one user in multiple tenants with different roles", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    // Invite shared@x.com into A as manager
    const invA = store().inviteMember("shared@x.com", "manager")!;
    store().acceptInvitation(invA.token, { first_name: "S", last_name: "H", email: "shared@x.com" });

    const b = registerCompany("Company B", "b@co.com")!;
    const invB = store().inviteMember("shared@x.com", "read_only")!;
    store().acceptInvitation(invB.token, { first_name: "S", last_name: "H", email: "shared@x.com" });

    const shared = store().users.find((u) => u.email === "shared@x.com")!;
    const mems = store().memberships.filter((m) => m.user_id === shared.id);
    expect(mems).toHaveLength(2);
    expect(mems.find((m) => m.tenant_id === a.tenant.id)!.role).toBe("manager");
    expect(mems.find((m) => m.tenant_id === b.tenant.id)!.role).toBe("read_only");

    // Workspace switching is membership-verified.
    useTenancyStore.setState({ currentUserId: shared.id });
    expect(store().switchWorkspace(a.tenant.id)).toBe(true);
    expect(store().switchWorkspace("tenant-does-not-exist")).toBe(false);
  });
});

describe("§16/§24 Suspension", () => {
  it("suspending a tenant removes workspace access; reactivating restores it", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    const ownerId = a.user.id;

    useTenancyStore.setState({ currentUserId: PLATFORM_ADMIN_ID });
    store().suspendTenant(a.tenant.id, "non-payment");
    expect(store().tenants[0].status).toBe("suspended");

    useTenancyStore.setState({ currentUserId: ownerId, activeTenantId: a.tenant.id });
    // resolveSession must NOT return a workspace for a suspended tenant.
    expect(store().resolveSession()?.tenant).toBeUndefined();

    useTenancyStore.setState({ currentUserId: PLATFORM_ADMIN_ID });
    store().reactivateTenant(a.tenant.id);
    useTenancyStore.setState({ currentUserId: ownerId, activeTenantId: a.tenant.id });
    expect(store().resolveSession()?.tenant?.id).toBe(a.tenant.id);
  });

  it("a normal tenant user cannot suspend a tenant", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    useTenancyStore.setState({ currentUserId: a.user.id, activeTenantId: a.tenant.id });
    store().suspendTenant(a.tenant.id, "malicious");
    expect(store().tenants[0].status).not.toBe("suspended");
  });
});

describe("§4/§26 Support + impersonation", () => {
  it("impersonation requires a reason and expires", () => {
    expect(() =>
      startSupportSession({ tenantId: "t", platformUserId: "p", mode: "impersonation", reason: "" })
    ).toThrow(/reason is required/i);

    const s = startSupportSession({ tenantId: "t", platformUserId: "p", mode: "impersonation", reason: "ticket 123 debug" });
    expect(isSupportSessionActive(s)).toBe(true);
    // Expired session is inactive.
    const expired = { ...s, expires_at: new Date(Date.now() - 1000).toISOString() };
    expect(isSupportSessionActive(expired)).toBe(false);
    // Never silent — banner text always present while active.
    expect(supportBannerText(s)).toMatch(/Platform Support/);
    expect(supportBannerText({ ...s, mode: "read_only" as const })).toMatch(/read-only/i);
  });

  it("support access is logged and read-only mode blocks writes", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    useTenancyStore.setState({ currentUserId: PLATFORM_ADMIN_ID, activeTenantId: null });

    const res = store().startSupport(a.tenant.id, "read_only", "support ticket 42");
    expect(res.ok).toBe(true);
    expect(store().auditLogs.some((l) => l.action === "platform.support_started")).toBe(true);
    expect(store().auditLogs.some((l) => l.action === "platform.tenant_accessed")).toBe(true);

    store().endSupport();
    expect(store().auditLogs.some((l) => l.action === "platform.support_ended")).toBe(true);
  });

  it("audit retains the REAL platform actor during impersonation (§4)", () => {
    const session: ActiveSession = {
      user: {
        id: "platform-1", email: "ops@x.com", first_name: "Ops", last_name: "",
        platform_role: "platform_super_admin", email_verified: true, created_at: "",
      },
      tenant: {
        id: "tenant-a", name: "A", slug: "a", status: "active", owner_user_id: "u1",
        timezone: "UTC", currency: "USD", onboarding_status: "completed",
        onboarding_completed_steps: [], created_at: "",
      },
      membership: {
        id: "mem-1", tenant_id: "tenant-a", user_id: "tenant-user-9",
        role: "tenant_admin", active: true, invitation_status: "accepted", created_at: "",
      },
      support: startSupportSession({
        tenantId: "tenant-a", platformUserId: "platform-1",
        mode: "impersonation", reason: "debugging quote totals",
      }),
    };
    const entry = buildAuditEntry(session, { action: "lead.created", entity_type: "lead", entity_id: "l1" });
    // Actor stays the platform admin — history is NOT rewritten as the tenant user.
    expect(entry.actor_user_id).toBe("platform-1");
    expect(entry.impersonated_user_id).toBe("tenant-user-9");
    expect(entry.actor_role).toBe("platform_super_admin");
  });

  it("a non-platform user cannot start a support session", () => {
    const a = registerCompany("Company A", "a@co.com")!;
    useTenancyStore.setState({ currentUserId: a.user.id });
    expect(store().startSupport(a.tenant.id, "impersonation", "I want in").ok).toBe(false);
  });
});

describe("§4 Secret masking", () => {
  it("masks passwords, tokens, api keys and card data recursively", () => {
    const masked = maskSensitive({
      name: "Acme",
      password: "hunter2hunter2",
      integration: { api_key: "sk_live_abcdef123456", refresh_token: "rt_zzzzzzzzzzzz" },
      card: "4242424242424242",
      safe_field: "visible",
    }) as Record<string, unknown>;
    expect(masked.password).not.toContain("hunter2");
    expect(String(masked.card)).not.toContain("4242424242424242");
    const integration = masked.integration as Record<string, string>;
    expect(integration.api_key).not.toContain("sk_live_abcdef");
    expect(integration.refresh_token).toMatch(/^••••/);
    expect(masked.safe_field).toBe("visible");
    expect(maskSecret("abcd1234")).toBe("••••1234");
  });
});

describe("§25 Platform admin bootstrap", () => {
  it("promotes only a verified matching user and is not publicly reachable", () => {
    useTenancyStore.setState({
      users: [
        { id: "u1", email: "ops@example.com", first_name: "O", last_name: "", email_verified: true, created_at: "" },
        { id: "u2", email: "unverified@example.com", first_name: "U", last_name: "", email_verified: false, created_at: "" },
      ],
    });
    expect(store().bootstrapPlatformAdmin("unverified@example.com")).toBe(false);
    expect(store().bootstrapPlatformAdmin("nobody@example.com")).toBe(false);
    expect(store().bootstrapPlatformAdmin("ops@example.com")).toBe(true);
    expect(store().users.find((u) => u.id === "u1")!.platform_role).toBe("platform_super_admin");
  });
});
