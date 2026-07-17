"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, Phone, MapPin, Camera, CheckSquare, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { JobFormDialog } from "@/components/jobs/job-form-dialog";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SERVICE_LABELS, JOB_STAGE_LABELS } from "@/lib/constants";
import type { Job } from "@/types/database";

const humanize = (v?: string) =>
  v ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

function ChecklistCard({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckSquare className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded border-gray-300" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const job = useCRMStore((s) => s.jobs.find((j) => j.id === id));
  const crews = useCRMStore((s) => s.crews);
  const updateJobStage = useCRMStore((s) => s.updateJobStage);
  const assignCrewToJob = useCRMStore((s) => s.assignCrewToJob);
  const createReviewFromJob = useCRMStore((s) => s.createReviewFromJob);
  const showToast = useCRMStore((s) => s.showToast);
  const [editOpen, setEditOpen] = useState(false);

  if (!job) {
    return (
      <div className="text-center py-20">
        <p>Job not found.</p>
        <Button variant="link" asChild><Link href="/jobs">Back</Link></Button>
      </div>
    );
  }

  const canRequestReview = ["completed", "paid", "invoice_sent", "quality_check", "punch_list"].includes(job.stage);
  const reviewDone =
    job.review_request_status === "requested" ||
    job.review_request_status === "sent" ||
    job.review_request_status === "received";

  const hasChecklists =
    (job.pre_install_checklist && job.pre_install_checklist.length > 0) ||
    (job.installation_checklist && job.installation_checklist.length > 0) ||
    (job.quality_control_checklist && job.quality_control_checklist.length > 0) ||
    (job.punch_list && job.punch_list.length > 0);

  const handleRequestReview = () => {
    const review = createReviewFromJob(job.id);
    showToast(review ? "success" : "error", review ? "Review requested" : "Could not create review");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.customer_name}
        description={`${SERVICE_LABELS[job.service_type] ?? job.service_type} — ${job.address}${job.city ? `, ${job.city}` : ""}`}
        actions={
          <>
            <Button variant="outline" asChild><Link href="/jobs"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>Edit Job</Button>
            <Button variant="outline" disabled title="Photo upload — coming soon">
              <Camera className="h-4 w-4 mr-1" /> Upload Photos
            </Button>
            {job.stage !== "completed" && (
              <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => updateJobStage(job.id, "completed")}>
                Mark Completed
              </Button>
            )}
            {canRequestReview && !reviewDone && (
              <Button variant="outline" onClick={handleRequestReview}>
                <Star className="h-4 w-4 mr-1" /> Request Review
              </Button>
            )}
            <Button variant="outline" disabled title="Invoice integration — coming soon">
              Send Invoice
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <SelectField
            label="Assign Crew"
            value={job.crew_id || ""}
            onChange={(v) => v && assignCrewToJob(job.id, v)}
            options={[{ value: "", label: "Unassigned" }, ...crews.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <SelectField
            label="Update Stage"
            value={job.stage}
            onChange={(v) => updateJobStage(job.id, v as Job["stage"])}
            options={Object.entries(JOB_STAGE_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Job Details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3"><Phone className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Customer Phone</p><p className="text-sm">{job.customer_phone || "—"}</p></div></div>
              <div className="flex gap-3"><MapPin className="h-4 w-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Address</p><p className="text-sm">{job.address}{job.city ? `, ${job.city}` : ""}</p></div></div>
              <div><p className="text-xs text-muted-foreground">Crew</p><p className="text-sm">{job.crew_name || "Unassigned"}</p></div>
              <div><p className="text-xs text-muted-foreground">Job Value</p><p className="text-sm font-semibold text-brand-blue">{formatCurrency(job.job_value)}</p></div>
              <div><p className="text-xs text-muted-foreground">Window Units</p><p className="text-sm">{job.units_count ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Estimated Install Days</p><p className="text-sm">{job.estimated_install_days ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Install Start Date</p><p className="text-sm">{job.start_date ? formatDate(job.start_date) : "TBD"}</p></div>
              <div><p className="text-xs text-muted-foreground">Priority</p><p className="text-sm capitalize">{job.priority}</p></div>
              <div><p className="text-xs text-muted-foreground">Review Status</p><p className="text-sm">{humanize(job.review_request_status) || "Not Requested"}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Fulfillment Status</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Deposit</p><p className="text-sm">{humanize(job.deposit_status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Material Delivery</p><p className="text-sm">{humanize(job.material_delivery_status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Permit</p><p className="text-sm">{humanize(job.permit_status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Inspection</p><p className="text-sm">{humanize(job.inspection_status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Final Walkthrough</p><p className="text-sm">{humanize(job.final_walkthrough_status)}</p></div>
            </CardContent>
          </Card>

          {(job.internal_notes || job.customer_notes) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {job.customer_notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Customer Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{job.customer_notes}</p>
                  </div>
                )}
                {job.internal_notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Internal Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{job.internal_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {hasChecklists ? (
            <>
              <ChecklistCard title="Pre-Install Checklist" items={job.pre_install_checklist} />
              <ChecklistCard title="Installation Checklist" items={job.installation_checklist} />
              <ChecklistCard title="Quality Control Checklist" items={job.quality_control_checklist} />
              <ChecklistCard title="Punch List" items={job.punch_list} />
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" /> Checklists
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No checklist items yet. Pre-install, installation, and quality-control checklists appear here once added to the job.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Job Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(JOB_STAGE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => updateJobStage(job.id, key as Job["stage"])}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left ${
                  job.stage === key
                    ? "bg-brand-blue-light font-medium text-brand-blue"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${job.stage === key ? "bg-brand-blue" : "bg-gray-300"}`} />
                {label}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <JobFormDialog open={editOpen} onOpenChange={setEditOpen} job={job} />
    </div>
  );
}
