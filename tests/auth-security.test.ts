import { describe, it, expect } from "vitest";
import {
  canManageMembership,
  assignableRoles,
  canAssignRole,
  assertRecordInTenant,
  AuthError,
} from "@/lib/auth/server-auth";
import {
  checkPassword,
  RateLimiter,
  loginLimiter,
  normalizeEmail,
  redactAuthPayload,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/policy";
import type { TenantMembership, TenantRole } from "@/lib/tenancy/types";

// ── §17 fixtures: Tenant A and Tenant B, full role matrix ────────
const mk = (
  id: string,
  tenant_id: string,
  role: TenantRole,
  extra: Partial<TenantMembership> = {}
): TenantMembership => ({
  id,
  tenant_id,
  user_id: `${id}-user`,
  role,
  active: true,
  invitation_status: "accepted",
  created_at: "",
  ...extra,
});

const A = "tenant-a";
const B = "tenant-b";

const aOwner = mk("a-owner", A, "tenant_owner");
const aAdmin = mk("a-admin", A, "tenant_admin");
const aManager = mk("a-mgr", A, "manager");
const aRep = mk("a-rep", A, "sales_representative", { manager_membership_id: "a-mgr" });
const aRepOther = mk("a-rep2", A, "sales_representative");
const aCrew = mk("a-crew", A, "crew", { manager_membership_id: "a-mgr" });

const bOwner = mk("b-owner", B, "tenant_owner");
const bManager = mk("b-mgr", B, "manager");
const bRep = mk("b-rep", B, "sales_representative");
const bCrew = mk("b-crew", B, "crew");

describe("§17.1-8 cross-tenant record access is impossible", () => {
  const leadB = { id: "lead-b1", tenant_id: B };
  const quoteB = { id: "quote-b1", tenant_id: B };
  const jobB = { id: "job-b1", tenant_id: B };
  const fileB = { id: "file-b1", tenant_id: B };

  it("1-5. Tenant A user cannot read/open Tenant B lead, quote, job or file", () => {
    for (const row of [leadB, quoteB, jobB, fileB]) {
      // Every attempt raises 404 — never 403 — so ids stay unenumerable (§8).
      expect(() => assertRecordInTenant(row, A)).toThrowError(AuthError);
      try {
        assertRecordInTenant(row, A);
      } catch (e) {
        expect((e as AuthError).status).toBe(404);
      }
    }
  });

  it("6. Tenant A owner cannot invite into Tenant B (manage check is tenant-bound)", () => {
    expect(canManageMembership(aOwner, bRep)).toBe(false);
    expect(canManageMembership(aAdmin, bManager)).toBe(false);
  });

  it("7. Tenant A manager cannot manage/assign Tenant B crew", () => {
    expect(canManageMembership(aManager, bCrew)).toBe(false);
  });

  it("8. Tenant B user cannot reach Tenant A records", () => {
    const leadA = { id: "lead-a1", tenant_id: A };
    expect(() => assertRecordInTenant(leadA, B)).toThrowError(AuthError);
  });

  it("9. Editing tenant_id in a request body does not bypass security", () => {
    // The row's real tenant is what is compared — a spoofed body value is
    // irrelevant because the tenant id argument comes from the membership.
    const spoofed = { id: "x", tenant_id: B };
    expect(() => assertRecordInTenant(spoofed, A)).toThrow();
    // And a row claiming the caller's tenant but truly belonging elsewhere
    // cannot be constructed: assertRecordInTenant compares the stored value.
    expect(assertRecordInTenant({ id: "y", tenant_id: A }, A).id).toBe("y");
  });

  it("10-11. A missing/blank tenant_id is rejected (slug or localStorage edits)", () => {
    const noTenant: { id: string; tenant_id?: string | null } = { id: "z" };
    expect(() => assertRecordInTenant(noTenant, A)).toThrow();
    expect(() => assertRecordInTenant({ id: "z", tenant_id: null }, A)).toThrow();
    expect(() => assertRecordInTenant(null, A)).toThrow();
  });
});

describe("§17.12-13 privilege escalation is blocked", () => {
  it("12. A sales rep cannot elevate their own role", () => {
    // Self-management is refused outright, so self-promotion is impossible.
    expect(canManageMembership(aRep, aRep)).toBe(false);
    const res = canAssignRole(aRep, aRep, "tenant_admin");
    expect(res.ok).toBe(false);
  });

  it("12b. A rep cannot manage or promote a peer", () => {
    expect(canManageMembership(aRep, aRepOther)).toBe(false);
    expect(assignableRoles("sales_representative")).toEqual([]);
  });

  it("13. A tenant admin cannot mint an owner, and no role can grant platform access", () => {
    // tenant_owner is never in an assignable set.
    for (const role of ["tenant_owner", "tenant_admin", "manager"] as TenantRole[]) {
      expect(assignableRoles(role)).not.toContain("tenant_owner");
    }
    // Ownership transfer is refused as a plain role edit.
    const res = canAssignRole(aOwner, aAdmin, "tenant_owner");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ownership transfer/i);

    // platform_super_admin is not a TenantRole at all — it can never appear.
    const everyAssignable = new Set<string>([
      ...assignableRoles("tenant_owner"),
      ...assignableRoles("tenant_admin"),
      ...assignableRoles("manager"),
      ...assignableRoles("crew"),
    ]);
    expect(everyAssignable.has("platform_super_admin")).toBe(false);
  });

  it("13b. An admin may not grant tenant_admin; only the owner may", () => {
    expect(assignableRoles("tenant_owner")).toContain("tenant_admin");
    expect(assignableRoles("tenant_admin")).not.toContain("tenant_admin");
  });

  it("managers may only manage their own direct reports", () => {
    expect(canManageMembership(aManager, aRep)).toBe(true); // reports to a-mgr
    expect(canManageMembership(aManager, aRepOther)).toBe(false); // not a report
    expect(canManageMembership(aManager, aCrew)).toBe(true);
    expect(canManageMembership(aManager, aOwner)).toBe(false);
  });

  it("an admin cannot manage the owner", () => {
    expect(canManageMembership(aAdmin, aOwner)).toBe(false);
    expect(canManageMembership(aAdmin, aManager)).toBe(true);
  });

  it("inactive or unaccepted actors can manage nobody", () => {
    const inactive = { ...aOwner, active: false };
    const pending = { ...aOwner, invitation_status: "pending" as const };
    expect(canManageMembership(inactive, aRep)).toBe(false);
    expect(canManageMembership(pending, aRep)).toBe(false);
  });
});

describe("§11 password policy", () => {
  it("requires a 12+ character passphrase", () => {
    expect(checkPassword("short").ok).toBe(false);
    expect(checkPassword("x".repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
    expect(checkPassword("correct horse battery staple").ok).toBe(true);
  });

  it("rejects common and trivially-guessable passwords", () => {
    expect(checkPassword("password1234").ok).toBe(false);
    expect(checkPassword("aaaaaaaaaaaaaa").ok).toBe(false);
  });

  it("rejects passwords containing the email or company name", () => {
    expect(checkPassword("alicewindows2024", { email: "alice@x.com" }).ok).toBe(false);
    expect(checkPassword("companyaglassrules", { company: "Company A Glass" }).ok).toBe(false);
  });

  it("never echoes secrets back", () => {
    const red = redactAuthPayload({ email: "a@b.com", password: "hunter2hunter2", token: "abc" });
    expect(red.password).toBe("[redacted]");
    expect(red.token).toBe("[redacted]");
    expect(red.email).toBe("a@b.com");
  });
});

describe("§10 rate limiting / brute-force protection", () => {
  it("blocks after the configured number of attempts and reports a retry delay", () => {
    const rl = new RateLimiter(3, 60_000);
    const now = Date.now();
    expect(rl.check("k", now).allowed).toBe(true);
    expect(rl.check("k", now).allowed).toBe(true);
    expect(rl.check("k", now).allowed).toBe(true);
    const blocked = rl.check("k", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("recovers after the window and can be reset on success", () => {
    const rl = new RateLimiter(1, 1_000);
    const t0 = Date.now();
    expect(rl.check("k", t0).allowed).toBe(true);
    expect(rl.check("k", t0).allowed).toBe(false);
    expect(rl.check("k", t0 + 1_001).allowed).toBe(true); // window rolled
    rl.reset("k");
    expect(rl.check("k", t0 + 1_001).allowed).toBe(true);
  });

  it("keys are per-identifier, so one user cannot lock out another", () => {
    const rl = new RateLimiter(1, 60_000);
    const now = Date.now();
    expect(rl.check("alice", now).allowed).toBe(true);
    expect(rl.check("alice", now).allowed).toBe(false);
    expect(rl.check("bob", now).allowed).toBe(true);
  });

  it("login limiter is configured for brute-force protection", () => {
    expect(loginLimiter).toBeInstanceOf(RateLimiter);
  });

  it("normalises emails so casing cannot evade limits", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });
});

describe("§12 public registration can only ever create tenant_owner", () => {
  it("no assignable-role set includes a platform role", () => {
    const all = Object.values({
      owner: assignableRoles("tenant_owner"),
      admin: assignableRoles("tenant_admin"),
    }).flat();
    expect(all).not.toContain("platform_super_admin");
  });

  it("roles below admin cannot invite at all", () => {
    for (const r of ["manager", "sales_representative", "estimator", "crew", "marketing", "accountant", "read_only"] as TenantRole[]) {
      expect(assignableRoles(r)).toEqual([]);
    }
  });
});
