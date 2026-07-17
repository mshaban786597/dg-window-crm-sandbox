"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EstimateFormDialog } from "@/components/estimates/estimate-form-dialog";
import { useCRMStore } from "@/lib/store/crm-store";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  SERVICE_LABELS,
  WINDOW_STYLE_LABELS,
  FRAME_MATERIAL_LABELS,
  GLASS_PACKAGE_LABELS,
  PROPERTY_TYPE_LABELS,
  INSTALLATION_METHOD_LABELS,
} from "@/lib/domain";

export default function MeasurementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const estimate = useCRMStore((s) => s.estimates.find((e) => e.id === id));
  const createQuoteFromEstimate = useCRMStore((s) => s.createQuoteFromEstimate);
  const [editOpen, setEditOpen] = useState(false);

  if (!estimate) {
    return (
      <div className="text-center py-20">
        <p>Measurement not found.</p>
        <Button variant="link" asChild>
          <Link href="/estimates">Back to Measurements</Link>
        </Button>
      </div>
    );
  }

  const projectFields = [
    { label: "Project Type", value: estimate.project_type ? PROPERTY_TYPE_LABELS[estimate.project_type] : null },
    { label: "Year Built", value: estimate.year_built },
    { label: "Stories", value: estimate.stories },
    { label: "Siding / Exterior", value: estimate.exterior_type },
    { label: "Access", value: estimate.access_difficulty },
    { label: "Installation Method", value: estimate.installation_method ? INSTALLATION_METHOD_LABELS[estimate.installation_method] : null },
    { label: "Preferred Manufacturer", value: estimate.preferred_manufacturer },
    { label: "Preferred Product Line", value: estimate.preferred_product_line },
    { label: "Lead-safe / Pre-1978", value: estimate.lead_safe_pre1978 != null ? (estimate.lead_safe_pre1978 ? "Yes" : "No") : null },
    { label: "Permit Required", value: estimate.permit_required != null ? (estimate.permit_required ? "Yes" : "No") : null },
    { label: "HOA Approval", value: estimate.hoa_approval_required != null ? (estimate.hoa_approval_required ? "Yes" : "No") : null },
    { label: "Visible Damage", value: estimate.visible_damage != null ? (estimate.visible_damage ? "Yes" : "No") : null },
    { label: "Disposal Required", value: estimate.disposal_required != null ? (estimate.disposal_required ? "Yes" : "No") : null },
  ].filter((f) => f.value != null && f.value !== "");

  const openings = estimate.openings || [];
  const totalUnits = openings.reduce((s, o) => s + (o.quantity || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Measurement — ${estimate.customer_name}`}
        description={`${SERVICE_LABELS[estimate.service_type] || estimate.service_type} · ${estimate.property_address}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/estimates">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button
              className="bg-brand-blue hover:bg-brand-blue-dark"
              onClick={() => {
                const quote = createQuoteFromEstimate(estimate.id);
                if (quote) router.push("/quotes");
              }}
            >
              Create Quote
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={estimate.status} type="measurement" />
        {estimate.scheduled_date && (
          <span className="text-sm text-muted-foreground">
            Appointment: {formatDate(estimate.scheduled_date)}
            {estimate.scheduled_time ? ` at ${estimate.scheduled_time}` : ""}
          </span>
        )}
        {estimate.estimator_name && (
          <span className="text-sm text-muted-foreground">Estimator: {estimate.estimator_name}</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent>
            {projectFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No project details recorded yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {projectFields.map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium">{String(f.value)}</p>
                  </div>
                ))}
              </div>
            )}
            {estimate.estimator_notes && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs text-muted-foreground">Estimator Notes</p>
                <p className="text-sm">{estimate.estimator_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Openings</span>
              <span className="font-medium">{openings.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total Units</span>
              <span className="font-medium">{totalUnits}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span>Estimate Total</span>
              <span className="font-bold text-brand-blue">
                {estimate.total ? formatCurrency(estimate.total) : "Pending quote"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Window Openings ({openings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {openings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No window openings recorded on this measurement.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Room / Location</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Size</th>
                    <th className="py-2 pr-4">Style</th>
                    <th className="py-2 pr-4">Frame</th>
                    <th className="py-2 pr-4">Glass</th>
                    <th className="py-2 pr-4">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {openings.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{o.opening_number}</td>
                      <td className="py-2 pr-4">{o.room_location || "—"}</td>
                      <td className="py-2 pr-4">{o.quantity}</td>
                      <td className="py-2 pr-4">{o.width && o.height ? `${o.width} × ${o.height} ${o.unit}` : "—"}</td>
                      <td className="py-2 pr-4">{o.window_style ? WINDOW_STYLE_LABELS[o.window_style] : "—"}</td>
                      <td className="py-2 pr-4">{o.frame_material ? FRAME_MATERIAL_LABELS[o.frame_material] : "—"}</td>
                      <td className="py-2 pr-4">{o.glass_package ? GLASS_PACKAGE_LABELS[o.glass_package] : "—"}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {[o.impact_required && "Impact", o.tempered && "Tempered", o.egress_required && "Egress", o.obscured_glass && "Obscured"]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EstimateFormDialog open={editOpen} onOpenChange={setEditOpen} estimate={estimate} />
    </div>
  );
}
