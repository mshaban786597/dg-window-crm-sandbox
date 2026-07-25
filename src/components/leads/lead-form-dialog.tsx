"use client";

/**
 * §3/§5/§6/§11 — Add / Edit Lead dialog.
 *
 * Maps 1:1 to `LeadFormData`:
 *  - Repeatable CONTACTS (first/last/phone/email/notes + primary radio).
 *  - Address via <AddressAutocomplete> populating City / State / ZIP + hidden
 *    country/lat/lng/formatted_address.
 *  - Service Requested limited to the four LEAD_SERVICE_OPTIONS (+ custom name).
 *  - Currency-safe value fields stored as integer cents.
 *  - Role-gated Marketing Attribution section.
 * The legacy "Window Project Details (Optional)" qualification block is removed.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { AddressAutocomplete, type AddressParts } from "@/components/shared/address-autocomplete";
import { useCRMStore } from "@/lib/store/crm-store";
import type { Lead, LeadContact } from "@/types/database";
import type { LeadFormData } from "@/lib/store/form-types";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_SERVICE_OPTIONS,
  LEAD_SERVICE_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  URGENCY_LEVELS,
  URGENCY_LABELS,
  US_STATES,
} from "@/lib/domain";
import { activeSalesReps, canViewMarketingFields, canEditMarketingFields } from "@/lib/permissions";
import { fromCents, toCents } from "@/lib/money";

// ── Local helpers ────────────────────────────────────────────────
const cid = () => `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
const isValidPhone = (v: string) => v.replace(/[^\d]/g, "").length >= 7;

function emptyContact(primary: boolean): LeadContact {
  return {
    id: cid(),
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    notes: "",
    is_primary: primary,
    created_at: new Date().toISOString(),
  };
}

/** Ensure exactly one contact is flagged primary (first wins if none). */
function normalizeContacts(contacts: LeadContact[]): { contacts: LeadContact[]; primary: LeadContact } {
  const list = contacts.length > 0 ? contacts : [emptyContact(true)];
  const withPrimary = list.some((c) => c.is_primary)
    ? list
    : list.map((c, i) => ({ ...c, is_primary: i === 0 }));
  // Collapse to a single primary (keep the first flagged one).
  let seen = false;
  const single = withPrimary.map((c) => {
    if (c.is_primary && !seen) {
      seen = true;
      return c;
    }
    return { ...c, is_primary: false };
  });
  return { contacts: single, primary: single.find((c) => c.is_primary) ?? single[0] };
}

interface MoneyDraft {
  property_value: string;
  building_value: string;
  estimated_value: string;
}

const EMPTY_MONEY: MoneyDraft = { property_value: "", building_value: "", estimated_value: "" };

function buildEmptyForm(): LeadFormData {
  return {
    contacts: [],
    address: "",
    city: "",
    state: "",
    zip_code: "",
    service_requested: LEAD_SERVICE_OPTIONS[0],
    lead_source: "website_form",
    urgency: "medium",
    property_type: "residential",
    status: "new_lead",
    notes: "",
  };
}

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
}

export function LeadFormDialog({ open, onOpenChange, lead }: LeadFormDialogProps) {
  const addLead = useCRMStore((s) => s.addLead);
  const updateLead = useCRMStore((s) => s.updateLead);
  const showToast = useCRMStore((s) => s.showToast);
  const teamMembers = useCRMStore((s) => s.teamMembers);
  const currentTeamMemberId = useCRMStore((s) => s.currentTeamMemberId);

  const actingUser = useMemo(
    () => teamMembers.find((m) => m.id === currentTeamMemberId),
    [teamMembers, currentTeamMemberId]
  );
  const showMarketing = canViewMarketingFields(actingUser);
  const marketingEditable = canEditMarketingFields(actingUser);
  const salesReps = useMemo(() => activeSalesReps(teamMembers), [teamMembers]);

  const [contacts, setContacts] = useState<LeadContact[]>([emptyContact(true)]);
  const [form, setForm] = useState<LeadFormData>(() => buildEmptyForm());
  const [money, setMoney] = useState<MoneyDraft>(EMPTY_MONEY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showMarketingSection, setShowMarketingSection] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (lead) {
      const loaded = lead.contacts && lead.contacts.length > 0
        ? lead.contacts.map((c) => ({ ...c }))
        : [
            {
              ...emptyContact(true),
              first_name: (lead.full_name || "").split(/\s+/)[0] || lead.full_name || "",
              last_name: (lead.full_name || "").split(/\s+/).slice(1).join(" "),
              phone: lead.phone || "",
              email: lead.email || "",
            },
          ];
      setContacts(loaded);
      setForm({
        contacts: loaded,
        primary_contact_id: lead.primary_contact_id,
        address: lead.address || "",
        city: lead.city || "",
        state: lead.state || lead.county || "",
        zip_code: lead.zip_code || "",
        country: lead.country,
        latitude: lead.latitude,
        longitude: lead.longitude,
        formatted_address: lead.formatted_address,
        service_requested: lead.service_requested,
        custom_service_name: lead.custom_service_name || "",
        lead_source: lead.lead_source,
        urgency: lead.urgency,
        property_type: lead.property_type,
        property_value_cents: lead.property_value_cents,
        building_value_cents: lead.building_value_cents,
        estimated_value_cents: lead.estimated_value_cents,
        pa_verified: lead.pa_verified,
        appointment_at: lead.appointment_at
          ? toLocalInput(lead.appointment_at)
          : undefined,
        assigned_estimator_id: lead.assigned_estimator_id || "",
        assigned_estimator_name: lead.assigned_estimator_name || "",
        notes: lead.notes || "",
        status: lead.status,
        campaign_name: lead.campaign_name || "",
        referral_partner: lead.referral_partner || "",
        utm_source: lead.utm_source || "",
        utm_medium: lead.utm_medium || "",
        utm_campaign: lead.utm_campaign || "",
      });
      setMoney({
        property_value: lead.property_value_cents ? String(fromCents(lead.property_value_cents)) : "",
        building_value: lead.building_value_cents ? String(fromCents(lead.building_value_cents)) : "",
        estimated_value: lead.estimated_value_cents ? String(fromCents(lead.estimated_value_cents)) : "",
      });
      setShowMarketingSection(
        Boolean(
          lead.campaign_name ||
            lead.referral_partner ||
            lead.utm_source ||
            lead.utm_medium ||
            lead.utm_campaign
        )
      );
    } else {
      const fresh = [emptyContact(true)];
      setContacts(fresh);
      setForm(buildEmptyForm());
      setMoney(EMPTY_MONEY);
      setShowMarketingSection(false);
    }
    setErrors({});
  }, [lead, open]);

  const set = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Contact editing ────────────────────────────────────────────
  const updateContact = (id: string, patch: Partial<LeadContact>) =>
    setContacts((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addContact = () => setContacts((list) => [...list, emptyContact(false)]);

  const removeContact = (id: string) =>
    setContacts((list) => {
      const target = list.find((c) => c.id === id);
      // Guard: the primary cannot be removed unless another is primary first.
      if (target?.is_primary) {
        showToast("error", "Make another contact primary before removing this one.");
        return list;
      }
      const next = list.filter((c) => c.id !== id);
      return next.length > 0 ? next : [emptyContact(true)];
    });

  const makePrimary = (id: string) =>
    setContacts((list) => list.map((c) => ({ ...c, is_primary: c.id === id })));

  // ── Address selection from provider ────────────────────────────
  const handleAddressSelect = (parts: AddressParts) => {
    setForm((f) => ({
      ...f,
      address: parts.street_address || f.address,
      city: parts.city || f.city,
      state: parts.state || f.state,
      zip_code: parts.zip || f.zip_code,
      country: parts.country,
      latitude: parts.latitude,
      longitude: parts.longitude,
      formatted_address: parts.formatted_address,
    }));
  };

  // ── Validation ─────────────────────────────────────────────────
  const validate = (normalized: { contacts: LeadContact[]; primary: LeadContact }): boolean => {
    const e: Record<string, string> = {};
    if (normalized.contacts.length === 0) e.contacts = "At least one contact is required";

    normalized.contacts.forEach((c) => {
      if (!c.first_name.trim()) e[`c-${c.id}-first`] = "First name is required";
      if (c.phone.trim() && !isValidPhone(c.phone)) e[`c-${c.id}-phone`] = "Enter a valid phone";
      if (c.email && c.email.trim() && !isValidEmail(c.email)) e[`c-${c.id}-email`] = "Enter a valid email";
    });
    // The primary must have a phone (drives the lead's contact number).
    if (normalized.primary && !normalized.primary.phone.trim())
      e[`c-${normalized.primary.id}-phone`] = "Primary contact needs a phone";

    if (form.service_requested === "custom" && !(form.custom_service_name || "").trim())
      e.custom_service_name = "Custom service name is required";

    setErrors(e);
    if (Object.keys(e).length > 0) {
      showToast("error", "Please fix the highlighted fields");
      return false;
    }
    return true;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const normalized = normalizeContacts(contacts);
    if (!validate(normalized)) return;

    setSaving(true);
    try {
      const rep = salesReps.find((r) => r.id === form.assigned_estimator_id);
      const repName = rep ? `${rep.first_name} ${rep.last_name}`.trim() : "";

      const payload: LeadFormData = {
        ...form,
        contacts: normalized.contacts,
        primary_contact_id: normalized.primary.id,
        custom_service_name:
          form.service_requested === "custom" ? (form.custom_service_name || "").trim() : undefined,
        property_value_cents: money.property_value ? toCents(money.property_value) : undefined,
        building_value_cents: money.building_value ? toCents(money.building_value) : undefined,
        estimated_value_cents: money.estimated_value ? toCents(money.estimated_value) : undefined,
        appointment_at: form.appointment_at
          ? new Date(form.appointment_at).toISOString()
          : undefined,
        assigned_estimator_id: form.assigned_estimator_id || undefined,
        assigned_estimator_name: rep ? repName : undefined,
      };

      let leadId: string;
      if (lead) {
        const primary = normalized.primary;
        updateLead(lead.id, {
          contacts: normalized.contacts,
          primary_contact_id: normalized.primary.id,
          full_name: `${primary.first_name} ${primary.last_name}`.trim(),
          phone: primary.phone,
          email: primary.email,
          address: payload.address,
          city: payload.city,
          state: payload.state,
          county: payload.state || lead.county,
          zip_code: payload.zip_code,
          country: payload.country,
          latitude: payload.latitude,
          longitude: payload.longitude,
          formatted_address: payload.formatted_address,
          service_requested: payload.service_requested,
          custom_service_name: payload.custom_service_name,
          lead_source: payload.lead_source,
          urgency: payload.urgency,
          property_type: payload.property_type,
          property_value_cents: payload.property_value_cents,
          building_value_cents: payload.building_value_cents,
          estimated_value_cents: payload.estimated_value_cents,
          pa_verified: payload.pa_verified,
          appointment_at: payload.appointment_at,
          assigned_estimator_id: payload.assigned_estimator_id,
          assigned_estimator_name: payload.assigned_estimator_name,
          notes: payload.notes,
          status: payload.status,
          campaign_name: payload.campaign_name,
          referral_partner: payload.referral_partner,
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
        });
        leadId = lead.id;
      } else {
        const created = addLead(payload);
        leadId = created.id;
      }

      // §8/§9 — email the assigned rep + manager. Never block save on email.
      if (payload.assigned_estimator_id) {
        const result = await useCRMStore.getState().notifyLeadAssignment(leadId);
        if (result.failed > 0) {
          showToast(
            "error",
            "Lead saved. Assignment email delivery failed for one or more recipients — the lead was saved and can be retried."
          );
        }
      }

      onOpenChange(false);
    } catch {
      showToast("error", "Failed to save lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          <DialogDescription>Capture window project lead details</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {/* ── Contacts (§3) ── */}
          <div className="sm:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Contacts</Label>
              <Button type="button" variant="outline" size="sm" onClick={addContact}>
                + Add Person
              </Button>
            </div>
            {errors.contacts && <p className="text-xs text-red-600">{errors.contacts}</p>}

            <div className="space-y-3">
              {contacts.map((c, idx) => (
                <div key={c.id} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="primary_contact"
                        checked={c.is_primary}
                        onChange={() => makePrimary(c.id)}
                      />
                      {c.is_primary ? "Primary contact" : "Set as primary"}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => removeContact(c.id)}
                      disabled={contacts.length === 1}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>First Name *</Label>
                      <Input
                        value={c.first_name}
                        onChange={(e) => updateContact(c.id, { first_name: e.target.value })}
                      />
                      {errors[`c-${c.id}-first`] && (
                        <p className="text-xs text-red-600">{errors[`c-${c.id}-first`]}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Last Name</Label>
                      <Input
                        value={c.last_name}
                        onChange={(e) => updateContact(c.id, { last_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone {c.is_primary ? "*" : ""}</Label>
                      <Input
                        value={c.phone}
                        onChange={(e) => updateContact(c.id, { phone: e.target.value })}
                      />
                      {errors[`c-${c.id}-phone`] && (
                        <p className="text-xs text-red-600">{errors[`c-${c.id}-phone`]}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={c.email || ""}
                        onChange={(e) => updateContact(c.id, { email: e.target.value })}
                      />
                      {errors[`c-${c.id}-email`] && (
                        <p className="text-xs text-red-600">{errors[`c-${c.id}-email`]}</p>
                      )}
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea
                        rows={2}
                        value={c.notes || ""}
                        onChange={(e) => updateContact(c.id, { notes: e.target.value })}
                      />
                    </div>
                  </div>
                  {idx === 0 && contacts.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      The primary contact&apos;s name and phone represent the lead.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Address (§4/§5) ── */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Address</Label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => set("address", v)}
              onSelect={handleAddressSelect}
            />
          </div>

          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>

          <SelectField
            label="State"
            value={form.state || ""}
            onChange={(v) => set("state", v)}
            options={[{ value: "", label: "Select state" }, ...US_STATES.map((s) => ({ value: s, label: s }))]}
          />

          <div className="space-y-1.5">
            <Label>ZIP Code</Label>
            <Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} />
          </div>

          {/* ── Service (§6) ── */}
          <SelectField
            label="Service Requested"
            value={form.service_requested}
            onChange={(v) => set("service_requested", v as LeadFormData["service_requested"])}
            options={LEAD_SERVICE_OPTIONS.map((s) => ({ value: s, label: LEAD_SERVICE_LABELS[s] }))}
          />

          {form.service_requested === "custom" && (
            <div className="space-y-1.5">
              <Label>Custom Service Name *</Label>
              <Input
                value={form.custom_service_name || ""}
                onChange={(e) => set("custom_service_name", e.target.value)}
              />
              {errors.custom_service_name && (
                <p className="text-xs text-red-600">{errors.custom_service_name}</p>
              )}
            </div>
          )}

          <SelectField
            label="Lead Source"
            value={form.lead_source}
            onChange={(v) => set("lead_source", v as LeadFormData["lead_source"])}
            options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))}
          />

          <SelectField
            label="Urgency"
            value={form.urgency}
            onChange={(v) => set("urgency", v as LeadFormData["urgency"])}
            options={URGENCY_LEVELS.map((u) => ({ value: u, label: URGENCY_LABELS[u] }))}
          />

          <SelectField
            label="Property Type"
            value={form.property_type}
            onChange={(v) => set("property_type", v as LeadFormData["property_type"])}
            options={PROPERTY_TYPES.map((p) => ({ value: p, label: PROPERTY_TYPE_LABELS[p] }))}
          />

          <SelectField
            label="Lead Status"
            value={form.status}
            onChange={(v) => set("status", v as LeadFormData["status"])}
            options={LEAD_STAGES.map((s) => ({ value: s, label: LEAD_STAGE_LABELS[s] }))}
          />

          <SelectField
            label="Assigned Sales Representative"
            value={form.assigned_estimator_id || ""}
            onChange={(v) => set("assigned_estimator_id", v)}
            options={[
              { value: "", label: "Unassigned" },
              ...salesReps.map((r) => ({
                value: r.id,
                label: `${r.first_name} ${r.last_name}`.trim(),
              })),
            ]}
          />

          {/* ── Currency-safe values (§5) ── */}
          <div className="space-y-1.5">
            <Label>Property Value ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={money.property_value}
              onChange={(e) => setMoney((m) => ({ ...m, property_value: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Building Value ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={money.building_value}
              onChange={(e) => setMoney((m) => ({ ...m, building_value: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Estimated Project Value ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={money.estimated_value}
              onChange={(e) => setMoney((m) => ({ ...m, estimated_value: e.target.value }))}
            />
          </div>

          {/* PA Verified (§5) */}
          {/* TODO(spec): the source requirement after 'PA Verified' ends
              mid-sentence ('and a'); no additional unnamed field was invented —
              needs clarification. */}
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.pa_verified)}
                onChange={(e) => set("pa_verified", e.target.checked)}
              />
              PA Verified
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Appointment Date &amp; Time</Label>
            <Input
              type="datetime-local"
              value={form.appointment_at || ""}
              onChange={(e) => set("appointment_at", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>

          {/* ── Marketing Attribution (§11 — role-gated) ── */}
          {showMarketing && (
            <div className="sm:col-span-2 border-t pt-4 space-y-3">
              <button
                type="button"
                onClick={() => setShowMarketingSection((v) => !v)}
                className="flex w-full items-center justify-between text-sm font-medium text-primary"
              >
                <span>Marketing Attribution</span>
                <span className="text-muted-foreground">{showMarketingSection ? "Hide" : "Show"}</span>
              </button>

              {showMarketingSection && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Campaign Name</Label>
                    <Input
                      value={form.campaign_name || ""}
                      disabled={!marketingEditable}
                      onChange={(e) => set("campaign_name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Referral Partner</Label>
                    <Input
                      value={form.referral_partner || ""}
                      disabled={!marketingEditable}
                      onChange={(e) => set("referral_partner", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>UTM Source</Label>
                    <Input
                      value={form.utm_source || ""}
                      disabled={!marketingEditable}
                      onChange={(e) => set("utm_source", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>UTM Medium</Label>
                    <Input
                      value={form.utm_medium || ""}
                      disabled={!marketingEditable}
                      onChange={(e) => set("utm_medium", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>UTM Campaign</Label>
                    <Input
                      value={form.utm_campaign || ""}
                      disabled={!marketingEditable}
                      onChange={(e) => set("utm_campaign", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark" disabled={saving}>
              {saving ? "Saving..." : lead ? "Update Lead" : "Save Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Convert a stored ISO timestamp to a value usable by <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
