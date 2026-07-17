"use client";

import { useState } from "react";
import { Pencil, Trash2, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { MarketingCampaignFormDialog } from "@/components/marketing/marketing-campaign-form-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCRMStore } from "@/lib/store/crm-store";
import type { MarketingCampaign } from "@/types/database";
import { LEAD_SOURCE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

/** Safe ratio — null when denominator is 0 so we never render NaN. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const mult = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}x`);

export default function MarketingPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<MarketingCampaign | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const hydrated = useCRMStore((s) => s._hasHydrated);
  const campaigns = useCRMStore((s) => s.marketingCampaigns);
  const deleteMarketingCampaign = useCRMStore((s) => s.deleteMarketingCampaign);

  const openAdd = () => {
    setEditCampaign(null);
    setFormOpen(true);
  };

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  // Program-level roll-up (safe when empty).
  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      leads: acc.leads + c.leads_generated,
      jobsWon: acc.jobsWon + c.jobs_won,
      sold: acc.sold + c.sold_revenue,
    }),
    { spend: 0, leads: 0, jobsWon: 0, sold: 0 }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Track window campaign spend, funnel performance, and return on ad spend."
        actions={
          <Button className="bg-primary hover:bg-brand-blue-dark" onClick={openAdd}>
            + Add Campaign
          </Button>
        }
      />

      {campaigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">Total Spend</p>
              <p className="text-2xl font-bold tracking-tight">{formatCurrency(totals.spend)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">Leads Generated</p>
              <p className="text-2xl font-bold tracking-tight">{totals.leads}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">Jobs Won</p>
              <p className="text-2xl font-bold tracking-tight">{totals.jobsWon}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">Blended ROAS</p>
              <p className="text-2xl font-bold tracking-tight">
                {mult(ratio(totals.sold, totals.spend))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marketing Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No campaigns created"
              description="Add a campaign to track spend, funnel conversion, and return on ad spend."
              action={
                <Button className="bg-primary hover:bg-brand-blue-dark" onClick={openAdd}>
                  Add First Campaign
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3">Campaign</th>
                    <th className="pb-2 pr-3">Channel</th>
                    <th className="pb-2 pr-3">Spend</th>
                    <th className="pb-2 pr-3">Leads</th>
                    <th className="pb-2 pr-3">Cost / Lead</th>
                    <th className="pb-2 pr-3">Cost / Qual.</th>
                    <th className="pb-2 pr-3">Cost / Meas.</th>
                    <th className="pb-2 pr-3">CPA</th>
                    <th className="pb-2 pr-3">Quote-to-Sale</th>
                    <th className="pb-2 pr-3">ROAS</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const sourceLabel =
                      LEAD_SOURCE_LABELS[c.source] ?? c.source;
                    return (
                      <tr key={c.id} className="border-b">
                        <td className="py-2 pr-3 font-medium">{c.name}</td>
                        <td className="py-2 pr-3">{sourceLabel}</td>
                        <td className="py-2 pr-3">{formatCurrency(c.spend)}</td>
                        <td className="py-2 pr-3">{c.leads_generated}</td>
                        <td className="py-2 pr-3">{money(ratio(c.spend, c.leads_generated))}</td>
                        <td className="py-2 pr-3">{money(ratio(c.spend, c.qualified_leads))}</td>
                        <td className="py-2 pr-3">
                          {money(ratio(c.spend, c.measurements_booked))}
                        </td>
                        <td className="py-2 pr-3">{money(ratio(c.spend, c.jobs_won))}</td>
                        <td className="py-2 pr-3">
                          {pct(ratio(c.jobs_won, c.proposals_issued))}
                        </td>
                        <td className="py-2 pr-3">{mult(ratio(c.sold_revenue, c.spend))}</td>
                        <td className="py-2 whitespace-nowrap">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditCampaign(c);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => setDeleteId(c.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <MarketingCampaignFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        campaign={editCampaign}
      />
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Campaign"
        description="Remove this marketing campaign?"
        onConfirm={() => deleteId && deleteMarketingCampaign(deleteId)}
      />
    </div>
  );
}
