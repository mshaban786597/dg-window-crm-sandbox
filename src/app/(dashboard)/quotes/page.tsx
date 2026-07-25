"use client";

/**
 * Quotes list (§14/§15). Shows only the quotes the acting user is permitted to
 * see (visibleQuotes enforces owner-scoped visibility at the data layer). Quotes
 * are always created from a lead, so there is no create-quote modal here — the
 * "Create Quote" action routes to /leads, and rows open the lead-scoped quote
 * configurator at /leads/[lead_id]/quotes/[id].
 */
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { visibleQuotes, isMarketing } from "@/lib/permissions";
import { leadDisplayName } from "@/lib/store/crm-extended";
import { formatCents } from "@/lib/money";
import type { Quote } from "@/types/database";

export default function QuotesPage() {
  const router = useRouter();
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const quotes = useCRMStore((s) => s.quotes);
  const leads = useCRMStore((s) => s.leads);
  const teamMembers = useCRMStore((s) => s.teamMembers);
  const currentTeamMemberId = useCRMStore((s) => s.currentTeamMemberId);

  const actingUser = teamMembers.find((m) => m.id === currentTeamMemberId);

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  // Marketing has no quote access.
  if (isMarketing(actingUser)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quotes" description="Inventory-based window proposals" />
        <EmptyState
          icon={FileText}
          title="No quote access"
          description="Your role does not have access to quotes."
        />
      </div>
    );
  }

  const rows = visibleQuotes(actingUser, quotes, teamMembers);

  const leadName = (leadId?: string) => {
    if (!leadId) return null;
    const lead = leads.find((l) => l.id === leadId);
    return lead ? leadDisplayName(lead) : null;
  };

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (q: Quote) => (
        <div>
          <p className="font-medium">{q.customer_name}</p>
          <p className="max-w-[200px] truncate text-xs text-muted-foreground">{q.property_address}</p>
        </div>
      ),
    },
    {
      key: "lead",
      header: "Lead",
      render: (q: Quote) =>
        q.lead_id ? (
          <Link
            href={`/leads/${q.lead_id}`}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {leadName(q.lead_id) ?? "View lead"}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "items",
      header: "Items",
      render: (q: Quote) => (q.items?.length ?? 0) || "—",
    },
    {
      key: "total",
      header: "Total",
      render: (q: Quote) => (
        <span className="font-semibold">
          {formatCents(q.total_cents ?? Math.round((q.total || 0) * 100))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (q: Quote) => <StatusBadge status={q.status} type="quote" />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        description="Inventory-based window proposals"
        actions={
          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => router.push("/leads")}>
            Create Quote
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          description="Quotes are created from a lead. Open a lead to start a new quote."
          action={
            <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => router.push("/leads")}>
              Go to Leads
            </Button>
          }
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          onRowClick={(q: Quote) => {
            if (q.lead_id) router.push(`/leads/${q.lead_id}/quotes/${q.id}`);
          }}
        />
      )}
    </div>
  );
}
