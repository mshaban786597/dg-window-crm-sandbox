import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static audit of the SQL migrations (§7, §12, §14, §19).
 *
 * These are NOT a substitute for executing the migrations against a real
 * Postgres instance — they cannot prove a policy behaves correctly at runtime.
 * What they do prove is that the security-critical constructs are present and
 * that a future edit cannot quietly weaken them (e.g. replacing a tenant
 * predicate with `auth.uid() IS NOT NULL`).
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

const sql = readMigrations();
/** Strip `-- ...` comments so prose cannot satisfy an assertion. */
const code = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("§7 RLS policies are tenant-scoped, not blanket", () => {
  it("never uses a bare `auth.uid() IS NOT NULL` policy on a tenant table", () => {
    // The spec explicitly forbids this shape.
    expect(code).not.toMatch(/USING\s*\(\s*auth\.uid\(\)\s+IS\s+NOT\s+NULL\s*\)/i);
  });

  it("defines the required security helper functions", () => {
    for (const fn of [
      "current_user_is_platform_admin",
      "current_user_has_active_membership",
      "current_user_has_tenant_role",
      "current_user_can_view_lead",
      "current_user_can_view_quote",
      "current_user_can_view_job",
    ]) {
      expect(code).toContain(`FUNCTION ${fn}`);
    }
  });

  it("scopes helper functions with SECURITY DEFINER and a fixed search_path", () => {
    // A SECURITY DEFINER function without a pinned search_path is exploitable.
    const definerCount = (code.match(/SECURITY DEFINER/g) ?? []).length;
    const searchPathCount = (code.match(/SET search_path = public/g) ?? []).length;
    expect(definerCount).toBeGreaterThan(0);
    expect(searchPathCount).toBeGreaterThanOrEqual(definerCount - 1);
  });

  it("membership checks require active + accepted + a live tenant", () => {
    expect(code).toMatch(/m\.active/);
    expect(code).toMatch(/invitation_status\s*=\s*'accepted'/);
    expect(code).toMatch(/status NOT IN \('suspended','cancelled'\)/);
  });

  it("assignment-sensitive tables use the record-level predicates", () => {
    expect(code).toMatch(/CREATE POLICY leads_tenant_isolation[\s\S]*current_user_can_view_lead/);
    expect(code).toMatch(/CREATE POLICY quotes_tenant_isolation[\s\S]*current_user_can_view_quote/);
    expect(code).toMatch(/CREATE POLICY jobs_tenant_isolation[\s\S]*current_user_can_view_job/);
  });
});

describe("§12 privilege escalation is blocked in the database", () => {
  it("pins platform_role on self-update so it cannot be self-assigned", () => {
    expect(code).toMatch(/platform_role IS NOT DISTINCT FROM/);
  });

  it("has a trigger preventing self role changes and unauthorised ownership transfer", () => {
    expect(code).toContain("prevent_self_role_escalation");
    expect(code).toMatch(/You cannot change your own role/);
    expect(code).toMatch(/Only the current owner may transfer ownership/);
  });

  it("provisioning hardcodes tenant_owner and never accepts a role argument", () => {
    const fn = code.slice(code.indexOf("FUNCTION provision_tenant"), code.indexOf("REVOKE ALL ON FUNCTION provision_tenant"));
    expect(fn).toContain("'tenant_owner'");
    expect(fn).not.toMatch(/p_role/); // no role parameter exists
  });

  it("app_users has no INSERT policy — profiles come from a trigger", () => {
    expect(code).not.toMatch(/CREATE POLICY[^;]*ON app_users FOR INSERT/i);
    expect(code).toContain("handle_new_auth_user");
  });

  it("the bootstrap routine is revoked from public roles", () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION bootstrap_platform_admin\(TEXT\) FROM PUBLIC, authenticated, anon/);
  });
});

describe("§5 invitation security", () => {
  it("stores only a token hash and enforces uniqueness", () => {
    expect(code).toMatch(/token_hash TEXT NOT NULL UNIQUE/);
    // No column stores a raw token.
    expect(code).not.toMatch(/\btoken\s+TEXT\b/);
  });

  it("acceptance locks the row and rejects reuse, expiry, revocation and email mismatch", () => {
    const fn = code.slice(code.indexOf("FUNCTION accept_invitation"), code.indexOf("REVOKE ALL ON FUNCTION accept_invitation"));
    expect(fn).toContain("FOR UPDATE"); // no concurrent double-redemption
    expect(fn).toContain("ALREADY_USED");
    expect(fn).toContain("EXPIRED");
    expect(fn).toContain("REVOKED");
    expect(fn).toContain("EMAIL_MISMATCH");
    expect(fn).toMatch(/status = 'accepted'/); // token consumed
  });

  it("acceptance is not callable anonymously", () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION accept_invitation\(TEXT, UUID, TEXT\) FROM PUBLIC, anon/);
  });
});

describe("§9 storage isolation", () => {
  it("scopes object access to tenants/{tenant_id}/ with a membership check", () => {
    expect(code).toMatch(/storage\.foldername\(name\)\)\[1\] = 'tenants'/);
    expect(code).toMatch(/current_user_has_active_membership\(\(\(storage\.foldername\(name\)\)\[2\]\)::uuid\)/);
  });

  it("the tenant bucket is private", () => {
    expect(code).toMatch(/storage\.buckets[\s\S]*'tenant-files'[\s\S]*FALSE/);
  });

  it("file rows are constrained to their own tenant prefix", () => {
    expect(code).toMatch(/CONSTRAINT file_path_tenant_scoped CHECK/);
  });
});

describe("§14 audit integrity", () => {
  it("audit rows are append-only via trigger", () => {
    expect(code).toContain("deny_audit_mutation");
    expect(code).toMatch(/BEFORE UPDATE OR DELETE ON audit_logs/);
    expect(code).toMatch(/Audit records are append-only/);
  });

  it("records the real actor separately from an impersonated user", () => {
    expect(code).toMatch(/actor_user_id UUID NOT NULL/);
    expect(code).toMatch(/impersonated_user_id UUID/);
  });
});

describe("§19 verification helpers exist", () => {
  it("can list unscoped rows and tables missing RLS", () => {
    expect(code).toContain("FUNCTION verify_no_unscoped_rows");
    expect(code).toContain("FUNCTION verify_rls_enabled");
  });
});
