"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CUSTOMER_TYPES } from "@/lib/constants";
import type { Customer } from "@/types/database";

export default function CustomersPage() {
  const router = useRouter();
  const customers = useCRMStore((s) => s.customers);
  const deleteCustomer = useCRMStore((s) => s.deleteCustomer);
  const hydrated = useCRMStore((s) => s._hasHydrated);

  const [search, setSearch] = useState("");
  const [countyFilter, setCountyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const counties = useMemo(
    () => Array.from(new Set(customers.map((c) => c.county).filter(Boolean))).sort(),
    [customers]
  );

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        c.full_name.toLowerCase().includes(q) ||
        c.phone.includes(search) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        c.city.toLowerCase().includes(q) ||
        c.county.toLowerCase().includes(q);
      const matchCounty = countyFilter === "all" || c.county === countyFilter;
      const matchType = typeFilter === "all" || c.customer_type === typeFilter;
      return matchSearch && matchCounty && matchType;
    });
  }, [customers, search, countyFilter, typeFilter]);

  const columns = [
    {
      key: "name",
      header: "Customer",
      render: (c: Customer) => (
        <div>
          <p className="font-medium">{c.full_name}</p>
          <p className="text-xs text-muted-foreground">{c.phone}</p>
        </div>
      ),
    },
    { key: "city", header: "City", render: (c: Customer) => c.city },
    { key: "county", header: "County / Region", render: (c: Customer) => c.county },
    {
      key: "type",
      header: "Type",
      render: (c: Customer) => (
        <span className="capitalize text-sm">{c.customer_type || c.property_type}</span>
      ),
    },
    {
      key: "revenue",
      header: "Total Revenue",
      render: (c: Customer) => (c.total_revenue ? formatCurrency(c.total_revenue) : "—"),
    },
    {
      key: "review",
      header: "Review",
      render: (c: Customer) => <StatusBadge status={c.review_status} type="lead" className="capitalize" />,
    },
    {
      key: "since",
      header: "Customer Since",
      render: (c: Customer) => formatDate(c.created_at),
    },
    {
      key: "actions",
      header: "",
      render: (c: Customer) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setEditCustomer(c);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setDeleteId(c.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading customers...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${customers.length} ${customers.length === 1 ? "customer" : "customers"}`}
        actions={
          <Button className="bg-primary hover:bg-brand-blue-dark" onClick={() => { setEditCustomer(null); setFormOpen(true); }}>
            + Add Customer
          </Button>
        }
      />

      {customers.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title="No customers yet"
          description="Add your first customer to start tracking window projects, quotes, and jobs."
          action={
            <Button className="bg-primary hover:bg-brand-blue-dark" onClick={() => { setEditCustomer(null); setFormOpen(true); }}>
              Add First Customer
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Search name, phone, email, city..." className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
            <SelectField label="" value={countyFilter} onChange={setCountyFilter} options={[{ value: "all", label: "All Regions" }, ...counties.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "All Types" }, ...CUSTOMER_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))]} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={UserCircle}
              title="No customers found"
              description="No customers match your current search or filters."
            />
          ) : (
            <DataTable data={filtered} columns={columns} onRowClick={(c) => router.push(`/customers/${c.id}`)} />
          )}
        </>
      )}

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editCustomer} />
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Customer"
        description="This will permanently remove the customer record."
        onConfirm={() => deleteId && deleteCustomer(deleteId)}
      />
    </div>
  );
}
