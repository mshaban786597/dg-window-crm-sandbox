# Admin Panel — Build-to-Complete Prompt for Claude Code

You are working in the **Window CRM** repository (Next.js 15 App Router + React 19 + TypeScript + Zustand stores + Supabase-ready multi-tenant SaaS sandbox).

Your job: **complete the platform admin panel** so a platform super admin can run the entire SaaS from one place — see how many companies are registered, manage tenants/plans/users, monitor health, and take action. The skeleton already exists — **EXTEND it, do not rebuild it**.

## Codebase map (read these first)

- `src/app/platform-admin/` — existing admin area:
  - `page.tsx` — Platform Dashboard (stat cards + registration line chart + status bar chart + status/plan/date filters)
  - `companies/page.tsx` — tenant list; `companies/[tenantId]/page.tsx` — tenant detail
  - `plans/page.tsx`, `settings/page.tsx`, `audit/page.tsx`, `events/page.tsx`
  - `platform-admin-shell.tsx`, `sandbox-gate.tsx`, `layout.tsx`, `login/`, `actions.ts`
- `src/lib/tenancy/tenancy-store.ts` — Zustand store: `users`, `tenants`, `memberships`, `invitations`, `auditLogs`, `supportSessions`, `systemEvents` + actions (`registerTenant`, `suspendTenant`, `reactivateTenant`, `startSupport`, `endSupport`, `logAudit`, `bootstrapPlatformAdmin`, …)
- `src/lib/tenancy/types.ts` — `Tenant`, `TenantMembership`, `TenantInvitation`, `SubscriptionPlan`, `TenantSubscription`, `FeatureEntitlement`, `FeatureFlag`, `AuditLogEntry`, `SupportSession`, `SystemEvent`, `PLATFORM_ROLES`, `TENANT_STATUSES`
- `src/lib/tenancy/platform-settings-store.ts` — `SUBSCRIPTION_PLANS`, `planById`
- `src/lib/store/crm-store.ts` + `crm-extended.ts` — per-tenant CRM data (leads, quotes, jobs, notifications, catalog)
- `src/components/ui/*` — Button, Card, Input, SelectField, Dialog, Tabs, Badge, Textarea, Label, DataTable (`src/components/shared/data-table.tsx`), StatCard (`src/components/shared/stat-card.tsx`), EmptyState, PageHeader
- Charts: recharts is already a dependency (used in the dashboard)

## Hard rules

1. **Never fabricate data.** Every number must be computed from the stores. Empty platform = zeros and empty states.
2. **Never invent new security boundaries.** Platform routes stay behind `platform-admin/layout.tsx` + `sandbox-gate.tsx` + `PLATFORM_ROLES` (`platform_super_admin`, `platform_support`). Tenant data stays behind the existing tenant-scope helpers.
3. **Reuse existing UI components** — do not create new primitives unless truly necessary.
4. Keep the existing design language (brand-blue buttons, slate sidebar, existing card/chart styles).
5. All money in integer cents via `src/lib/money.ts` (`formatCents`, `toCents`, `fromCents`).
6. Follow the existing `§N` spec-comment convention in files you touch.

## Deliverable 1 — Platform Dashboard (`src/app/platform-admin/page.tsx`)

Extend the existing dashboard into a complete command center. Keep current filters (date range, status, plan); ADD:

**KPI stat cards row (top):**
- Total registered companies (tenants)
- Active companies (status = active)
- Companies in trial (+ show how many trials end within 7 days)
- Suspended / Cancelled
- Total platform users (distinct `user_id` across active memberships)
- MRR (monthly recurring revenue — computed from `TenantSubscription` × plan price; add `price_money_cents`/`price_cents` to `SubscriptionPlan` if missing, seeded from `SUBSCRIPTION_PLANS`)
- New companies this month
- Failed notifications (last 30d) and platform system errors (last 30d)

**Charts (recharts):**
- Company registrations over time (line/area, existing)
- Companies by status (existing bar) — ADD: companies by plan (bar/pie)
- Onboarding funnel: not_started → in_progress → completed (bar)
- Revenue trend: MRR by month (line, computed from subscription start dates) — show $0/empty state honestly

**Recent activity panel:**
- Latest 8 registrations (company, owner email, date, onboarding %)
- Latest 8 audit events (actor, action, tenant, timestamp)
- Latest 8 system events (kind badge: email_failed / integration_failed / job_failed / intake_failed / security)

**Alerts banner:** companies with trial ending ≤7 days, suspended tenants, failed deliveries in last 24h — each clickable to the relevant list.

## Deliverable 2 — Companies (Tenants) Management (`src/app/platform-admin/companies/`)

**List page — add:**
- Search box (name, slug, owner email)
- Filters: status, plan, onboarding status, date registered
- Columns: Company, Owner, Plan, Status, Onboarding %, Created, Last activity — plus row actions: View, Suspend/Reactivate, Impersonate (via support session)
- **CSV export** button (client-side generation of the filtered rows)
- Pagination (10/25/50 per page) or virtualized table
- Summary strip: counts of active/trial/suspended/cancelled matching current filter

**Detail page (`[tenantId]`) — add missing sections:**
- Company profile card (name, slug, status, timezone, currency, country/state, phone, website, logo)
- Owner + members table (role badges, manager link, active status, invitation status, last access) — allow: invite member, change role, deactivate
- Subscription card: plan, status (trialing/active/past_due/cancelled), period end, **Change Plan** action, **Suspend/Reactivate** with reason (writes audit log)
- Onboarding progress (step checklist from `onboarding_completed_steps`)
- Usage snapshot: leads, quotes, jobs, inventory items, notifications for that tenant (from CRM store, scoped by tenant)
- Feature entitlements (from `FeatureEntitlement`/`FeatureFlag` — enable/disable per feature)
- Audit trail filtered to this tenant (latest 20)
- Support session card: start read-only or impersonation session (60-min auto-expiry), end session

## Deliverable 3 — Plans & Billing (`src/app/platform-admin/plans/`)

- Plans table: name, slug, price, max users, max managers, storage, API access, sort order, active toggle
- Create / edit / archive plan (dialog or page) — price stored in cents
- Per-plan feature entitlement editor (feature key + limit)
- Per-tenant plan assignment lives on the tenant detail page (Deliverable 2)
- Show plan distribution chart (or link back to dashboard chart)

## Deliverable 4 — Platform Users (`src/app/platform-admin/users/` — NEW)

- All `PlatformUser` rows: email, name, platform role, verified, last login, created
- Memberships summary per user (which companies, which roles)
- Promote/demote platform role (`platform_super_admin` / `platform_support`) with audit log
- Deactivate/reactivate platform user

## Deliverable 5 — Feature Flags (`src/app/platform-admin/features/` — NEW)

- Table of `FeatureFlag`s: key, description, globally enabled, per-tenant overrides
- Toggle globally; add/remove tenant overrides
- Changes written to `logAudit` with action `security.setting_changed`

## Deliverable 6 — Audit Log (`src/app/platform-admin/audit/page.tsx`)

- Filters: action type, tenant, actor, date range, search over metadata
- Pagination + CSV export
- Detail expand: full metadata JSON, IP, user agent

## Deliverable 7 — System Events (`src/app/platform-admin/events/page.tsx`)

- Kind filter (email_failed / integration_failed / job_failed / intake_failed / security)
- Severity grouping + count badges, date range filter
- "Acknowledge/resolve" toggle stored per event (add `resolved_at` to `SystemEvent` if needed)

## Deliverable 8 — Support & Impersonation (`src/app/platform-admin/support/` — NEW or in shell)

- List active `SupportSession`s with countdown to auto-expiry
- Start session (read_only | impersonation, reason required, max 60 min per `SUPPORT_SESSION_MAX_MINUTES`)
- While impersonating: banner in the tenant app shell (`src/components/layout/app-shell.tsx` or `sandbox-badge.tsx` pattern) showing "Support mode — acting as X", with End Session button; audit actions logged as the REAL actor with `impersonated_user_id` set

## Deliverable 9 — Platform Settings (`src/app/platform-admin/settings/page.tsx`)

- Platform admin email, sandbox mode toggle (read `NEXT_PUBLIC_SANDBOX_MODE`), external integrations toggle, address provider + Google Maps key placeholder fields
- Security settings: password policy (min length, complexity), session timeout minutes, max login attempts before rate-limit
- Default subscription plan for new registrations
- Storage/quota defaults

## Deliverable 10 — Navigation & Shell

- Extend `platform-admin-shell.tsx` nav to include all sections: Dashboard, Companies, Users, Plans, Features, Audit, Events, Support, Settings
- Active-state highlighting, mobile-friendly
- Company count badge on the Companies nav item

## Testing requirements

- Add/extend vitest tests in `tests/` for every NEW pure-logic helper:
  - MRR computation (from subscriptions × plan prices)
  - CSV export row builder
  - Trial-ending-soon calculation
  - Onboarding % computation
  - Feature-flag entitlement resolution
  - Support-session expiry logic
- Existing tests must keep passing: `npx vitest run`

## Completion gates — ALL must pass before you stop

1. `npx tsc --noEmit` → 0 errors
2. `npx vitest run` → all tests pass (existing + new)
3. `npx next build` → succeeds
4. `npx eslint src` → no new errors
5. Every page renders with empty stores (no crash, honest empty states)
6. Summary at the end: list each Deliverable with files changed/created, test counts, and anything intentionally deferred.

## Working style

- Work in small commits per deliverable (`feat(admin): companies CSV export`, etc.) — do NOT squash everything into one commit.
- Read the existing `platform-admin` pages BEFORE writing code so your additions match the established patterns.
- If a spec detail is ambiguous (e.g. where a plan price lives), pick the simplest consistent option and note it in the summary.
