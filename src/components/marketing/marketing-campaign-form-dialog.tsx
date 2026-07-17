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
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import type { MarketingCampaign } from "@/types/database";
import type { MarketingCampaignFormData } from "@/lib/store/form-types";
import type { ServiceType } from "@/lib/domain";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

const EMPTY: MarketingCampaignFormData = {
  name: "",
  source: "website_form",
  city: "",
  county: "",
  service_type: undefined,
  spend: 0,
  leads_generated: 0,
  qualified_leads: 0,
  measurements_booked: 0,
  proposals_issued: 0,
  jobs_won: 0,
  estimated_revenue: 0,
  sold_revenue: 0,
  collected_revenue: 0,
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: MarketingCampaign | null;
}

/** Safe ratio helper — returns null when denominator is 0 so callers can render "—". */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function MarketingCampaignFormDialog({ open, onOpenChange, campaign }: Props) {
  const addMarketingCampaign = useCRMStore((s) => s.addMarketingCampaign);
  const updateMarketingCampaign = useCRMStore((s) => s.updateMarketingCampaign);
  const showToast = useCRMStore((s) => s.showToast);
  const services = useSettingsStore((s) => s.services).filter((o) => o.enabled);

  const [form, setForm] = useState<MarketingCampaignFormData>(EMPTY);

  useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name,
        source: campaign.source,
        city: campaign.city ?? "",
        county: campaign.county ?? "",
        service_type: campaign.service_type,
        spend: campaign.spend,
        leads_generated: campaign.leads_generated,
        qualified_leads: campaign.qualified_leads,
        measurements_booked: campaign.measurements_booked,
        proposals_issued: campaign.proposals_issued,
        jobs_won: campaign.jobs_won,
        estimated_revenue: campaign.estimated_revenue,
        sold_revenue: campaign.sold_revenue,
        collected_revenue: campaign.collected_revenue,
        notes: campaign.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [campaign, open]);

  // Derived metrics — every ratio guards divide-by-zero and renders "—".
  const costPerLead = ratio(form.spend, form.leads_generated);
  const costPerQualified = ratio(form.spend, form.qualified_leads);
  const costPerMeasurement = ratio(form.spend, form.measurements_booked);
  const costPerAcquisition = ratio(form.spend, form.jobs_won);
  const quoteToSale = ratio(form.jobs_won, form.proposals_issued);
  const roas = ratio(form.sold_revenue, form.spend);

  const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
  const mult = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}x`);

  const setNum = (key: keyof MarketingCampaignFormData) => (value: string) => {
    const parsed = Number(value);
    setForm((f) => ({ ...f, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.source) {
      showToast("error", "Campaign name and channel are required");
      return;
    }
    if (campaign) updateMarketingCampaign(campaign.id, form);
    else addMarketingCampaign(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit Campaign" : "Add Campaign"}</DialogTitle>
          <DialogDescription>
            Track window campaign spend, funnel, and revenue performance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Campaign Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Spring Window Replacement Push"
              />
            </div>

            <SelectField
              label="Channel *"
              value={typeof form.source === "string" ? form.source : ""}
              onChange={(v) => setForm((f) => ({ ...f, source: v }))}
              options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))}
            />
            <SelectField
              label="Service"
              value={form.service_type ?? ""}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  service_type: v ? (v as ServiceType) : undefined,
                }))
              }
              options={[
                { value: "", label: "Not specified" },
                ...services.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />

            <div>
              <Label>City</Label>
              <Input
                value={form.city ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={form.county ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))}
                placeholder="Region or service area"
              />
            </div>

            <div>
              <Label>Spend ($)</Label>
              <Input
                type="number"
                min={0}
                value={form.spend}
                onChange={(e) => setNum("spend")(e.target.value)}
              />
            </div>
            <div>
              <Label>Leads Generated</Label>
              <Input
                type="number"
                min={0}
                value={form.leads_generated}
                onChange={(e) => setNum("leads_generated")(e.target.value)}
              />
            </div>
            <div>
              <Label>Qualified Leads</Label>
              <Input
                type="number"
                min={0}
                value={form.qualified_leads}
                onChange={(e) => setNum("qualified_leads")(e.target.value)}
              />
            </div>
            <div>
              <Label>Measurements Booked</Label>
              <Input
                type="number"
                min={0}
                value={form.measurements_booked}
                onChange={(e) => setNum("measurements_booked")(e.target.value)}
              />
            </div>
            <div>
              <Label>Proposals Issued</Label>
              <Input
                type="number"
                min={0}
                value={form.proposals_issued}
                onChange={(e) => setNum("proposals_issued")(e.target.value)}
              />
            </div>
            <div>
              <Label>Jobs Won</Label>
              <Input
                type="number"
                min={0}
                value={form.jobs_won}
                onChange={(e) => setNum("jobs_won")(e.target.value)}
              />
            </div>
            <div>
              <Label>Estimated Revenue ($)</Label>
              <Input
                type="number"
                min={0}
                value={form.estimated_revenue}
                onChange={(e) => setNum("estimated_revenue")(e.target.value)}
              />
            </div>
            <div>
              <Label>Sold Revenue ($)</Label>
              <Input
                type="number"
                min={0}
                value={form.sold_revenue}
                onChange={(e) => setNum("sold_revenue")(e.target.value)}
              />
            </div>
            <div>
              <Label>Collected Revenue ($)</Label>
              <Input
                type="number"
                min={0}
                value={form.collected_revenue}
                onChange={(e) => setNum("collected_revenue")(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-lg bg-primary/5 p-3 text-sm sm:grid-cols-3">
              <p className="flex flex-col">
                <span className="text-muted-foreground">Cost / Lead</span>
                <strong>{money(costPerLead)}</strong>
              </p>
              <p className="flex flex-col">
                <span className="text-muted-foreground">Cost / Qualified</span>
                <strong>{money(costPerQualified)}</strong>
              </p>
              <p className="flex flex-col">
                <span className="text-muted-foreground">Cost / Measurement</span>
                <strong>{money(costPerMeasurement)}</strong>
              </p>
              <p className="flex flex-col">
                <span className="text-muted-foreground">Cost / Acquisition</span>
                <strong>{money(costPerAcquisition)}</strong>
              </p>
              <p className="flex flex-col">
                <span className="text-muted-foreground">Quote-to-Sale</span>
                <strong>{pct(quoteToSale)}</strong>
              </p>
              <p className="flex flex-col">
                <span className="text-muted-foreground">ROAS</span>
                <strong>{mult(roas)}</strong>
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">
              Save Campaign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
