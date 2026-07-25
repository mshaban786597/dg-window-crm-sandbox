/**
 * Provider-based email service (§8).
 *
 * In sandbox mode (default) NO real email is sent — the message is recorded in
 * the notification outbox and returned as a preview labeled "sandbox". A real
 * provider (Resend/SendGrid/Postmark) is only invoked when a provider is
 * intentionally configured AND sandbox mode is off. Credentials are read from
 * env — never hardcoded.
 */
import { SANDBOX_MODE, canUseExternalIntegrations } from "@/lib/domain";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  status: "sent" | "failed" | "sandbox";
  error?: string;
  provider: string;
}

const PROVIDER = process.env.EMAIL_PROVIDER || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@windowcrm.local";

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  // Sandbox or integrations disabled → never send; record as sandbox preview.
  if (SANDBOX_MODE || !canUseExternalIntegrations || !PROVIDER) {
    return { status: "sandbox", provider: PROVIDER || "sandbox" };
  }

  try {
    if (PROVIDER === "resend") {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { status: "failed", provider: PROVIDER, error: "RESEND_API_KEY missing" };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: payload.to, subject: payload.subject, html: payload.html }),
      });
      if (!res.ok) return { status: "failed", provider: PROVIDER, error: `HTTP ${res.status}` };
      return { status: "sent", provider: PROVIDER };
    }
    // Other providers (sendgrid/postmark) can be added here behind the same
    // interface. Until implemented, do not silently pretend to send.
    return { status: "failed", provider: PROVIDER, error: `Provider "${PROVIDER}" not implemented` };
  } catch (e) {
    return { status: "failed", provider: PROVIDER, error: e instanceof Error ? e.message : "send error" };
  }
}
