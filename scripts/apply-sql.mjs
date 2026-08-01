/**
 * Apply the full database setup to Supabase over a direct Postgres connection.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Supabase SQL editor silently truncated a 77 KB paste, reporting
 * "Success. No rows returned" for what was actually just the leading comment.
 * A driver that streams the file over a real connection removes the paste step
 * entirely, and can verify the result in the same run.
 *
 * CREDENTIAL HANDLING
 * -------------------
 * The connection string is read from SUPABASE_DB_URL in `.env.local`, which is
 * git-ignored. It is NEVER printed, logged, or echoed — not even masked — and
 * it is never passed as a command-line argument (argv is visible to other
 * processes). Only the host is shown, so you can confirm the target project.
 *
 * SAFETY
 * ------
 * The whole script runs inside a single transaction. Any error rolls the entire
 * setup back, leaving the database exactly as it was. It seeds no business data.
 *
 * Usage:  node scripts/apply-sql.mjs [--verify-only]
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_FILE = join(root, "supabase", "APPLY_ALL.sql");
const ENV_FILE = join(root, ".env.local");

/** Minimal .env reader — avoids pulling in a dependency just to split on "=". */
function readEnvValue(key) {
  if (!existsSync(ENV_FILE)) return "";
  for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    return line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return "";
}

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

const connectionString = readEnvValue("SUPABASE_DB_URL");
if (!connectionString) {
  fail(
    "SUPABASE_DB_URL is not set in .env.local",
    [
      "Add it yourself (do not paste it into chat):",
      "",
      "  Supabase Dashboard -> Connect -> Session pooler -> URI",
      "  Copy the string, replace [YOUR-PASSWORD] with your database password,",
      "  and add it to .env.local as a single line:",
      "",
      "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres",
    ].join("\n")
  );
}

// Show ONLY the host, so the target project is verifiable without exposing the
// password or user. A malformed URL is reported without echoing its contents.
let host = "(unparseable)";
try {
  host = new URL(connectionString).host;
} catch {
  fail("SUPABASE_DB_URL is not a valid URL. Check it is a single unbroken line.");
}

const verifyOnly = process.argv.includes("--verify-only");

const VERIFY_SQL = `
  select
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
    (select count(*) from pg_policies where schemaname = 'public') as rls_policies,
    (select count(*) from information_schema.routines
      where routine_schema = 'public') as functions,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and column_name = 'tenant_id') as tenant_scoped_tables;
`;

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Creating ~55 tables plus policies and triggers takes a while on a cold
  // free-tier instance; the default 30s is not enough headroom.
  statement_timeout: 300_000,
  query_timeout: 300_000,
  connectionTimeoutMillis: 30_000,
});

console.log(`\n→ connecting to ${host}`);
try {
  await client.connect();
} catch (e) {
  fail(`could not connect: ${e.message}`, "Check the password in SUPABASE_DB_URL and that your IP is allowed.");
}
console.log("✔ connected");

async function verify(label) {
  const { rows } = await client.query(VERIFY_SQL);
  const r = rows[0];
  console.log(`\n${label}`);
  console.log(`   tables                 ${r.tables}`);
  console.log(`   rls policies           ${r.rls_policies}`);
  console.log(`   functions              ${r.functions}`);
  console.log(`   columns named tenant_id ${r.tenant_scoped_tables}`);
  return r;
}

try {
  const before = await verify("BEFORE:");

  if (verifyOnly) {
    await client.end();
    process.exit(0);
  }

  const sql = readFileSync(SQL_FILE, "utf8");

  // Guard on CONFLICTS, not on "the database is not pristine". An unrelated
  // table (e.g. one made by hand in the dashboard) is harmless and must not
  // block setup; a table this script also creates means it has already run.
  const willCreate = [
    ...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi),
  ].map((m) => m[1].toLowerCase());

  const { rows: existing } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`
  );
  const existingNames = existing.map((r) => r.table_name.toLowerCase());
  const conflicts = [...new Set(willCreate)].filter((t) => existingNames.includes(t));

  if (conflicts.length > 0) {
    console.log(`\n⚠ ${conflicts.length} table(s) this script creates already exist:`);
    console.log(`  ${conflicts.slice(0, 10).join(", ")}${conflicts.length > 10 ? " …" : ""}`);
    console.log("  It looks like setup already ran. Re-running would fail and roll back.");
    console.log("  Nothing has been changed. Use --verify-only to inspect.\n");
    await client.end();
    process.exit(2);
  }

  const unrelated = existingNames.length;
  if (unrelated > 0) {
    console.log(`\n  note: ${unrelated} unrelated table(s) already present — leaving them untouched.`);
  }

  console.log(`\n→ applying ${(sql.length / 1024).toFixed(1)} KB from supabase/APPLY_ALL.sql`);
  console.log("  (single transaction — any error rolls the whole thing back)");

  const started = Date.now();
  // The file already contains its own BEGIN/COMMIT.
  await client.query(sql);
  console.log(`✔ applied in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  await verify("AFTER:");
  console.log("\n✔ database setup complete. No business data was seeded.\n");
} catch (e) {
  console.error(`\n✖ FAILED: ${e.message}`);
  if (e.position) console.error(`  at character ${e.position} of the script`);
  if (e.detail) console.error(`  detail: ${e.detail}`);
  if (e.hint) console.error(`  hint: ${e.hint}`);
  console.error("\n  The transaction rolled back — the database is unchanged.\n");
  process.exitCode = 1;
} finally {
  await client.end();
}
