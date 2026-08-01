"use client";

/**
 * System events (§15, §21).
 *
 * Platform-level error surface: failed emails, failed integrations, failed
 * background jobs, failed website intake, and security events. Failed tenant
 * notifications are surfaced alongside them so support can triage in one place.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, MailWarning } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { useCRMStore } from "@/lib/store/crm-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { maskSensitive } from "@/lib/tenancy/audit";
import type { SystemEvent } from "@/lib/tenancy/types";
import type { NotificationRecord } from "@/types/database";
import { formatDateTime } from "@/lib/utils";

const KIND_OPTIONS = [
  { value: "all", label: "All kinds" },
  { value: "email_failed", label: "Email failed" },
  { value: "integration_failed", label: "Integration failed" },
  { value: "job_failed", label: "Job failed" },
  { value: "intake_failed", label: "Intake failed" },
  { value: "security", label: "Security" },
];

export default function PlatformEventsPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const systemEvents = useTenancyStore((s) => s.systemEvents);
  const tenants = useTenancyStore((s) => s.tenants);
  const notifications = useCRMStore((s) => s.notifications);

  const [kind, setKind] = useState("all");

  // Metadata may carry integration payloads — mask before display (§4).
  const events = useMemo<SystemEvent[]>(
    () =>
      maskSensitive(systemEvents)
        .filter((e) => kind === "all" || e.kind === kind)
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [systemEvents, kind]
  );

  const failedNotifications = useMemo<NotificationRecord[]>(
    () =>
      notifications
        .filter((n) => n.status === "failed")
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [notifications]
  );

  const tenantName = (tenantId: string | null | undefined): string => {
    if (!tenantId) return "Platform";
    return tenants.find((t) => t.id === tenantId)?.name ?? tenantId;
  };

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading system events…</p>;
  }

  return (
    <div>
      <PageHeader
        title="System Events"
        description="Platform errors and failed deliveries recorded across the deployment."
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <SelectField label="Kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-foreground">Platform errors</h2>
      {events.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No system events recorded"
          description="Failed emails, integrations, jobs and security events will appear here."
        />
      ) : (
        <DataTable<SystemEvent>
          data={events}
          columns={[
            { key: "when", header: "Timestamp", render: (e) => formatDateTime(e.created_at) },
            {
              key: "kind",
              header: "Kind",
              render: (e) => <Badge variant="danger">{e.kind.replace(/_/g, " ")}</Badge>,
            },
            { key: "tenant", header: "Tenant", render: (e) => tenantName(e.tenant_id) },
            { key: "message", header: "Message", render: (e) => e.message },
          ]}
        />
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-foreground">Failed notifications</h2>
      {failedNotifications.length === 0 ? (
        <EmptyState
          icon={MailWarning}
          title="No failed notifications"
          description="Notification delivery failures will be listed here for retry."
        />
      ) : (
        <DataTable<NotificationRecord>
          data={failedNotifications}
          columns={[
            { key: "when", header: "Timestamp", render: (n) => formatDateTime(n.created_at) },
            { key: "kind", header: "Kind", render: (n) => n.kind },
            { key: "to", header: "Recipient", render: (n) => n.to_email },
            { key: "subject", header: "Subject", render: (n) => n.subject },
            { key: "error", header: "Error", render: (n) => n.error || "—" },
          ]}
        />
      )}
    </div>
  );
}
