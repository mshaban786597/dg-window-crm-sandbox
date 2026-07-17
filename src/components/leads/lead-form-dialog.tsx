"use client";

import { useEffect, useState } from "react";
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
import { useCRMStore, PROFILES } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import type { Lead } from "@/types/database";
import type { LeadFormData } from "@/lib/store/types";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  SERVICES,
  SERVICE_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  URGENCY_LEVELS,
  URGENCY_LABELS,
  WINDOW_STYLES,
  WINDOW_STYLE_LABELS,
  FRAME_MATERIALS,
  FRAME_MATERIAL_LABELS,
  PROJECT_TIMEFRAMES,
  PROJECT_TIMEFRAME_LABELS,
  OCCUPANCY,
  OCCUPANCY_LABELS,
  CONTACT_METHODS,
  CONTACT_METHOD_LABELS,
  LEAD_QUALITY,
  LEAD_QUALITY_LABELS,
} from "@/lib/constants";

const EMPTY_FORM: LeadFormData = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  county: "",
  zip_code: "",
  service_requested: SERVICES[0],
  lead_source: "website_form",
  urgency: "medium",
  property_type: "residential",
  status: "new_lead",
  notes: "",
};

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
}

export function LeadFormDialog({ open, onOpenChange, lead }: LeadFormDialogProps) {
  const addLead = useCRMStore((s) => s.addLead);
  const updateLead = useCRMStore((s) => s.updateLead);
  const showToast = useCRMStore((s) => s.showToast);
  const enabledServices = useSettingsStore((s) => s.services).filter((o) => o.enabled);

  const [form, setForm] = useState<LeadFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const salesReps = PROFILES.filter(
    (p) => p.role === "estimator" || p.role === "sales_manager" || p.role === "owner"
  );

  const serviceOptions =
    enabledServices.length > 0
      ? enabledServices.map((o) => ({ value: o.value, label: o.label }))
      : SERVICES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }));

  useEffect(() => {
    if (lead) {
      setForm({
        full_name: lead.full_name,
        phone: lead.phone,
        email: lead.email || "",
        address: lead.address,
        city: lead.city,
        county: lead.county,
        zip_code: lead.zip_code,
        service_requested: lead.service_requested,
        lead_source: lead.lead_source,
        urgency: lead.urgency,
        property_type: lead.property_type,
        preferred_appointment_date: lead.preferred_appointment_date?.slice(0, 16) || "",
        assigned_estimator_id: lead.assigned_estimator_id || "",
        assigned_estimator_name: lead.assigned_estimator_name || "",
        notes: lead.notes || "",
        status: lead.status,
        estimated_project_value: lead.estimated_project_value,
        window_opening_count: lead.window_opening_count,
        preferred_window_style: lead.preferred_window_style || "",
        preferred_frame_material: lead.preferred_frame_material || "",
        impact_interest: lead.impact_interest,
        energy_efficiency_interest: lead.energy_efficiency_interest,
        financing_interest: lead.financing_interest,
        project_timeframe: lead.project_timeframe || "",
        occupancy: lead.occupancy || "",
        decision_maker: lead.decision_maker,
        preferred_contact_method: lead.preferred_contact_method || "",
        lead_quality: lead.lead_quality,
        next_follow_up_date: lead.next_follow_up_date?.slice(0, 10) || "",
        campaign_name: lead.campaign_name || "",
        utm_source: lead.utm_source || "",
        utm_medium: lead.utm_medium || "",
        utm_campaign: lead.utm_campaign || "",
        referral_partner: lead.referral_partner || "",
      });
      const hasDetails = Boolean(
        lead.window_opening_count ||
          lead.preferred_window_style ||
          lead.preferred_frame_material ||
          lead.impact_interest ||
          lead.energy_efficiency_interest ||
          lead.financing_interest ||
          lead.project_timeframe ||
          lead.occupancy ||
          lead.decision_maker ||
          lead.preferred_contact_method ||
          lead.lead_quality ||
          lead.next_follow_up_date ||
          lead.campaign_name ||
          lead.utm_source ||
          lead.utm_medium ||
          lead.utm_campaign ||
          lead.referral_partner
      );
      setShowDetails(hasDetails);
    } else {
      setForm(EMPTY_FORM);
      setShowDetails(false);
    }
    setErrors({});
  }, [lead, open]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Full name is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      showToast("error", "Please fill in all required fields");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const rep = salesReps.find((p) => p.id === form.assigned_estimator_id);
      const payload: LeadFormData = {
        ...form,
        assigned_estimator_name: rep?.full_name || form.assigned_estimator_name,
        preferred_appointment_date: form.preferred_appointment_date
          ? new Date(form.preferred_appointment_date).toISOString()
          : undefined,
        next_follow_up_date: form.next_follow_up_date
          ? new Date(form.next_follow_up_date).toISOString()
          : undefined,
        estimated_project_value: form.estimated_project_value
          ? Number(form.estimated_project_value)
          : undefined,
        window_opening_count: form.window_opening_count
          ? Number(form.window_opening_count)
          : undefined,
      };

      if (lead) {
        updateLead(lead.id, payload);
      } else {
        addLead(payload);
      }
      onOpenChange(false);
    } catch {
      showToast("error", "Failed to save lead");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          <DialogDescription>
            Capture window project lead details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
            {errors.full_name && <p className="text-xs text-red-600">{errors.full_name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Phone *</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>County / Region</Label>
            <Input value={form.county} onChange={(e) => set("county", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>ZIP Code</Label>
            <Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} />
          </div>

          <SelectField
            label="Service Requested"
            value={form.service_requested}
            onChange={(v) => set("service_requested", v as LeadFormData["service_requested"])}
            options={serviceOptions}
          />

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
            label="Assigned Sales Rep"
            value={form.assigned_estimator_id || ""}
            onChange={(v) => set("assigned_estimator_id", v)}
            options={[
              { value: "", label: "Unassigned" },
              ...salesReps.map((p) => ({ value: p.id, label: p.full_name })),
            ]}
          />

          <div className="space-y-1.5">
            <Label>Est. Project Value ($)</Label>
            <Input
              type="number"
              min={0}
              value={form.estimated_project_value ?? ""}
              onChange={(e) =>
                set("estimated_project_value", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>Preferred Appointment</Label>
            <Input
              type="datetime-local"
              value={form.preferred_appointment_date || ""}
              onChange={(e) => set("preferred_appointment_date", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>

          {/* Optional window project details */}
          <div className="sm:col-span-2 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-primary"
            >
              <span>Window project details (optional)</span>
              <span className="text-muted-foreground">{showDetails ? "Hide" : "Show"}</span>
            </button>
          </div>

          {showDetails && (
            <>
              <div className="space-y-1.5">
                <Label>Window Openings</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.window_opening_count ?? ""}
                  onChange={(e) =>
                    set(
                      "window_opening_count",
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                />
              </div>

              <SelectField
                label="Preferred Window Style"
                value={form.preferred_window_style || ""}
                onChange={(v) => set("preferred_window_style", v)}
                options={[
                  { value: "", label: "Not sure yet" },
                  ...WINDOW_STYLES.map((s) => ({ value: s, label: WINDOW_STYLE_LABELS[s] })),
                ]}
              />

              <SelectField
                label="Preferred Frame Material"
                value={form.preferred_frame_material || ""}
                onChange={(v) => set("preferred_frame_material", v)}
                options={[
                  { value: "", label: "Not sure yet" },
                  ...FRAME_MATERIALS.map((m) => ({ value: m, label: FRAME_MATERIAL_LABELS[m] })),
                ]}
              />

              <SelectField
                label="Project Timeframe"
                value={form.project_timeframe || ""}
                onChange={(v) => set("project_timeframe", v)}
                options={[
                  { value: "", label: "Unspecified" },
                  ...PROJECT_TIMEFRAMES.map((t) => ({
                    value: t,
                    label: PROJECT_TIMEFRAME_LABELS[t],
                  })),
                ]}
              />

              <SelectField
                label="Occupancy"
                value={form.occupancy || ""}
                onChange={(v) => set("occupancy", v)}
                options={[
                  { value: "", label: "Unspecified" },
                  ...OCCUPANCY.map((o) => ({ value: o, label: OCCUPANCY_LABELS[o] })),
                ]}
              />

              <SelectField
                label="Preferred Contact Method"
                value={form.preferred_contact_method || ""}
                onChange={(v) => set("preferred_contact_method", v)}
                options={[
                  { value: "", label: "Unspecified" },
                  ...CONTACT_METHODS.map((c) => ({ value: c, label: CONTACT_METHOD_LABELS[c] })),
                ]}
              />

              <SelectField
                label="Lead Quality"
                value={form.lead_quality || ""}
                onChange={(v) =>
                  set("lead_quality", (v || undefined) as LeadFormData["lead_quality"])
                }
                options={[
                  { value: "", label: "Unrated" },
                  ...LEAD_QUALITY.map((q) => ({ value: q, label: LEAD_QUALITY_LABELS[q] })),
                ]}
              />

              <div className="space-y-1.5">
                <Label>Next Follow-Up Date</Label>
                <Input
                  type="date"
                  value={form.next_follow_up_date || ""}
                  onChange={(e) => set("next_follow_up_date", e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.impact_interest)}
                    onChange={(e) => set("impact_interest", e.target.checked)}
                  />
                  Interested in impact windows
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.energy_efficiency_interest)}
                    onChange={(e) => set("energy_efficiency_interest", e.target.checked)}
                  />
                  Interested in energy efficiency
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.financing_interest)}
                    onChange={(e) => set("financing_interest", e.target.checked)}
                  />
                  Interested in financing
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.decision_maker)}
                    onChange={(e) => set("decision_maker", e.target.checked)}
                  />
                  Is the decision-maker
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>Campaign Name</Label>
                <Input
                  value={form.campaign_name || ""}
                  onChange={(e) => set("campaign_name", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Referral Partner</Label>
                <Input
                  value={form.referral_partner || ""}
                  onChange={(e) => set("referral_partner", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>UTM Source</Label>
                <Input
                  value={form.utm_source || ""}
                  onChange={(e) => set("utm_source", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>UTM Medium</Label>
                <Input
                  value={form.utm_medium || ""}
                  onChange={(e) => set("utm_medium", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>UTM Campaign</Label>
                <Input
                  value={form.utm_campaign || ""}
                  onChange={(e) => set("utm_campaign", e.target.value)}
                />
              </div>
            </>
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
