/**
 * Serializable results returned by the platform sign-in Server Actions (§10, §16).
 *
 * Kept in a plain module (not the `"use server"` file) so the client can import
 * the types without the bundler treating them as action exports.
 *
 * Nothing here ever carries a session token, refresh token or JWT. The only
 * secret that crosses the wire is the one-time TOTP enrolment material, which
 * the operator must see in order to add the factor to their authenticator app.
 */

/** What the operator must do next after a successful password check. */
export type PlatformSignInNext =
  /** No TOTP factor exists yet — the operator must enrol one now. */
  | "mfa_enroll"
  /** A verified TOTP factor exists — challenge it. */
  | "mfa_challenge"
  /** The session already satisfies AAL2 — the console is reachable. */
  | "authorized";

/**
 * Failure codes. `INVALID_CREDENTIALS` is deliberately returned for *every*
 * rejection reason (wrong password, unknown address, verified-but-not-a-platform
 * admin) so the endpoint cannot be used to enumerate accounts or roles (§8).
 */
export type PlatformSignInCode = "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NOT_CONFIGURED";

export interface PlatformSignInResult {
  ok: boolean;
  /** Present only when `ok` is true. */
  next?: PlatformSignInNext;
  error?: string;
  code?: PlatformSignInCode;
}

export interface PlatformMfaStatusResult {
  ok: boolean;
  /** A TOTP factor exists and has been verified at least once. */
  enrolled: boolean;
  /** This session has completed an MFA challenge (AAL2). */
  verified: boolean;
  error?: string;
}

/** One-time enrolment material. Displayed once, never persisted or logged. */
export interface PlatformMfaEnrolment {
  factorId: string;
  /** `otpauth://totp/...` URI — render as text and/or encode into a QR image. */
  uri: string;
  /** Base32 shared secret, for operators who cannot scan a QR code. */
  secret: string;
}

export interface PlatformMfaEnrolResult {
  ok: boolean;
  data?: PlatformMfaEnrolment;
  error?: string;
}

export interface PlatformMfaVerifyResult {
  ok: boolean;
  error?: string;
}
