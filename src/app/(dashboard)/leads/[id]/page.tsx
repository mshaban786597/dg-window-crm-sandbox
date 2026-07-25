"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Pencil,
  Trash2,
  Star,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { EstimateFormDialog } from "@/components/estimates/estimate-form-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatDate, formatDateTime } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import { canViewMarketingFields } from "@/lib/permissions";
import { leadDisplayName } from "@/lib/store/crm-extended";
import { serviceDisplay, LEAD_STAGE_LABELS, PROPERTY_TYPE_LABELS, URGENCY_LABELS } from "@/lib/domain";

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const hydrated = useCRMStore((s) => s._hasHydrated);
  const lead = useCRMStore((s) => s.leads.find((l) => l.id === id));
  const deleteLead = useCRMStore((s) => s.deleteLead);
  const convertLeadToCustomer = useCRMStore((s) => s.convertLeadToCustomer);
  const createQuoteForLead = useCRMStore((s) => s.createQuoteForLead);
  const quotes = useCRMStore((s) => s.quotes.filter((q) => q.lead_id === id));
  const activities = useCRMStore((s) => s.leadActivities.filter((a) => a.lead_id === id));
  const notifications = useCRMStore((s) => s.notifications.filter((n) => n.lead_id === id));
  const confirmations = useCRMStore((s) => s.appointmentConfirmations.filter((c) => c.lead_id === id));
  const teamMembers = useCRMStore((s) => s.teamMembers);
  const currentTeamMemberId = useCRMStore((s) => s.currentTeamMemberId);
  const customer = useCRMStore((s) =>
    lead?.customer_id ? s.customers.find((c) => c.id === lead.customer_id) : undefined
  );

  const [editOpen, setEditOpen] = useState(false);
  const [measurementOpen, setMeasurementOpen] = useState(false);

  const actingUser = useMemo(
    () => teamMembers.find((m) => m.id === currentTeamMemberId),
    [teamMembers, currentTeamMemberId]
  );
  const showMarketing = canViewMarketingFields(actingUser);

  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [activities]
  );

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading lead...
      </div>
    );
  }

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

  const displayName = leadDisplayName(lead);
  const locationLine = [lead.city, lead.state || lead.county].filter(Boolean).join(", ");
  const serviceLabel = serviceDisplay(lead.service_requested, lead.custom_service_name);

  const handleDelete = () => {
    if (window.confirm(`Delete lead "${displayName}"?`)) {
      deleteLead(lead.id);
      router.push("/leads");
    }
  };

  const handleCreateQuote = () => {
    const quote = createQuoteForLead(lead.id);
    if (quote) router.push(`/leads/${lead.id}/quotes/${quote.id}`);
  };

  // New lead fields (§5/§6)
  const details: { label: string; value: string }[] = [];
  details.push({ label: "Service", value: serviceLabel });
  if (lead.property_type)
    details.push({ label: "Property Type", value: PROPERTY_TYPE_LABELS[lead.property_type] ?? lead.property_type });
  if (lead.urgency) details.push({ label: "Urgency", value: URGENCY_LABELS[lead.urgency] ?? lead.urgency });
  if (lead.state) details.push({ label: "State", value: lead.state });
  if (lead.property_value_cents != null)
    details.push({ label: "Property Value", value: formatCents(lead.property_value_cents) });
  if (lead.building_value_cents != null)
    details.push({ label: "Building Value", value: formatCents(lead.building_value_cents) });
  if (lead.estimated_value_cents != null)
    details.push({ label: "Estimated Project Value", value: formatCents(lead.estimated_value_cents) });
  if (lead.appointment_at)
    details.push({ label: "Appointment", value: formatDateTime(lead.appointment_at) });

  const marketingDetails: { label: string; value: string }[] = [];
  if (lead.campaign_name) marketingDetails.push({ label: "Campaign", value: lead.campaign_name });
  if (lead.referral_partner) marketingDetails.push({ label: "Referral Partner", value: lead.referral_partner });
  if (lead.utm_source) marketingDetails.push({ label: "UTM Source", value: lead.utm_source });
  if (lead.utm_medium) marketingDetails.push({ label: "UTM Medium", value: lead.utm_medium });
  if (lead.utm_campaign) marketingDetails.push({ label: "UTM Campaign", value: lead.utm_campaign });

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayName}
        description={locationLine ? `${locationLine} — ${serviceLabel}` : serviceLabel}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/leads">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button variant="outline" onClick={() => setMeasurementOpen(true)}>
              Schedule Measurement
            </Button>
            <Button className="bg-primary hover:bg-brand-blue-dark" onClick={handleCreateQuote}>
              Create Quote
            </Button>
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
          {/* Contacts (§3) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contacts ({lead.contacts?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(lead.contacts || []).map((c) => (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">
                      {`${c.first_name} ${c.last_name}`.trim() || "Unnamed"}
                    </p>
                    {c.id === lead.primary_contact_id && (
                      <span className="rounded-full bg-brand-blue-light px-2 py-0.5 text-xs font-medium text-primary">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" /> {c.email}
                      </span>
                    )}
                  </div>
                  {c.notes && <p className="mt-1 text-sm">{c.notes}</p>}
                </div>
              ))}
              {(!lead.contacts || lead.contacts.length === 0) && (
                <p className="text-sm text-muted-foreground">No contacts on file.</p>
              )}
            </CardContent>
          </Card>

          {/* Lead details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <InfoRow
                icon={MapPin}
                label="Address"
                value={
                  lead.formatted_address ||
                  [lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", ") ||
                  "—"
                }
              />
              <InfoRow icon={Calendar} label="Created" value={formatDate(lead.created_at)} />
              {details.map((d) => (
                <div key={d.label} className="flex gap-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 opacity-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="text-sm">{d.value}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-3">
                <ShieldCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">PA Verified</p>
                  <p className="text-sm">{lead.pa_verified ? "Yes" : "No"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Stage</p>
                <StatusBadge status={lead.status} type="lead" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Source</p>
                <StatusBadge status={lead.lead_source} type="source" />
              </div>
              {lead.assigned_estimator_name && (
                <InfoRow icon={Star} label="Assigned Sales Rep" value={lead.assigned_estimator_name} />
              )}
            </CardContent>
          </Card>

          {/* Marketing attribution — role-gated (§11) */}
          {showMarketing && marketingDetails.length > 0 && (
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

          {/* Quotes */}
          {quotes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quotes ({quotes.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quotes.map((q) => (
                  <div key={q.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>
                      {formatCents(q.total_cents ?? Math.round((q.total || 0) * 100))} — {q.status}
                    </span>
                    <Link
                      href={`/leads/${lead.id}/quotes/${q.id}`}
                      className="text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {lead.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{lead.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Notification / confirmation status (§8/§10) */}
          {(notifications.length > 0 || confirmations.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assignment &amp; Confirmations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{n.subject}</p>
                      <p className="text-xs text-muted-foreground">{n.to_email}</p>
                    </div>
                    <span className="text-xs font-medium capitalize text-muted-foreground">
                      {n.status}
                    </span>
                  </div>
                ))}
                {confirmations.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span className="text-muted-foreground">
                      Confirmation ({c.recipient_role || "recipient"})
                    </span>
                    <span className="text-xs font-medium capitalize">{c.status}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Activity timeline (§28) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ol className="space-y-3">
                  {sortedActivities.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm">{a.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.actor} · {formatDateTime(a.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(LEAD_STAGE_LABELS).map(([key, label]) => (
              <div
                key={key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  lead.status === key ? "bg-brand-blue-light font-medium text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${lead.status === key ? "bg-primary" : "bg-gray-300"}`}
                />
                {label}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <EstimateFormDialog
        open={measurementOpen}
        onOpenChange={setMeasurementOpen}
        defaultValues={{
          lead_id: lead.id,
          customer_name: displayName,
          property_address: lead.address,
          city: lead.city,
          county: lead.state || lead.county,
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
