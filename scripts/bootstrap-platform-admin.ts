/**
 * Platform Super Admin bootstrap (§2, §18).
 *
 *   npm run bootstrap:platform-admin
 *
 * Promotes EXACTLY ONE already-existing, email-verified auth user — the one
 * matching PLATFORM_ADMIN_EMAIL — to `platform_super_admin`, and records the
 * event in the audit log.
 *
 * Deliberate properties:
 *   - never creates a user and never sets or prints a password
 *   - refuses any email other than PLATFORM_ADMIN_EMAIL
 *   - refuses unverified users
 *   - runs server-side only; the service-role key is read from the environment
 *     and is never bundled into client code (this file is not imported by the app)
 */
import { createClient } from "@supabase/supabase-js";


function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accepts the current `sb_secret_…` key or the legacy service-role key.
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();

  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceKey) {
    fail(
      "No server secret is set. Add SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)\n" +
        "  to .env.local. Run this on a trusted machine only."
    );
  }
  if (!targetEmail) fail("PLATFORM_ADMIN_EMAIL is not set. Add it to the server environment first.");

  // Service-role client: server-side only, never exposed to the browser.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\nBootstrapping platform super admin for: ${targetEmail}`);

  // 1. Find the auth user. We never create one here.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) fail(`Could not list auth users: ${listError.message}`);

  const authUser = list.users.find((u) => (u.email ?? "").toLowerCase() === targetEmail);
  if (!authUser) {
    fail(
      `No authentication user exists for ${targetEmail}.\n` +
        `  Create the account first (sign up at /register or invite it via the Supabase dashboard),\n` +
        `  verify the email, then re-run this command.`
    );
  }

  // 2. Require a verified email — an unverified address must never hold the role.
  if (!authUser.email_confirmed_at) {
    fail(`${targetEmail} exists but the email is not verified. Verify it, then re-run.`);
  }

  // 3. Ensure the profile row exists, then promote. This is the only sanctioned
  //    path to platform_super_admin; no UI or API can grant it.
  const { error: upsertError } = await admin.from("app_users").upsert(
    {
      id: authUser.id,
      email: targetEmail,
      first_name: (authUser.user_metadata?.first_name as string) ?? "Platform",
      last_name: (authUser.user_metadata?.last_name as string) ?? "Admin",
      email_verified: true,
      platform_role: "platform_super_admin",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (upsertError) fail(`Could not promote the user: ${upsertError.message}`);

  // 4. Audit the bootstrap (tenant_id NULL = platform-level event).
  const { error: auditError } = await admin.from("audit_logs").insert({
    tenant_id: null,
    actor_user_id: authUser.id,
    actor_role: "platform_super_admin",
    action: "security.setting_changed",
    entity_type: "app_user",
    entity_id: authUser.id,
    metadata: { bootstrap: "platform_super_admin granted", email: targetEmail },
  });
  if (auditError) console.warn(`  (warning) audit row not written: ${auditError.message}`);

  // 5. Report MFA status — /platform-admin stays blocked until MFA is verified.
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: authUser.id });
  const hasVerifiedTotp = Boolean(factors?.factors?.some((f) => f.status === "verified"));

  console.log(`\n✔ ${targetEmail} is now platform_super_admin.`);
  console.log(
    hasVerifiedTotp
      ? "✔ MFA is enrolled."
      : "⚠ MFA is NOT enrolled yet. Sign in at /platform-admin/login and complete MFA enrolment —\n" +
          "  the platform console stays blocked until MFA is verified."
  );
  console.log("\nNo password was set, printed, or stored by this command.\n");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
