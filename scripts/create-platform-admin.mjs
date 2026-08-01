/**
 * Create the platform super-admin auth account.
 *
 * The bootstrap script deliberately refuses to invent an account — it only
 * PROMOTES an existing, email-verified user. This creates that user, so the two
 * steps together give you a working console without any hardcoded credential
 * ever living in the repo.
 *
 * PASSWORD HANDLING
 * -----------------
 * A cryptographically random password is generated here and written ONLY to
 * `.env.admin-credentials` (git-ignored). It is never printed to the terminal,
 * never committed, and never sent anywhere. Change it on first sign-in.
 *
 * Safe to re-run: an existing account is reported and left alone rather than
 * silently having its password reset.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim() || "";

const URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SECRET = get("SUPABASE_SECRET_KEY") || get("SUPABASE_SERVICE_ROLE_KEY");
const EMAIL = get("PLATFORM_ADMIN_EMAIL");

if (!URL || !SECRET) {
  console.error("✖ Supabase URL or secret key missing from .env.local");
  process.exit(1);
}
if (!EMAIL) {
  console.error("✖ PLATFORM_ADMIN_EMAIL is not set in .env.local");
  process.exit(1);
}

/**
 * 24 bytes of entropy in base64url, plus a fixed suffix guaranteeing the
 * upper/lower/digit/symbol mix the app's password policy requires.
 */
function generatePassword() {
  return randomBytes(24).toString("base64url") + "-Aa9!";
}

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n→ platform admin: ${EMAIL}`);

// Is there already an account? Re-running must not reset a live password.
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error(`✖ could not list users: ${listError.message}`);
  process.exit(1);
}
const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());

if (existing) {
  console.log(`  account already exists (confirmed: ${Boolean(existing.email_confirmed_at)})`);
  if (!existing.email_confirmed_at) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
    if (error) {
      console.error(`✖ could not confirm the email: ${error.message}`);
      process.exit(1);
    }
    console.log("  ✔ email marked verified (bootstrap requires it)");
  }
  console.log("  password left unchanged — use the one you already have, or reset it in Supabase.");
} else {
  const password = generatePassword();
  const { error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true, // no verification email — the mailer is rate-limited
    user_metadata: { first_name: "Platform", last_name: "Admin" },
  });
  if (error) {
    console.error(`✖ could not create the account: ${error.message}`);
    process.exit(1);
  }

  const file = ".env.admin-credentials";
  const body = [
    "# Platform super-admin sign-in — LOCAL ONLY, git-ignored (.gitignore: .env.*)",
    "# Generated automatically. CHANGE THIS PASSWORD ON FIRST SIGN-IN and then",
    "# delete this file. Anyone with it can reach every company's data.",
    "#",
    `# Sign in at: ${get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000"}/platform-admin/login`,
    "# MFA is mandatory: you will be asked to enrol an authenticator app.",
    "",
    `PLATFORM_ADMIN_EMAIL=${EMAIL}`,
    `PLATFORM_ADMIN_PASSWORD=${password}`,
    "",
  ].join("\n");
  writeFileSync(file, body, "utf8");
  console.log(`  ✔ account created — password written to ${file} (not printed here)`);
}

if (!existsSync(".env.admin-credentials")) {
  console.log("  note: no credentials file written (account pre-existed).");
}
console.log("\nNext: npm run bootstrap:platform-admin\n");
