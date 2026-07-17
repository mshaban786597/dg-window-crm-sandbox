"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, Calendar, DollarSign, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CommunicationTimeline } from "@/components/shared/communication-timeline";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { QuoteFormDialog } from "@/components/quotes/quote-form-dialog";
import { EstimateFormDialog } from "@/components/estimates/estimate-form-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  SERVICE_LABELS,
  LEAD_STAGE_LABELS,
  WINDOW_STYLE_LABELS,
  FRAME_MATERIAL_LABELS,
  PROJECT_TIMEFRAME_LABELS,
  OCCUPANCY_LABELS,
  CONTACT_METHOD_LABELS,
  LEAD_QUALITY_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/lib/constants";

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const lead = useCRMStore((s) => s.leads.find((l) => l.id === id));
  const communications = useCRMStore((s) =>
    s.communications.filter((c) => c.entity_type === "lead" && c.entity_id === id)
  );
  const deleteLead = useCRMStore((s) => s.deleteLead);
  const convertLeadToCustomer = useCRMStore((s) => s.convertLeadToCustomer);
  const quotes = useCRMStore((s) => s.quotes.filter((q) => q.lead_id === id));
  const customer = useCRMStore((s) =>
    lead?.customer_id ? s.customers.find((c) => c.id === lead.customer_id) : undefined
  );

  const [editOpen, setEditOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [measurementOpen, setMeasurementOpen] = useState(false);

  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Lead not found.</p>
        <Button variant="link" asChild className="mt-4">
          <Link href="/leads">Back to leads</Link>
        </Button>
      </div>
    );
  }

  const handleDelete = () => {
    if (window.confirm(`Delete lead "${lead.full_name}"?`)) {
      deleteLead(lead.id);
      router.push("/leads");
    }
  };

  const locationLine = [lead.city, lead.county].filter(Boolean).join(", ");
  const serviceLabel = SERVICE_LABELS[lead.service_requested] ?? lead.service_requested;

  const interests = [
    lead.impact_interest ? "Impact windows" : null,
    lead.energy_efficiency_interest ? "Energy efficiency" : null,
    lead.financing_interest ? "Financing" : null,
  ].filter(Boolean) as string[];

  const projectDetails: { label: string; value: string }[] = [];
  if (lead.window_opening_count != null)
    projectDetails.push({ label: "Window Openings", value: String(lead.window_opening_count) });
  if (lead.preferred_window_style)
    projectDetails.push({
      label: "Preferred Style",
      value: WINDOW_STYLE_LABELS[lead.preferred_window_style] ?? lead.preferred_window_style,
    });
  if (lead.preferred_frame_material)
    projectDetails.push({
      label: "Frame Material",
      value:
        FRAME_MATERIAL_LABELS[lead.preferred_frame_material] ?? lead.preferred_frame_material,
    });
  if (lead.project_timeframe)
    projectDetails.push({
      label: "Timeframe",
      value: PROJECT_TIMEFRAME_LABELS[lead.project_timeframe] ?? lead.project_timeframe,
    });
  if (lead.occupancy)
    projectDetails.push({
      label: "Occupancy",
      value: OCCUPANCY_LABELS[lead.occupancy] ?? lead.occupancy,
    });
  if (lead.preferred_contact_method)
    projectDetails.push({
      label: "Preferred Contact",
      value: CONTACT_METHOD_LABELS[lead.preferred_contact_method] ?? lead.preferred_contact_method,
    });
  if (lead.lead_quality)
    projectDetails.push({
      label: "Lead Quality",
      value: LEAD_QUALITY_LABELS[lead.lead_quality] ?? lead.lead_quality,
    });
  if (lead.property_type)
    projectDetails.push({
      label: "Property Type",
      value: PROPERTY_TYPE_LABELS[lead.property_type] ?? lead.property_type,
    });
  if (lead.decision_maker)
    projectDetails.push({ label: "Decision-Maker", value: "Yes" });
  if (lead.next_follow_up_date)
    projectDetails.push({ label: "Next Follow-Up", value: formatDate(lead.next_follow_up_date) });
  if (lead.preferred_appointment_date)
    projectDetails.push({
      label: "Preferred Appointment",
      value: formatDate(lead.preferred_appointment_date),
    });

  const marketingDetails: { label: string; value: string }[] = [];
  if (lead.campaign_name) marketingDetails.push({ label: "Campaign", value: lead.campaign_name });
  if (lead.referral_partner)
    marketingDetails.push({ label: "Referral Partner", value: lead.referral_partner });
  if (lead.utm_source) marketingDetails.push({ label: "UTM Source", value: lead.utm_source });
  if (lead.utm_medium) marketingDetails.push({ label: "UTM Medium", value: lead.utm_medium });
  if (lead.utm_campaign)
    marketingDetails.push({ label: "UTM Campaign", value: lead.utm_campaign });

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead.full_name}
        description={locationLine ? `${locationLine} — ${serviceLabel}` : serviceLabel}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/leads"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button variant="outline" onClick={() => setMeasurementOpen(true)}>
              Schedule Measurement
            </Button>
            <Button variant="outline" onClick={() => setQuoteOpen(true)}>Create Quote</Button>
            {!lead.customer_id && !customer && (
              <Button variant="outline" onClick={() => convertLeadToCustomer(lead.id)}>
                Convert to Customer
              </Button>
            )}
            {customer && (
              <Button variant="outline" asChild>
                <Link href={`/customers/${customer.id}`}>View Customer</Link>
              </Button>
            )}
            <Button variant="outline" className="text-red-600" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <InfoRow icon={Phone} label="Phone" value={lead.phone} />
              {lead.email && <InfoRow icon={Mail} label="Email" value={lead.email} />}
              <InfoRow
                icon={MapPin}
                label="Address"
                value={
                  [lead.address, lead.city, lead.zip_code].filter(Boolean).join(", ") || "—"
                }
              />
              <InfoRow icon={Calendar} label="Created" value={formatDate(lead.created_at)} />
              <InfoRow
                icon={DollarSign}
                label="Est. Value"
                value={
                  lead.estimated_project_value
                    ? formatCurrency(lead.estimated_project_value)
                    : "TBD"
                }
              />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Stage</p>
                <StatusBadge status={lead.status} type="lead" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Source</p>
                <StatusBadge status={lead.lead_source} type="source" />
              </div>
              {lead.assigned_estimator_name && (
                <InfoRow
                  icon={Phone}
                  label="Assigned Sales Rep"
                  value={lead.assigned_estimator_name}
                />
              )}
            </CardContent>
          </Card>

          {(projectDetails.length > 0 || interests.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Window Project Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {projectDetails.map((d) => (
                  <div key={d.label}>
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="text-sm">{d.value}</p>
                  </div>
                ))}
                {interests.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {interests.map((i) => (
                        <span
                          key={i}
                          className="rounded-full bg-brand-blue-light px-2.5 py-0.5 text-xs font-medium text-primary"
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {marketingDetails.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Marketing Attribution</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {marketingDetails.map((d) => (
                  <div key={d.label}>
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="text-sm">{d.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {quotes.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Quotes ({quotes.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {quotes.map((q) => (
                  <div key={q.id} className="flex justify-between rounded-lg border p-3 text-sm">
                    <span>{formatCurrency(q.total)} — {q.status}</span>
                    <Link href="/quotes" className="text-primary hover:underline">View</Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {lead.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm">{lead.notes}</p></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Communication Timeline</CardTitle></CardHeader>
            <CardContent>
              <CommunicationTimeline communications={communications} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(LEAD_STAGE_LABELS).map(([key, label]) => (
              <div
                key={key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  lead.status === key
                    ? "bg-brand-blue-light font-medium text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    lead.status === key ? "bg-primary" : "bg-gray-300"
                  }`}
                />
                {label}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <QuoteFormDialog open={quoteOpen} onOpenChange={setQuoteOpen} defaultLeadId={lead.id} />
      <EstimateFormDialog
        open={measurementOpen}
        onOpenChange={setMeasurementOpen}
        defaultValues={{
          lead_id: lead.id,
          customer_name: lead.full_name,
          property_address: lead.address,
          city: lead.city,
          county: lead.county,
          service_type: lead.service_requested,
          status: "scheduled",
        }}
      />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
