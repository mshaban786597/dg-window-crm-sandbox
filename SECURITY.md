# Window CRM — Multi-tenant security model

## Where isolation is actually enforced

Tenant isolation is enforced in **three layers**, in this order of authority:

| Layer | File | Authority |
|---|---|---|
| 1. Postgres Row-Level Security | `supabase/migrations/0003_multi_tenant.sql` | **Authoritative.** Every tenant table has `tenant_id NOT NULL` and a policy scoping rows to `current_user_tenant_ids()`. A compromised client cannot read across tenants. |
| 2. Server guards + scoped queries | `src/lib/tenancy/guards.ts`, `src/lib/tenancy/secure-query.ts`, `src/middleware.ts` | Defense in depth. Route guards fail closed; query helpers make a tenant scope structurally required and stamp `tenant_id` from the **session**, never from client input. |
| 3. Client selectors | `src/lib/tenancy/authz.ts`, `src/lib/store/tenant-scope.ts` | **UX only — never trusted.** Mirrors the RLS predicates so the UI behaves identically. |

### ⚠️ The local sandbox is NOT a security boundary

When `NEXT_PUBLIC_SUPABASE_URL` is unset the app runs in **local sandbox mode**, persisting to browser
`localStorage` (`dg-window-crm-sandbox-v1`, `dg-window-crm-tenancy-v1`). Browser storage is fully readable and
writable by the end user via devtools. Sandbox mode is for development and demos only:

* It must never hold more than one real company's data.
* It is not multi-tenant-secure and makes no such claim.
* Real isolation begins the moment Supabase credentials are configured and the migration is applied.

This is stated explicitly in `src/lib/tenancy/types.ts` and `src/lib/tenancy/tenancy-store.ts`.

## Key invariants

* **No unscoped tenant query.** `requireTenant()` throws unless the session has an *active*, *accepted*
  membership in a tenant that is not suspended/cancelled. `tenantQuery/tenantInsert/tenantUpdate/tenantDelete`
  cannot be called without it.
* **`tenant_id` is never patchable.** `tenantUpdate()` strips `tenant_id` and `id` from every patch, so a record
  can never be moved between tenants.
* **Foreign records look like 404s.** `assertRowInTenant()` throws "Record not found" for another tenant's row,
  so existence is not disclosed.
* **Platform role is not self-assignable.** The `app_users_self_update` policy pins `platform_role` to its
  current value; only `bootstrap_platform_admin()` (revoked from `PUBLIC`/`authenticated`) can grant it.
* **Audit keeps the real actor.** Under impersonation, `actor_user_id` remains the platform admin and the
  tenant user is recorded separately in `impersonated_user_id`. History is never rewritten.
* **Support is never silent.** Sessions require a reason (impersonation), carry a hard expiry
  (`SUPPORT_SESSION_MAX_MINUTES`), display a persistent banner, and log start/end.
* **Storage is prefixed per tenant.** Keys are `tenants/{tenant_id}/…`; a DB CHECK constraint plus a storage
  policy plus `assertStoragePathInTenant()` reject anything outside the caller's prefix.
* **Secrets are masked.** `maskSensitive()` redacts password/token/secret/api-key/card fields before any
  platform-admin display or audit metadata write.

## Platform admin bootstrap (§25)

There is **no public path** to `platform_super_admin`.

```sql
-- after the user has registered AND verified their email
SELECT bootstrap_platform_admin('ops@example.com');
```

The function only promotes an already-verified matching user, writes an audit record, and is revoked from
`PUBLIC`, `anon` and `authenticated`. No default admin password exists anywhere in source control.

## Verification

```bash
npm run lint && npx tsc --noEmit && npm run build && npm test
```

After applying the migration to a **development** project:

```sql
-- must return zero rows
SELECT * FROM verify_no_unscoped_rows();
```

Then sign in as two users from two different tenants and confirm that neither can read, update, or reach the
other's records via UI, API, direct URL, query parameter, or storage key.
