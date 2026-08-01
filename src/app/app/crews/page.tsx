"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useCRMStore } from "@/lib/store/crm-store";
import { HardHat, Phone, Wrench, Pencil, Trash2 } from "lucide-react";
import { CrewFormDialog } from "@/components/crews/crew-form-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { CREW_STATUS_LABELS } from "@/lib/constants";
import type { Crew } from "@/types/database";

const ACTIVE_JOB_STAGES = [
  "installation_scheduled",
  "crew_assigned",
  "in_progress",
] as const;

export default function CrewsPage() {
  const jobs = useCRMStore((s) => s.jobs);
  const crews = useCRMStore((s) => s.crews);
  const deleteCrew = useCRMStore((s) => s.deleteCrew);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const [formOpen, setFormOpen] = useState(false);
  const [editCrew, setEditCrew] = useState<Crew | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const todayJobs = jobs.filter((j) =>
    (ACTIVE_JOB_STAGES as readonly string[]).includes(j.stage)
  );

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
        title="Crew Management"
        description="Field crews for window installations, repairs, and service"
        actions={
          <Button
            className="bg-primary hover:bg-brand-blue-dark"
            onClick={() => {
              setEditCrew(null);
              setFormOpen(true);
            }}
          >
            + Add Crew
          </Button>
        }
      />

      {crews.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="No crews added"
          description="Add your first installation crew to schedule and assign window jobs."
          action={
            <Button
              className="bg-primary hover:bg-brand-blue-dark"
              onClick={() => {
                setEditCrew(null);
                setFormOpen(true);
              }}
            >
              Add First Crew
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {crews.map((crew) => (
            <Card key={crew.id}>
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue-light">
                  <HardHat className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base">{crew.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">Lead: {crew.lead_name}</p>
                </div>
                {crew.status && (
                  <span className="ml-auto rounded-full bg-brand-blue-light px-2.5 py-0.5 text-xs font-medium text-primary shrink-0">
                    {CREW_STATUS_LABELS[crew.status]}
                  </span>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" /> {crew.phone}
                </div>
                {crew.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {crew.skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-muted px-2 py-0.5 text-xs">{skill}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-4 text-sm">
                  <span><strong className="text-primary">{crew.active_jobs}</strong> active</span>
                  <span><strong>{crew.completed_jobs}</strong> completed</span>
                  <span>{crew.member_count} members</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditCrew(crew); setFormOpen(true); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDeleteId(crew.id)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CrewFormDialog open={formOpen} onOpenChange={setFormOpen} crew={editCrew} />
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Crew"
        description="Remove this crew from the system?"
        onConfirm={() => deleteId && deleteCrew(deleteId)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s Jobs — Field Crew View</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {todayJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No jobs scheduled for a crew yet.
            </p>
          ) : (
            todayJobs.map((job) => (
              <Link
                key={job.id}
                href={`/app/jobs/${job.id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-4 hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{job.customer_name}</p>
                  <p className="text-sm text-muted-foreground">{job.address}, {job.city}</p>
                  <p className="text-sm flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3" /> {job.customer_phone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{job.crew_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{job.service_type.replace(/_/g, " ")}</p>
                  <Button size="sm" variant="outline" className="mt-2">
                    <Wrench className="h-3 w-3 mr-1" /> Open Job
                  </Button>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
