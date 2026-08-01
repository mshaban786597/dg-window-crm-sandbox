/**
 * LIVE two-tenant isolation test against the real Supabase project.
 *
 * This is the test that unit tests cannot substitute for. It creates two real
 * auth users, provisions a company for each, then attacks the boundary from a
 * NORMAL authenticated client (publishable key + user JWT) — exactly what a
 * browser holds. Row-level security is the thing under test, so nothing here
 * uses the service key except for setup and teardown.
 *
 * Every assertion is written so that FAILING OPEN counts as a failure: a query
 * that errors, returns nothing, or is silently ignored must not be mistaken
 * for "isolation works".
 *
 * Cleans up everything it creates, including on failure.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim() || "";

const URL = get("NEXT_PUBLIC_SUPABASE_URL");
const PUBLISHABLE = get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SECRET = get("SUPABASE_SECRET_KEY") || get("SUPABASE_SERVICE_ROLE_KEY");

if (!URL || !PUBLISHABLE || !SECRET) {
  console.error("✖ Missing Supabase config in .env.local");
  process.exit(1);
}

const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const stamp = Date.now();
const USERS = [
  { tag: "A", email: `iso-a-${stamp}@example.com`, company: "Isolation Test Alpha" },
  { tag: "B", email: `iso-b-${stamp}@example.com`, company: "Isolation Test Beta" },
];
const PASSWORD = `Test-${stamp}-Passphrase!`;

let passed = 0;
let failed = 0;
const created = { users: [], tenants: [] };

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function cleanup() {
  console.log("\n── cleanup ─────────────────────────────────────");
  for (const t of created.tenants) {
    // tenant_id cascades, so business rows go with the tenant.
    const { error } = await admin.from("tenants").delete().eq("id", t);
    console.log(`  tenant ${t.slice(0, 8)}… ${error ? "FAILED: " + error.message : "deleted"}`);
  }
  for (const u of created.users) {
    const { error } = await admin.auth.admin.deleteUser(u);
    console.log(`  user ${u.slice(0, 8)}… ${error ? "FAILED: " + error.message : "deleted"}`);
  }
}

try {
  console.log("\n══ SETUP ═══════════════════════════════════════");

  for (const u of USERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`create user ${u.tag}: ${error.message}`);
    u.id = data.user.id;
    created.users.push(u.id);

    // Sign in as a NORMAL client — this is the security-relevant path.
    u.client = createClient(URL, PUBLISHABLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await u.client.auth.signInWithPassword({
      email: u.email,
      password: PASSWORD,
    });
    if (signInError) throw new Error(`sign in ${u.tag}: ${signInError.message}`);

    // Provision through the same RPC the app uses.
    const { data: tenantId, error: provisionError } = await u.client.rpc("provision_tenant", {
      p_user_id: u.id,
      p_email: u.email,
      p_first_name: "Iso",
      p_last_name: u.tag,
      p_company_name: u.company,
      p_slug: `iso-${u.tag.toLowerCase()}-${stamp}`,
      p_phone: null,
      p_website: null,
      p_country: "US",
      p_state: "PA",
      p_timezone: "UTC",
      p_registration_key: `iso-${u.tag}-${stamp}`,
    });
    if (provisionError) throw new Error(`provision ${u.tag}: ${provisionError.message}`);
    u.tenantId = tenantId;
    created.tenants.push(tenantId);
    console.log(`  ${u.tag}: user ${u.id.slice(0, 8)}… tenant ${tenantId.slice(0, 8)}… (${u.company})`);
  }

  const [A, B] = USERS;

  console.log("\n══ SEED: A creates a lead ══════════════════════");
  const { data: leadRows, error: leadError } = await A.client
    .from("leads")
    .insert({
      tenant_id: A.tenantId,
      full_name: "Confidential AlphaLead",
      phone: "215-555-0101",
      email: `alpha-secret-${stamp}@example.com`,
    })
    .select();
  if (leadError) throw new Error(`A insert lead: ${leadError.message}`);
  const leadId = leadRows[0].id;
  console.log(`  lead ${leadId.slice(0, 8)}… created in tenant A`);

  console.log("\n══ TEST: cross-tenant reads ════════════════════");

  const bList = await B.client.from("leads").select("*");
  check(
    "B listing leads cannot see A's lead",
    !bList.error && (bList.data || []).every((r) => r.id !== leadId),
    bList.error ? bList.error.message : `saw ${bList.data?.length} row(s)`
  );

  const bDirect = await B.client.from("leads").select("*").eq("id", leadId);
  check(
    "B fetching A's lead by exact id returns nothing",
    !bDirect.error && (bDirect.data || []).length === 0,
    bDirect.error ? bDirect.error.message : `returned ${bDirect.data?.length} row(s)`
  );

  const bForge = await B.client.from("leads").select("*").eq("tenant_id", A.tenantId);
  check(
    "B querying with A's tenant_id returns nothing",
    !bForge.error && (bForge.data || []).length === 0,
    bForge.error ? bForge.error.message : `returned ${bForge.data?.length} row(s)`
  );

  const aOwn = await A.client.from("leads").select("*").eq("id", leadId);
  check(
    "A can still read its own lead (isolation is not just blocking everything)",
    !aOwn.error && (aOwn.data || []).length === 1,
    aOwn.error ? aOwn.error.message : `returned ${aOwn.data?.length} row(s)`
  );

  console.log("\n══ TEST: cross-tenant writes ═══════════════════");

  const bUpdate = await B.client
    .from("leads")
    .update({ full_name: "HIJACKED" })
    .eq("id", leadId)
    .select();
  check(
    "B cannot update A's lead",
    bUpdate.error !== null || (bUpdate.data || []).length === 0,
    `updated ${bUpdate.data?.length ?? 0} row(s)`
  );

  const bDelete = await B.client.from("leads").delete().eq("id", leadId).select();
  check(
    "B cannot delete A's lead",
    bDelete.error !== null || (bDelete.data || []).length === 0,
    `deleted ${bDelete.data?.length ?? 0} row(s)`
  );

  const bInsertIntoA = await B.client
    .from("leads")
    .insert({ tenant_id: A.tenantId, full_name: "Planted ByB", phone: "215-555-0199" })
    .select();
  check(
    "B cannot insert a row into A's tenant",
    bInsertIntoA.error !== null || (bInsertIntoA.data || []).length === 0,
    `inserted ${bInsertIntoA.data?.length ?? 0} row(s)`
  );

  // The lead must still be intact and unmodified after all of that.
  const afterAttack = await A.client.from("leads").select("*").eq("id", leadId).single();
  check(
    "A's lead survived unmodified",
    !afterAttack.error && afterAttack.data?.full_name === "Confidential AlphaLead",
    afterAttack.error ? afterAttack.error.message : `full_name=${afterAttack.data?.full_name}`
  );

  console.log("\n══ TEST: tenant + membership tables ════════════");

  const bTenants = await B.client.from("tenants").select("*");
  check(
    "B cannot see A's company record",
    !bTenants.error && (bTenants.data || []).every((t) => t.id !== A.tenantId),
    bTenants.error ? bTenants.error.message : `saw ${bTenants.data?.length} tenant(s)`
  );

  const bMemberships = await B.client.from("tenant_memberships").select("*");
  check(
    "B cannot see A's memberships",
    !bMemberships.error && (bMemberships.data || []).every((m) => m.tenant_id !== A.tenantId),
    bMemberships.error ? bMemberships.error.message : `saw ${bMemberships.data?.length}`
  );

  console.log("\n══ TEST: privilege escalation ══════════════════");

  const selfPromote = await B.client
    .from("app_users")
    .update({ platform_role: "platform_super_admin" })
    .eq("id", B.id)
    .select();
  const promoted = await admin.from("app_users").select("platform_role").eq("id", B.id).single();
  check(
    "B cannot promote itself to platform super admin",
    promoted.data?.platform_role !== "platform_super_admin",
    `role is now ${promoted.data?.platform_role ?? "null"}${selfPromote.error ? ` (rejected: ${selfPromote.error.message})` : ""}`
  );

  const bSuspendA = await B.client
    .from("tenants")
    .update({ status: "suspended" })
    .eq("id", A.tenantId)
    .select();
  const aStatus = await admin.from("tenants").select("status").eq("id", A.tenantId).single();
  check(
    "B cannot suspend A's company",
    aStatus.data?.status !== "suspended",
    `A status is ${aStatus.data?.status}${bSuspendA.error ? ` (rejected: ${bSuspendA.error.message})` : ""}`
  );

  const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const anonRead = await anon.from("leads").select("*");
  check(
    "an unauthenticated client sees no leads at all",
    anonRead.error !== null || (anonRead.data || []).length === 0,
    anonRead.error ? anonRead.error.message : `returned ${anonRead.data?.length} row(s)`
  );
} catch (e) {
  failed++;
  console.error(`\n✖ TEST RUN ABORTED: ${e.message}`);
} finally {
  await cleanup();
}

console.log("\n════════════════════════════════════════════════");
console.log(`  ${passed} passed, ${failed} failed`);
console.log("════════════════════════════════════════════════\n");
process.exit(failed === 0 ? 0 : 1);
