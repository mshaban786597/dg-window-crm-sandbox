/**
 * Find the IPv4 session-pooler host for this Supabase project.
 *
 * WHY
 * ---
 * `db.<ref>.supabase.co` (the "direct connection") publishes only an AAAA
 * record. On an IPv4-only network DNS returns nothing and the connection fails
 * with ENOTFOUND. The session pooler is dual-stack, so it works — but its
 * hostname embeds a region that the dashboard shows and we otherwise can't
 * derive.
 *
 * This probes the candidate pooler hosts using the password ALREADY present in
 * .env.local, and rewrites SUPABASE_DB_URL in place once one answers.
 *
 * A project that does not live in a given region fails fast with "Tenant or
 * user not found" — a routing error, not an authentication attempt — so this
 * cannot trip password rate-limiting or a network ban.
 *
 * The password is never printed, logged, or passed on the command line.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(root, ".env.local");

const envText = readFileSync(ENV_FILE, "utf8");
const current = (envText.match(/^SUPABASE_DB_URL=(.*)$/m) || [])[1]?.trim() || "";
if (!current) {
  console.error("✖ SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(current);
} catch {
  console.error("✖ SUPABASE_DB_URL is not a valid URL");
  process.exit(1);
}

const password = decodeURIComponent(parsed.password || "");
if (!password) {
  console.error("✖ No password found in SUPABASE_DB_URL");
  process.exit(1);
}

// Project ref: either from db.<ref>.supabase.co or from a postgres.<ref> user.
const ref =
  (parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/) || [])[1] ||
  (parsed.username.match(/^postgres\.([a-z0-9]+)$/) || [])[1];

if (!ref) {
  console.error("✖ Could not determine the project ref from SUPABASE_DB_URL");
  process.exit(1);
}
console.log(`project ref: ${ref}`);

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "ca-central-1", "sa-east-1",
];
// Newer projects sit behind the aws-1-* fleet.
const PREFIXES = ["aws-0", "aws-1"];

const candidates = [];
for (const prefix of PREFIXES) {
  for (const region of REGIONS) {
    candidates.push(`${prefix}-${region}.pooler.supabase.com`);
  }
}

async function probe(host) {
  const client = new pg.Client({
    host,
    port: 5432,
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    query_timeout: 8000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("select current_database() as db");
    await client.end();
    return { ok: true, db: rows[0].db };
  } catch (e) {
    try {
      await client.end();
    } catch {
      /* already closed */
    }
    return { ok: false, message: e.message };
  }
}

console.log(`probing ${candidates.length} pooler hosts (this takes a moment)...\n`);

let found = null;
for (const host of candidates) {
  const result = await probe(host);
  if (result.ok) {
    console.log(`✔ ${host}  -> connected (database: ${result.db})`);
    found = host;
    break;
  }
  // Only surface genuinely interesting failures; skip the "wrong region" noise.
  if (!/Tenant or user not found|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timeout/i.test(result.message)) {
    console.log(`  ${host}: ${result.message}`);
  }
}

if (!found) {
  console.error("\n✖ No pooler host accepted the connection.");
  console.error("  Get the exact string from the dashboard instead:");
  console.error("  Connect -> Direct/Connection string -> Session pooler\n");
  process.exit(1);
}

const poolerUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${found}:5432/postgres`;
const updated = envText.replace(/^SUPABASE_DB_URL=.*$/m, `SUPABASE_DB_URL=${poolerUrl}`);
writeFileSync(ENV_FILE, updated, "utf8");

console.log(`\n✔ .env.local updated to use ${found}`);
console.log("  (password unchanged and never printed)\n");
