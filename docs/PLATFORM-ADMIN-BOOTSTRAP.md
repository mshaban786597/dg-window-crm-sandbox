# Platform Super Admin — bootstrap (§18)

There is **no public registration** for `platform_super_admin`, no role dropdown, and no invitation path.
The role can only be granted by the one-time command below, run on a trusted machine with the
service-role key in the environment.

> **Never** put a password in source control, in an issue, in a chat message, or in this file.
> The command below sets no password and prints none.

---

## 1. Create the authentication user

Have the owner sign up like any other user, or create the account from the Supabase dashboard:

- Option A — the owner registers a normal account at `/register`.
- Option B — Supabase Dashboard → Authentication → Users → *Add user* (with "auto confirm" **off**).

## 2. Verify the email

The owner must click the verification link. The bootstrap command **refuses unverified accounts**.

## 3. Add the environment variables (server-side only)

```bash
# .env.local on the machine running the command — never committed
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-side only, never NEXT_PUBLIC_
PLATFORM_ADMIN_EMAIL=owner@yourcompany.com
```

`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix, so Next.js will never expose it to the browser.
The bootstrap script is not imported by the application, so it is never bundled.

## 4. Run the bootstrap command

```bash
npm run bootstrap:platform-admin
```

The command will:

1. Find the auth user whose email equals `PLATFORM_ADMIN_EMAIL` — and **refuse any other address**.
2. Refuse the promotion if the email is unverified.
3. Create/update the `app_users` row and set `platform_role = 'platform_super_admin'`.
4. Write a `security.setting_changed` row to `audit_logs` (platform-level, `tenant_id = NULL`).
5. Report whether MFA is enrolled.

It never creates a user and never sets, prints, or stores a password.

## 5. Enrol MFA (mandatory)

```
https://your-app/platform-admin/login
```

Sign in, then complete TOTP enrolment and verification. **`/platform-admin` stays blocked until MFA is
verified** — `requirePlatformAdmin()` throws `MFA_REQUIRED` until the session reaches AAL2.

## 6. Sign in to the platform console

```
https://your-app/platform-admin/login
```

## 7. Confirm tenant users cannot reach it

Sign in as an ordinary tenant user (even a `tenant_owner`) and open `/platform-admin`.
Expected: redirected to the platform sign-in / "Access denied — platform administrator required",
with no platform data rendered.

---

## Revoking platform access

```sql
UPDATE app_users SET platform_role = NULL WHERE email = 'former-admin@example.com';
```

Then revoke their sessions (Supabase Dashboard → Authentication → Users → *Sign out user*).

## Why there is no UI for this

Granting `platform_super_admin` from inside the product would create a path — however well guarded —
from tenant data to platform control. Keeping it in a service-role script means the only way to obtain the
role is filesystem + environment access to the deployment, which is a much smaller attack surface.
The `app_users` RLS policy additionally pins `platform_role` to its current value on self-update, so a user
cannot escalate even with a valid session.
