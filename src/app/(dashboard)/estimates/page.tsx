"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ruler } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { EstimateFormDialog } from "@/components/estimates/estimate-form-dialog";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SERVICE_LABELS } from "@/lib/domain";
import type { Estimate } from "@/types/database";

export default function MeasurementsPage() {
  const router = useRouter();
  const estimates = useCRMStore((s) => s.estimates);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const [formOpen, setFormOpen] = useState(false);

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (e: Estimate) => (
        <div>
          <p className="font-medium">{e.customer_name}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[220px]">{e.property_address}</p>
        </div>
      ),
    },
    { key: "service", header: "Service", render: (e: Estimate) => SERVICE_LABELS[e.service_type] || e.service_type },
    { key: "estimator", header: "Estimator", render: (e: Estimate) => e.estimator_name || "—" },
    {
      key: "openings",
      header: "Openings",
      render: (e: Estimate) => {
        const units = (e.openings || []).reduce((s, o) => s + (o.quantity || 0), 0);
        return e.openings?.length ? `${e.openings.length} / ${units} units` : "—";
      },
    },
    { key: "total", header: "Total", render: (e: Estimate) => (e.total ? formatCurrency(e.total) : "Pending") },
    { key: "status", header: "Status", render: (e: Estimate) => <StatusBadge status={e.status} type="measurement" /> },
    {
      key: "date",
      header: "Appointment",
      render: (e: Estimate) => (e.scheduled_date ? formatDate(e.scheduled_date) : formatDate(e.created_at)),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Measurements & Estimates"
        description="Window measurements, openings, and estimate details"
        actions={
          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => setFormOpen(true)}>
            + Schedule Measurement
          </Button>
        }
      />
      {!hydrated ? (
        <p className="py-16 text-center text-muted-foreground">Loading…</p>
      ) : estimates.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="No measurements scheduled"
          description="Schedule a measurement to capture window openings and build an estimate."
          action={
            <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => setFormOpen(true)}>
              Schedule First Measurement
            </Button>
          }
        />
      ) : (
        <DataTable data={estimates} columns={columns} onRowClick={(e) => router.push(`/estimates/${e.id}`)} />
      )}
      <EstimateFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
