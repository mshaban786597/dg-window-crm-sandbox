"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  SERVICE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
} from "@/lib/constants";
import type { Lead } from "@/types/database";

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const leads = useCRMStore((s) => s.leads);
  const deleteLead = useCRMStore((s) => s.deleteLead);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const enabledServices = useSettingsStore((s) => s.services).filter((o) => o.enabled);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setEditingLead(null);
      setFormOpen(true);
    }
  }, [searchParams]);

  const serviceOptions =
    enabledServices.length > 0
      ? enabledServices.map((o) => ({ value: o.value, label: o.label }))
      : Object.entries(SERVICE_LABELS).map(([value, label]) => ({ value, label }));

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        !search ||
        lead.full_name.toLowerCase().includes(search.toLowerCase()) ||
        lead.city.toLowerCase().includes(search.toLowerCase()) ||
        lead.phone.includes(search);
      const matchStage = stageFilter === "all" || lead.status === stageFilter;
      const matchSource = sourceFilter === "all" || lead.lead_source === sourceFilter;
      const matchService = serviceFilter === "all" || lead.service_requested === serviceFilter;
      return matchSearch && matchStage && matchSource && matchService;
    });
  }, [leads, search, stageFilter, sourceFilter, serviceFilter]);

  const handleDelete = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete lead "${lead.full_name}"? This cannot be undone.`)) {
      deleteLead(lead.id);
    }
  };

  const handleEdit = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLead(lead);
    setFormOpen(true);
  };

  const openNewLead = () => {
    setEditingLead(null);
    setFormOpen(true);
  };

  const columns = [
    {
      key: "name",
      header: "Lead",
      render: (lead: Lead) => (
        <div>
          <p className="font-medium">{lead.full_name}</p>
          <p className="text-xs text-muted-foreground">{lead.phone}</p>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (lead: Lead) => (
        <div>
          <p>{lead.city || "—"}</p>
          {lead.county && <p className="text-xs text-muted-foreground">{lead.county}</p>}
        </div>
      ),
    },
    {
      key: "service",
      header: "Service",
      render: (lead: Lead) => (
        <span className="text-sm">
          {SERVICE_LABELS[lead.service_requested] ?? lead.service_requested}
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (lead: Lead) => <StatusBadge status={lead.lead_source} type="source" />,
    },
    {
      key: "value",
      header: "Est. Value",
      render: (lead: Lead) =>
        lead.estimated_project_value ? formatCurrency(lead.estimated_project_value) : "—",
    },
    {
      key: "status",
      header: "Stage",
      render: (lead: Lead) => <StatusBadge status={lead.status} type="lead" />,
    },
    {
      key: "date",
      header: "Created",
      render: (lead: Lead) => (
        <span className="text-muted-foreground">{formatDate(lead.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (lead: Lead) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => handleEdit(lead, e)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={(e) => handleDelete(lead, e)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading CRM data...
      </div>
    );
  }

  const hasLeads = leads.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Management"
        description={`${leads.length} leads — window sales pipeline`}
        actions={
          <Button className="bg-primary hover:bg-brand-blue-dark" onClick={openNewLead}>
            + Add Lead
          </Button>
        }
      />

      {!hasLeads ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Add your first window project lead to start building your sales pipeline."
          action={
            <Button className="bg-primary hover:bg-brand-blue-dark" onClick={openNewLead}>
              Add First Lead
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setStageFilter("all")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${
                stageFilter === "all"
                  ? "bg-primary text-white border-primary"
                  : "hover:bg-muted"
              }`}
            >
              All ({leads.length})
            </button>
            {LEAD_STAGES.map((stage) => {
              const count = leads.filter((l) => l.status === stage).length;
              if (count === 0) return null;
              return (
                <button
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${
                    stageFilter === stage
                      ? "bg-primary text-white border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {LEAD_STAGE_LABELS[stage]} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search leads..."
              className="max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="h-9 rounded-md border px-3 text-sm"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="all">All Sources</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border px-3 text-sm"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            >
              <option value="all">All Services</option>
              {serviceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No leads match your filters"
              description="Try adjusting your search or filter criteria."
            />
          ) : (
            <DataTable
              data={filtered}
              columns={columns}
              onRowClick={(lead) => (window.location.href = `/leads/${lead.id}`)}
            />
          )}
        </>
      )}

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} lead={editingLead} />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted-foreground">Loading leads...</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}
