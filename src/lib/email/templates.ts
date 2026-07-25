/**
 * Email templates (§9). Pure builders — no sending here.
 * Currency is en-US USD; the address is a clickable, underlined Google Maps
 * link built from the COMPLETE encoded address. Marketing attribution is
 * never included.
 */
import type { Lead, LeadContact } from "@/types/database";
import { formatCents } from "@/lib/money";
import { serviceDisplay, PROPERTY_TYPE_LABELS, LEAD_SOURCE_LABELS } from "@/lib/domain";

function esc(s: string | undefined | null): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fullAddress(lead: Pick<Lead, "address" | "city" | "state" | "county" | "zip_code" | "formatted_address">): string {
  if (lead.formatted_address) return lead.formatted_address;
  const parts = [lead.address, lead.city, lead.state || lead.county, lead.zip_code].filter(Boolean);
  return parts.join(", ");
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function formatAppointment(iso: string | undefined, timezone: string): string {
  if (!iso) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: timezone || "America/New_York",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function contactName(c: LeadContact | undefined): string {
  if (!c) return "";
  return `${c.first_name} ${c.last_name}`.trim();
}

export interface AssignmentEmailParams {
  lead: Lead;
  recipientName: string;
  leadUrl: string;
  confirmUrl: string;
  timezone: string;
  currency: string;
  sandbox: boolean;
}

export function buildAssignmentEmail(p: AssignmentEmailParams): { subject: string; html: string } {
  const { lead, recipientName, leadUrl, confirmUrl, timezone, currency, sandbox } = p;
  const primary =
    lead.contacts.find((c) => c.id === lead.primary_contact_id) || lead.contacts[0];
  const others = lead.contacts.filter((c) => c.id !== primary?.id);
  const addr = fullAddress(lead);
  const subject = `${sandbox ? "[SANDBOX] " : ""}New appointment assigned — ${contactName(primary) || "Lead"}`;

  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#64748B;">${esc(label)}</td><td style="padding:4px 0;color:#0F172A;">${value}</td></tr>`
      : "";

  const othersHtml = others.length
    ? `<tr><td style="padding:4px 12px 4px 0;color:#64748B;vertical-align:top;">Additional contacts</td><td style="padding:4px 0;color:#0F172A;">${others
        .map((c) => `${esc(contactName(c))}${c.phone ? " · " + esc(c.phone) : ""}${c.email ? " · " + esc(c.email) : ""}`)
        .join("<br/>")}</td></tr>`
    : "";

  const html = `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;">
    ${sandbox ? '<div style="background:#DBEAFE;color:#1D4ED8;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:16px;">SANDBOX EMAIL — not sent externally</div>' : ""}
    <h2 style="color:#0F172A;margin:0 0 4px;">An appointment has been assigned to you.</h2>
    <p style="color:#64748B;margin:0 0 20px;">Hi ${esc(recipientName)}, a new appointment is assigned to you in DG Window CRM.</p>
    <table style="border-collapse:collapse;font-size:14px;width:100%;">
      ${row("Primary contact", esc(contactName(primary)))}
      ${othersHtml}
      ${row("Phone", esc(primary?.phone))}
      ${row("Email", esc(primary?.email))}
      ${row("Property address", `<a href="${esc(mapsUrl(addr))}" style="color:#2563EB;text-decoration:underline;">${esc(addr)}</a>`)}
      ${row("Service requested", esc(serviceDisplay(lead.service_requested, lead.custom_service_name)))}
      ${row("Lead source", esc(LEAD_SOURCE_LABELS[lead.lead_source] || lead.lead_source))}
      ${row("Property type", esc(PROPERTY_TYPE_LABELS[lead.property_type] || lead.property_type))}
      ${row("Property value", lead.property_value_cents ? formatCents(lead.property_value_cents, currency) : "")}
      ${row("Building value", lead.building_value_cents ? formatCents(lead.building_value_cents, currency) : "")}
      ${row("Estimated project value", lead.estimated_value_cents ? formatCents(lead.estimated_value_cents, currency) : "")}
      ${row("Appointment", esc(formatAppointment(lead.appointment_at, timezone)))}
      ${row("Notes", esc(lead.notes))}
    </table>
    <div style="margin:24px 0;">
      <a href="${esc(confirmUrl)}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Confirm Appointment Received</a>
    </div>
    <p style="font-size:13px;color:#64748B;">Open the lead in the CRM: <a href="${esc(leadUrl)}" style="color:#2563EB;text-decoration:underline;">${esc(leadUrl)}</a></p>
  </div>`.trim();

  return { subject, html };
}
