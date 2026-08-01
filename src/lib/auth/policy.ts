/**
 * Password policy + abuse controls (§10, §11).
 *
 * Pure functions so they can run identically on the server (authoritative) and
 * in the browser (instant feedback). Passwords are validated, never logged.
 */

export const MIN_PASSWORD_LENGTH = 12;

/**
 * A small set of obviously-compromised / trivially-guessable passwords.
 * The authoritative breach check is delegated to the auth provider (Supabase
 * supports HaveIBeenPwned-backed rejection); this is a cheap first pass so the
 * user gets feedback before a round-trip.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "letmein", "welcome",
  "qwerty", "qwertyuiop", "111111", "123456", "1234567", "12345678",
  "123456789", "1234567890", "iloveyou", "admin", "administrator", "abc123",
  "monkey", "dragon", "sunshine", "princess", "football", "baseball",
  "trustno1", "changeme", "secret", "master", "hello123", "windowcrm",
  "companyadmin", "letmein123", "welcome123", "password1234",
]);

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
  /** 0-4 rough strength indicator for UI only. */
  score: number;
}

/**
 * Validate a password. Length-first (passphrase friendly) rather than forcing
 * symbol/case combinations that push users toward reuse (§11).
 */
export function checkPassword(password: string, context: { email?: string; company?: string } = {}): PasswordCheck {
  const errors: string[] = [];
  const pw = password ?? "";

  if (pw.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Use at least ${MIN_PASSWORD_LENGTH} characters. A passphrase of a few words works well.`);
  }
  const normalized = pw.toLowerCase().trim();
  if (COMMON_PASSWORDS.has(normalized)) {
    errors.push("That password is commonly used and easy to guess.");
  }
  if (/^(.)\1+$/.test(pw) && pw.length > 0) {
    errors.push("That password is a single repeated character.");
  }
  if (context.email) {
    const local = context.email.split("@")[0]?.toLowerCase();
    if (local && local.length >= 3 && normalized.includes(local)) {
      errors.push("Do not include your email address in your password.");
    }
  }
  if (context.company) {
    const c = context.company.toLowerCase().replace(/\s+/g, "");
    if (c.length >= 4 && normalized.replace(/\s+/g, "").includes(c)) {
      errors.push("Do not include your company name in your password.");
    }
  }

  // Rough strength: length dominates, variety adds a little.
  let score = 0;
  if (pw.length >= 12) score += 2;
  if (pw.length >= 16) score += 1;
  if (/\s/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (errors.length > 0) score = Math.min(score, 1);

  return { ok: errors.length === 0, errors, score: Math.min(score, 4) };
}

// ── Rate limiting (§10) ──────────────────────────────────────────
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter.
 *
 * In-process only — correct for a single server and for tests. A multi-instance
 * deployment must swap this for a shared store (Redis / Postgres); the call
 * sites do not change.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }
    if (bucket.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    bucket.count += 1;
    return { allowed: true, remaining: this.limit - bucket.count, retryAfterSeconds: 0 };
  }

  /** Clear a key after a successful auth so honest users are not penalised. */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}

/** Login: 5 attempts per 15 minutes per identifier (§10 brute-force). */
export const loginLimiter = new RateLimiter(5, 15 * 60_000);
/** Registration: 3 per hour per IP (§3). */
export const registrationLimiter = new RateLimiter(3, 60 * 60_000);
/** Password reset: 3 per hour per email. */
export const passwordResetLimiter = new RateLimiter(3, 60 * 60_000);
/** Invitation acceptance attempts: 10 per hour per IP. */
export const inviteLimiter = new RateLimiter(10, 60 * 60_000);

/** Normalise an email for use as a rate-limit / lookup key. */
export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

/** Never echo a password or token back to a client or a log. */
export function redactAuthPayload<T extends Record<string, unknown>>(payload: T): T {
  const out = { ...payload } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (/password|token|secret|otp|code/i.test(key)) out[key] = "[redacted]";
  }
  return out as T;
}
