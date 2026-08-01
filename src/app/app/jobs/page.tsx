"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { JobFormDialog } from "@/components/jobs/job-form-dialog";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SERVICE_LABELS, JOB_STAGES, JOB_STAGE_LABELS } from "@/lib/constants";
import type { Job } from "@/types/database";

export default function JobsPage() {
  const router = useRouter();
  const jobs = useCRMStore((s) => s.jobs);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(
    () =>
      stageFilter === "all"
        ? jobs
        : jobs.filter((j) => j.stage === stageFilter),
    [jobs, stageFilter]
  );

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (j: Job) => (
        <div>
          <p className="font-medium">{j.customer_name}</p>
          <p className="text-xs text-muted-foreground">
            {j.address}
            {j.city ? `, ${j.city}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "service",
      header: "Service",
      render: (j: Job) => SERVICE_LABELS[j.service_type] ?? j.service_type,
    },
    {
      key: "units",
      header: "Units",
      render: (j: Job) => (j.units_count ? j.units_count : "—"),
    },
    {
      key: "crew",
      header: "Crew",
      render: (j: Job) => j.crew_name || "Unassigned",
    },
    {
      key: "value",
      header: "Value",
      render: (j: Job) => formatCurrency(j.job_value),
    },
    {
      key: "stage",
      header: "Stage",
      render: (j: Job) => <StatusBadge status={j.stage} type="job" />,
    },
    {
      key: "start",
      header: "Install Date",
      render: (j: Job) => (j.start_date ? formatDate(j.start_date) : "—"),
    },
  ];

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading CRM data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Management"
        description="Track window installation jobs from deposit to final walkthrough."
        actions={
          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => setFormOpen(true)}>
            + Add Job
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setStageFilter("all")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${
            stageFilter === "all"
              ? "bg-brand-blue text-white border-brand-blue"
              : "hover:bg-muted"
          }`}
        >
          All ({jobs.length})
        </button>
        {JOB_STAGES.map((stage) => {
          const count = jobs.filter((j) => j.stage === stage).length;
          return (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${
                stageFilter === stage
                  ? "bg-brand-blue text-white border-brand-blue"
                  : "hover:bg-muted"
              }`}
            >
              {JOB_STAGE_LABELS[stage]} ({count})
            </button>
          );
        })}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="No jobs scheduled"
          description="Create a job from an accepted quote or add one directly to start tracking installation work."
          action={
            <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => setFormOpen(true)}>
              + Add First Job
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="No jobs in this stage"
          description="Try a different stage filter to see your jobs."
          action={
            <Button variant="outline" onClick={() => setStageFilter("all")}>
              Show all jobs
            </Button>
          }
        />
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          onRowClick={(j) => router.push(`/app/jobs/${j.id}`)}
        />
      )}

      <JobFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
