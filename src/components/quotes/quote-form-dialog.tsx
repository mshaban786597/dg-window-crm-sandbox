"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import type { Quote, QuoteLineItem } from "@/types/database";
import type { QuoteFormData } from "@/lib/store/form-types";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  OPTIONAL_UPGRADES,
  OPTIONAL_UPGRADE_LABELS,
} from "@/lib/domain";
import { formatCurrency } from "@/lib/utils";

const LINE_CATEGORIES: { value: string; label: string }[] = [
  { value: "window_unit", label: "Window Unit" },
  { value: "glass_energy_upgrade", label: "Glass / Energy Upgrade" },
  { value: "impact_upgrade", label: "Impact-Rated Upgrade" },
  { value: "grid_upgrade", label: "Grid Upgrade" },
  { value: "screen_upgrade", label: "Screen Upgrade" },
  { value: "interior_trim", label: "Interior Trim" },
  { value: "exterior_capping", label: "Exterior Capping" },
  { value: "installation_labor", label: "Installation Labor" },
  { value: "removal_disposal", label: "Removal & Disposal" },
  { value: "permit_fees", label: "Permit Fees" },
  { value: "delivery_freight", label: "Delivery / Freight" },
  { value: "additional_work", label: "Additional Work" },
];

const lid = () => `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function newLineItem(category = "window_unit"): QuoteLineItem {
  return { id: lid(), description: "", category, quantity: 1, unit_price: 0, total: 0 };
}

const emptyForm = (taxRate: number): QuoteFormData => ({
  customer_name: "",
  property_address: "",
  service_type: "window_replacement",
  scope_of_work: "",
  line_items: [],
  discount: 0,
  tax_rate: taxRate,
  deposit_amount: undefined,
  optional_upgrades: [],
  financing_option: "",
  production_lead_time: "",
  installation_duration: "",
  warranty_notes: "",
  expires_at: "",
  status: "draft",
});

interface QuoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null;
  defaultLeadId?: string;
  defaultEstimateId?: string;
}

export function QuoteFormDialog({ open, onOpenChange, quote, defaultLeadId }: QuoteFormDialogProps) {
  const leads = useCRMStore((s) => s.leads);
  const customers = useCRMStore((s) => s.customers);
  const addQuote = useCRMStore((s) => s.addQuote);
  const updateQuote = useCRMStore((s) => s.updateQuote);
  const showToast = useCRMStore((s) => s.showToast);
  const services = useSettingsStore((s) => s.services).filter((o) => o.enabled);
  const taxRate = useSettingsStore((s) => s.tax_rate);
  const validityDays = useSettingsStore((s) => s.proposal_validity_days);

  const [form, setForm] = useState<QuoteFormData>(emptyForm(taxRate));
  const [linkType, setLinkType] = useState<"lead" | "customer">("lead");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (quote) {
      setForm({
        lead_id: quote.lead_id,
        customer_id: quote.customer_id,
        customer_name: quote.customer_name,
        property_address: quote.property_address,
        service_type: quote.service_type,
        scope_of_work: quote.scope_of_work,
        estimate_id: quote.estimate_id,
        line_items: quote.line_items || [],
        discount: quote.discount,
        tax_rate: quote.subtotal > 0 ? (quote.tax / Math.max(quote.subtotal - quote.discount, 1)) * 100 : taxRate,
        deposit_amount: quote.deposit_amount,
        optional_upgrades: quote.optional_upgrades || [],
        financing_option: quote.financing_option || "",
        production_lead_time: quote.production_lead_time || "",
        installation_duration: quote.installation_duration || "",
        warranty_notes: quote.warranty_notes || "",
        expires_at: quote.expires_at?.slice(0, 10) || "",
        status: quote.status,
        internal_notes: quote.internal_notes,
        customer_notes: quote.customer_notes,
      });
      setLinkType(quote.lead_id ? "lead" : "customer");
    } else {
      const lead = defaultLeadId ? leads.find((l) => l.id === defaultLeadId) : null;
      const base = emptyForm(taxRate);
      if (validityDays > 0) {
        const exp = new Date();
        exp.setDate(exp.getDate() + validityDays);
        base.expires_at = exp.toISOString().slice(0, 10);
      }
      if (lead) {
        setForm({
          ...base,
          lead_id: lead.id,
          customer_name: lead.full_name,
          property_address: [lead.address, lead.city].filter(Boolean).join(", "),
          service_type: lead.service_requested,
        });
        setLinkType("lead");
      } else {
        setForm(base);
      }
    }
    setErrors({});
  }, [quote, open, defaultLeadId, leads, taxRate, validityDays]);

  const totals = useMemo(() => {
    const subtotal = form.line_items.reduce((s, li) => s + (li.quantity || 0) * (li.unit_price || 0), 0);
    const taxable = Math.max(0, subtotal - (form.discount || 0));
    const tax = taxable * ((form.tax_rate || 0) / 100);
    return { subtotal, tax, total: taxable + tax };
  }, [form.line_items, form.discount, form.tax_rate]);

  const set = <K extends keyof QuoteFormData>(key: K, value: QuoteFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addItem = (category = "window_unit") =>
    setForm((f) => ({ ...f, line_items: [...f.line_items, newLineItem(category)] }));
  const removeItem = (id: string) =>
    setForm((f) => ({ ...f, line_items: f.line_items.filter((li) => li.id !== id) }));
  const patchItem = (id: string, patch: Partial<QuoteLineItem>) =>
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((li) => (li.id === id ? { ...li, ...patch } : li)),
    }));

  const toggleUpgrade = (value: string) =>
    setForm((f) => {
      const list = f.optional_upgrades || [];
      return {
        ...f,
        optional_upgrades: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  const handleLinkChange = (type: "lead" | "customer", id: string) => {
    setLinkType(type);
    if (type === "lead") {
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        setForm((f) => ({
          ...f,
          lead_id: id,
          customer_id: lead.customer_id,
          customer_name: lead.full_name,
          property_address: [lead.address, lead.city].filter(Boolean).join(", "),
          service_type: lead.service_requested,
        }));
      }
    } else {
      const customer = customers.find((c) => c.id === id);
      if (customer) {
        setForm((f) => ({
          ...f,
          lead_id: undefined,
          customer_id: id,
          customer_name: customer.full_name,
          property_address: [customer.address, customer.city].filter(Boolean).join(", "),
        }));
      }
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim()) e.customer_name = "Customer name required";
    if (!form.property_address.trim()) e.property_address = "Address required";
    if (!form.scope_of_work.trim()) e.scope_of_work = "Scope of work required";
    if (!form.lead_id && !form.customer_id && !quote) e.link = "Select a lead or customer";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      showToast("error", "Please fill in required fields");
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: QuoteFormData = {
        ...form,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
      };
      if (quote) updateQuote(quote.id, payload);
      else addQuote(payload);
      onOpenChange(false);
    } catch {
      // toast shown in store
    } finally {
      setSaving(false);
    }
  };

  const serviceOptions = services.length
    ? services.map((o) => ({ value: o.value, label: o.label }))
    : [{ value: form.service_type, label: form.service_type }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{quote ? "Edit Quote" : "Create Quote"}</DialogTitle>
          <DialogDescription>Build a window proposal from line items with live totals</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Link To"
              value={linkType}
              onChange={(v) => setLinkType(v as "lead" | "customer")}
              options={[{ value: "lead", label: "Lead" }, { value: "customer", label: "Customer" }]}
            />
            <SelectField
              label={linkType === "lead" ? "Select Lead" : "Select Customer"}
              value={linkType === "lead" ? form.lead_id || "" : form.customer_id || ""}
              onChange={(v) => handleLinkChange(linkType, v)}
              error={errors.link}
              options={[
                { value: "", label: "Select..." },
                ...(linkType === "lead"
                  ? leads.map((l) => ({ value: l.id, label: l.full_name }))
                  : customers.map((c) => ({ value: c.id, label: c.full_name }))),
              ]}
            />
            <div className="space-y-1.5">
              <Label>Customer Name *</Label>
              <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Property Address *</Label>
              <Input value={form.property_address} onChange={(e) => set("property_address", e.target.value)} />
            </div>
            <SelectField label="Service Type" value={form.service_type} onChange={(v) => set("service_type", v as QuoteFormData["service_type"])} options={serviceOptions} />
            <SelectField label="Quote Status" value={form.status} onChange={(v) => set("status", v as QuoteFormData["status"])} options={QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s] }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Scope of Work *</Label>
            <Textarea value={form.scope_of_work} onChange={(e) => set("scope_of_work", e.target.value)} rows={2} />
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Line Items</h3>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => addItem("window_unit")}>
                  <Plus className="h-3.5 w-3.5" /> Window Unit
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => addItem("installation_labor")}>
                  <Plus className="h-3.5 w-3.5" /> Line Item
                </Button>
              </div>
            </div>

            {form.line_items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No line items yet. Add window units or other charges — totals are calculated from these.
              </p>
            ) : (
              <div className="space-y-2">
                {form.line_items.map((li) => (
                  <div key={li.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border p-3">
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Category</Label>
                      <SelectField value={li.category || "window_unit"} onChange={(v) => patchItem(li.id, { category: v })} options={LINE_CATEGORIES} />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-xs">Description</Label>
                      <Input value={li.description} onChange={(e) => patchItem(li.id, { description: e.target.value })} />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={0} value={li.quantity} onChange={(e) => patchItem(li.id, { quantity: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-xs">Unit Price</Label>
                      <Input type="number" min={0} value={li.unit_price} onChange={(e) => patchItem(li.id, { unit_price: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3 sm:col-span-1 text-right text-sm font-medium">
                      {formatCurrency((li.quantity || 0) * (li.unit_price || 0))}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button type="button" size="icon" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => removeItem(li.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional upgrades */}
          <div className="space-y-2">
            <Label>Optional Upgrades</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTIONAL_UPGRADES.map((u) => (
                <label key={u} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-blue"
                    checked={(form.optional_upgrades || []).includes(u)}
                    onChange={() => toggleUpgrade(u)}
                  />
                  {OPTIONAL_UPGRADE_LABELS[u]}
                </label>
              ))}
            </div>
          </div>

          {/* Money */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Discount ($)</Label>
              <Input type="number" min={0} value={form.discount} onChange={(e) => set("discount", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Rate (%)</Label>
              <Input type="number" min={0} step={0.1} value={form.tax_rate} onChange={(e) => set("tax_rate", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Deposit ($)</Label>
              <Input type="number" min={0} value={form.deposit_amount ?? ""} onChange={(e) => set("deposit_amount", Number(e.target.value) || undefined)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expires</Label>
              <Input type="date" value={form.expires_at || ""} onChange={(e) => set("expires_at", e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(form.discount || 0)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(totals.tax)}</span></div>
            <div className="flex justify-between font-bold text-lg text-brand-blue border-t pt-2">
              <span>Total</span><span>{formatCurrency(totals.total)}</span>
            </div>
          </div>

          {/* Terms */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Financing Option</Label>
              <Input value={form.financing_option || ""} onChange={(e) => set("financing_option", e.target.value)} placeholder="e.g. 12-month plan" />
            </div>
            <div className="space-y-1.5">
              <Label>Production Lead Time</Label>
              <Input value={form.production_lead_time || ""} onChange={(e) => set("production_lead_time", e.target.value)} placeholder="e.g. 4–6 weeks" />
            </div>
            <div className="space-y-1.5">
              <Label>Installation Duration</Label>
              <Input value={form.installation_duration || ""} onChange={(e) => set("installation_duration", e.target.value)} placeholder="e.g. 1–2 days" />
            </div>
            <div className="space-y-1.5">
              <Label>Warranty</Label>
              <Input value={form.warranty_notes || ""} onChange={(e) => set("warranty_notes", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Internal Notes</Label>
              <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Customer Notes</Label>
              <Textarea value={form.customer_notes || ""} onChange={(e) => set("customer_notes", e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-brand-blue hover:bg-brand-blue-dark" disabled={saving}>
              {saving ? "Saving..." : quote ? "Update Quote" : "Save Quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
