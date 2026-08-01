"use client";

/**
 * System events (§15, §21, admin panel Deliverable 7).
 *
 * Platform-level error surface: failed emails, failed integrations, failed
 * background jobs, failed website intake, and security events. Failed tenant
 * notifications are surfaced alongside them so support can triage in one place.
 *
 * Acknowledging an event sets `resolved_at`/`resolved_by` — events are never
 * deleted, so the record of what happened survives the triage.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, MailWarning } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { useCRMStore } from "@/lib/store/crm-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { maskSensitive } from "@/lib/tenancy/audit";
import { eventCountsByKind, unresolvedEvents } from "@/lib/tenancy/platform-metrics";
import { ExportCsvButton, MetadataBlock } from "../_components/admin-ui";
import { SYSTEM_EVENT_KINDS, SYSTEM_EVENT_KIND_LABELS } from "@/lib/tenancy/types";
import type { SystemEvent, SystemEventKind } from "@/lib/tenancy/types";
import type { NotificationRecord } from "@/types/database";
import { formatDateTime } from "@/lib/utils";

const KIND_OPTIONS = [
  { value: "all", label: "All kinds" },
  ...SYSTEM_EVENT_KINDS.map((k) => ({ value: k, label: SYSTEM_EVENT_KIND_LABELS[k] })),
];

const STATE_OPTIONS = [
  { value: "unresolved", label: "Unresolved only" },
  { value: "all", label: "All events" },
  { value: "resolved", label: "Resolved only" },
];

/**
 * Severity is derived from the event kind — there is no stored severity column,
 * and inventing one per event would be fabrication.
 */
const SEVERITY: Record<SystemEventKind, "critical" | "warning"> = {
  email_failed: "warning",
  integration_failed: "critical",
  job_failed: "critical",
  intake_failed: "critical",
  security: "critical",
};

export default function PlatformEventsPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const systemEvents = useTenancyStore((s) => s.systemEvents);
  const tenants = useTenancyStore((s) => s.tenants);
  const users = useTenancyStore((s) => s.users);
  const resolveSystemEvent = useTenancyStore((s) => s.resolveSystemEvent);
  const notifications = useCRMStore((s) => s.notifications);

  const [kind, setKind] = useState("all");
  const [state, setState] = useState("unresolved");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<SystemEvent | null>(null);

  // Metadata may carry integration payloads — mask before display (§4).
  const masked = useMemo<SystemEvent[]>(() => maskSensitive(systemEvents), [systemEvents]);

  const events = useMemo<SystemEvent[]>(() => {
    const fromMs = from ? new Date(from + "T00:00:00").getTime() : null;
    const toMs = to ? new Date(to + "T23:59:59.999").getTime() : null;
    return masked
      .filter((e) => {
        if (kind !== "all" && e.kind !== kind) return false;
        if (state === "unresolved" && e.resolved_at) return false;
        if (state === "resolved" && !e.resolved_at) return false;
        if (fromMs !== null || toMs !== null) {
          const when = new Date(e.created_at).getTime();
          if (Number.isNaN(when)) return false;
          if (fromMs !== null && when < fromMs) return false;
          if (toMs !== null && when > toMs) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [masked, kind, state, from, to]);

  /** Counts across ALL events, so the badges do not move when you filter. */
  const kindCounts = useMemo(() => eventCountsByKind(masked), [masked]);
  const openCount = useMemo(() => unresolvedEvents(masked).length, [masked]);

  const severityCounts = useMemo(() => {
    const out = { critical: 0, warning: 0 };
    for (const e of unresolvedEvents(masked)) out[SEVERITY[e.kind] ?? "warning"] += 1;
    return out;
  }, [masked]);

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

  const userLabel = (id: string | undefined) => {
    if (!id) return "—";
    const u = users.find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}`.trim() || u.email : id;
  };

  const filtersActive = kind !== "all" || state !== "unresolved" || Boolean(from || to);

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading system events…</p>;
  }

  return (
    <div>
      <PageHeader
        title="System Events"
        description="Platform errors and failed deliveries recorded across the deployment."
      />

      {/* Severity grouping — counts of UNRESOLVED events by kind. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={openCount > 0 ? "danger" : "success"}>{openCount} unresolved</Badge>
        {severityCounts.critical > 0 && (
          <Badge variant="danger">{severityCounts.critical} critical</Badge>
        )}
        {severityCounts.warning > 0 && (
          <Badge variant="warning">{severityCounts.warning} warning</Badge>
        )}
        {SYSTEM_EVENT_KINDS.filter((k) => (kindCounts[k] ?? 0) > 0).map((k) => (
          <Badge key={k} variant="outline">
            {SYSTEM_EVENT_KIND_LABELS[k]}: {kindCounts[k]}
          </Badge>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
          <SelectField label="State" value={state} options={STATE_OPTIONS} onChange={setState} />
          <div className="space-y-1.5">
            <Label htmlFor="events-from">From</Label>
            <Input
              id="events-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="events-to">To</Label>
            <Input id="events-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              disabled={!filtersActive}
              onClick={() => {
                setKind("all");
                setState("unresolved");
                setFrom("");
                setTo("");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Platform errors</h2>
        <ExportCsvButton
          rows={events}
          filenamePrefix="system-events"
          columns={[
            { header: "Timestamp", value: (e) => e.created_at },
            { header: "Kind", value: (e) => e.kind },
            { header: "Severity", value: (e) => SEVERITY[e.kind] ?? "warning" },
            { header: "Company", value: (e) => tenantName(e.tenant_id) },
            { header: "Message", value: (e) => e.message },
            { header: "Resolved At", value: (e) => e.resolved_at ?? "" },
            { header: "Resolved By", value: (e) => (e.resolved_by ? userLabel(e.resolved_by) : "") },
          ]}
        />
      </div>

      {systemEvents.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No system events recorded"
          description="Failed emails, integrations, jobs and security events will appear here."
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No events match your filters"
          description="Widen the kind, state or date range to see more."
        />
      ) : (
        <Card className="overflow-hidden">
          <DataTable<SystemEvent>
            data={events}
            onRowClick={(e) => setSelected((cur) => (cur?.id === e.id ? null : e))}
            columns={[
              { key: "when", header: "Timestamp", render: (e) => formatDateTime(e.created_at) },
              {
                key: "kind",
                header: "Kind",
                render: (e) => (
                  <Badge variant={SEVERITY[e.kind] === "critical" ? "danger" : "warning"}>
                    {SYSTEM_EVENT_KIND_LABELS[e.kind] ?? e.kind}
                  </Badge>
                ),
              },
              { key: "tenant", header: "Company", render: (e) => tenantName(e.tenant_id) },
              { key: "message", header: "Message", render: (e) => e.message },
              {
                key: "state",
                header: "State",
                render: (e) =>
                  e.resolved_at ? (
                    <div>
                      <Badge variant="success">Resolved</Badge>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {userLabel(e.resolved_by)} · {formatDateTime(e.resolved_at)}
                      </p>
                    </div>
                  ) : (
                    <Badge variant="danger">Open</Badge>
                  ),
              },
              {
                key: "actions",
                header: "",
                className: "w-36 text-right",
                render: (e) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      resolveSystemEvent(e.id, !e.resolved_at);
                    }}
                  >
                    {e.resolved_at ? "Reopen" : "Acknowledge"}
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      {selected && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">
              {SYSTEM_EVENT_KIND_LABELS[selected.kind] ?? selected.kind} ·{" "}
              {formatDateTime(selected.created_at)}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{selected.message}</p>
            <p className="text-xs text-muted-foreground">
              Company: {tenantName(selected.tenant_id)}
            </p>
            <MetadataBlock value={selected.metadata} />
          </CardContent>
        </Card>
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

      <p className="mt-4 text-xs text-muted-foreground">
        Severity is derived from the event kind; there is no separately stored severity value.
        Acknowledging never deletes an event — it records who cleared it and when.
      </p>
    </div>
  );
}
