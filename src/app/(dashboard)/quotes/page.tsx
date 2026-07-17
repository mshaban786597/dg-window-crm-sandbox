"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Trash2, Hammer, CheckCircle, PackageOpen, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QuoteFormDialog } from "@/components/quotes/quote-form-dialog";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SERVICE_LABELS } from "@/lib/domain";
import type { Quote } from "@/types/database";

function QuotesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotes = useCRMStore((s) => s.quotes);
  const deleteQuote = useCRMStore((s) => s.deleteQuote);
  const convertQuoteToJob = useCRMStore((s) => s.convertQuoteToJob);
  const createPurchaseOrderFromQuote = useCRMStore((s) => s.createPurchaseOrderFromQuote);
  const updateQuote = useCRMStore((s) => s.updateQuote);
  const hydrated = useCRMStore((s) => s._hasHydrated);

  const [formOpen, setFormOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setEditingQuote(null);
      setFormOpen(true);
    }
  }, [searchParams]);

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (q: Quote) => (
        <div>
          <p className="font-medium">{q.customer_name}</p>
          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{q.property_address}</p>
        </div>
      ),
    },
    { key: "service", header: "Service", render: (q: Quote) => SERVICE_LABELS[q.service_type] || q.service_type },
    { key: "units", header: "Units", render: (q: Quote) => q.line_items.filter((li) => li.category === "window_unit" || li.opening_id).reduce((s, li) => s + (li.quantity || 0), 0) || "—" },
    { key: "total", header: "Total", render: (q: Quote) => <span className="font-semibold">{formatCurrency(q.total)}</span> },
    { key: "status", header: "Status", render: (q: Quote) => <StatusBadge status={q.status} type="quote" /> },
    { key: "sent", header: "Created", render: (q: Quote) => formatDate(q.created_at) },
    {
      key: "actions",
      header: "",
      render: (q: Quote) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditingQuote(q); setFormOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {q.status !== "accepted" && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" title="Mark Accepted" onClick={() => updateQuote(q.id, { status: "accepted" })}>
              <CheckCircle className="h-3.5 w-3.5" />
            </Button>
          )}
          {q.status === "accepted" && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-brand-blue" title="Create Window Order" onClick={() => { createPurchaseOrderFromQuote(q.id); router.push("/orders"); }}>
                <PackageOpen className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" title="Convert to Job" onClick={() => convertQuoteToJob(q.id)}>
                <Hammer className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => { if (window.confirm("Delete this quote?")) deleteQuote(q.id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        description="Draft, send, and track acceptance of window proposals"
        actions={
          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => { setEditingQuote(null); setFormOpen(true); }}>
            + Create Quote
          </Button>
        }
      />

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes created"
          description="Build a window proposal from line items — totals calculate automatically."
          action={
            <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => { setEditingQuote(null); setFormOpen(true); }}>
              Create First Quote
            </Button>
          }
        />
      ) : (
        <DataTable data={quotes} columns={columns} />
      )}

      <QuoteFormDialog open={formOpen} onOpenChange={setFormOpen} quote={editingQuote} />
    </div>
  );
}

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted-foreground">Loading quotes...</div>}>
      <QuotesPageContent />
    </Suspense>
  );
}
