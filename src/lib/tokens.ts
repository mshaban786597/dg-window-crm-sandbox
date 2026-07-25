/**
 * Single-purpose confirmation tokens (§10).
 *
 * A random opaque token is generated per notification recipient. Only its
 * SHA-256 hash is persisted; the raw token travels in the confirmation URL.
 * The public confirm endpoint hashes the incoming token and matches by hash,
 * so a stored record never exposes a usable token. Uses Web Crypto, available
 * in both the browser and the Next.js server runtime.
 */

function getCrypto(): Crypto {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto unavailable");
  return c;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 bytes of randomness → URL-safe token string. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  getCrypto().getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 hex hash of a token (store this, never the raw token). */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await getCrypto().subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
