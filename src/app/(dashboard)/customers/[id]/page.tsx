"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Pencil } from "lucide-react";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { ArrowLeft, Phone, Mail, MapPin, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CommunicationTimeline } from "@/components/shared/communication-timeline";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency } from "@/lib/utils";
import { SERVICE_LABELS } from "@/lib/constants";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const customer = useCRMStore((s) => s.customers.find((c) => c.id === id));
  const quotes = useCRMStore((s) => s.quotes.filter((q) => q.customer_id === id));
  const reviews = useCRMStore((s) => s.reviews.filter((r) => r.customer_id === id));
  const jobs = useCRMStore((s) => s.jobs.filter((j) => j.customer_id === id));
  const estimates = useCRMStore((s) => s.estimates.filter((e) => e.customer_id === id));
  const [editOpen, setEditOpen] = useState(false);
  const communications = useCRMStore((s) =>
    s.communications.filter((c) => c.entity_type === "customer" && c.entity_id === id)
  );

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p>Customer not found.</p>
        <Button variant="link" asChild><Link href="/customers">Back</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.full_name}
        description={`${customer.city}, ${customer.county}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/customers"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{jobs.length}</p><p className="text-xs text-muted-foreground">Jobs</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{estimates.length}</p><p className="text-xs text-muted-foreground">Measurements</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{formatCurrency(customer.total_revenue || 0)}</p><p className="text-xs text-muted-foreground">Revenue</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold capitalize">{customer.review_status}</p><p className="text-xs text-muted-foreground">Review Status</p></CardContent></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
          <TabsTrigger value="estimates">Measurements ({estimates.length})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes ({quotes.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3">
                <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm">{customer.phone}</p></div>
              </div>
              {customer.email && (
                <div className="flex gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{customer.email}</p></div>
                </div>
              )}
              <div className="flex gap-3 sm:col-span-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div><p className="text-xs text-muted-foreground">Address</p><p className="text-sm">{customer.address}, {customer.city} {customer.zip_code}</p></div>
              </div>
              {customer.happy_customer && (
                <div className="flex items-center gap-2 text-green-600">
                  <Star className="h-4 w-4 fill-current" />
                  <span className="text-sm font-medium">Happy Customer</span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <div className="space-y-3">
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-lg border p-4 hover:bg-muted/50">
                <p className="font-medium">{SERVICE_LABELS[job.service_type]}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(job.job_value)} · {job.stage.replace(/_/g, " ")}</p>
              </Link>
            ))}
            {jobs.length === 0 && <p className="text-muted-foreground text-sm">No jobs yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="estimates" className="mt-4">
          <div className="space-y-3">
            {estimates.map((est) => (
              <Link key={est.id} href={`/estimates/${est.id}`} className="block rounded-lg border p-4 hover:bg-muted/50">
                <p className="font-medium">{SERVICE_LABELS[est.service_type]}</p>
                <p className="text-sm text-muted-foreground">{est.property_address} · {est.total ? formatCurrency(est.total) : "Pending"}</p>
              </Link>
            ))}
            {estimates.length === 0 && <p className="text-muted-foreground text-sm">No measurements yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <div className="space-y-3">
            {quotes.map((q) => (
              <Link key={q.id} href="/quotes" className="block rounded-lg border p-4 hover:bg-muted/50">
                <p className="font-medium">{formatCurrency(q.total)}</p>
                <p className="text-sm text-muted-foreground capitalize">{q.status} · {SERVICE_LABELS[q.service_type]}</p>
              </Link>
            ))}
            {quotes.length === 0 && <p className="text-muted-foreground text-sm">No quotes yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-lg border p-4">
                <p className="font-medium">{r.customer_name}</p>
                <p className="text-sm text-muted-foreground capitalize">{r.status}{r.rating ? ` · ${r.rating} stars` : ""}</p>
              </div>
            ))}
            {reviews.length === 0 && <p className="text-muted-foreground text-sm">No review requests yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="pt-6"><CommunicationTimeline communications={communications} /></CardContent></Card>
        </TabsContent>
      </Tabs>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
    </div>
  );
}
