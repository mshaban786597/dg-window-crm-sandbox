"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { LEAD_SOURCE_LABELS, SERVICE_LABELS } from "@/lib/constants";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { formatCurrency } from "@/lib/utils";

// Blue-forward palette for all dashboard charts.
const COLORS = [
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#1D4ED8",
  "#93C5FD",
  "#1E40AF",
  "#0EA5E9",
  "#38BDF8",
  "#818CF8",
];

const CHART_EMPTY = "No data available yet";

export function RevenueChart() {
  const quotes = useCRMStore((s) => s.quotes);

  // Derive quoted vs. sold revenue from the store — no hardcoded months.
  const quoted = quotes
    .filter((q) => ["sent", "viewed", "accepted"].includes(q.status))
    .reduce((s, q) => s + q.total, 0);
  const sold = quotes
    .filter((q) => q.status === "accepted")
    .reduce((s, q) => s + q.total, 0);

  const data = [
    { stage: "Quoted", value: quoted },
    { stage: "Sold", value: sold },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState title={CHART_EMPTY} className="border-0 bg-transparent py-10" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Revenue"]}
              />
              <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function LeadSourceChart() {
  const getLeadSourceStats = useCRMStore((s) => s.getLeadSourceStats);
  const data = getLeadSourceStats().map((d) => ({
    name: LEAD_SOURCE_LABELS[d.source] || d.source,
    value: d.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leads by Source</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState title={CHART_EMPTY} className="border-0 bg-transparent py-10" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function ServiceDemandChart() {
  const getServiceDemand = useCRMStore((s) => s.getServiceDemand);
  const data = getServiceDemand()
    .slice(0, 6)
    .map((d) => ({
      name: SERVICE_LABELS[d.service] || d.service,
      count: d.count,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Services Requested</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState title={CHART_EMPTY} className="border-0 bg-transparent py-10" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#2563EB" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Configured service areas with live lead activity per city.
 * Reads service areas from Settings — no hardcoded geography. When no
 * service areas are configured, shows a clear prompt instead of fabricating
 * geographic results.
 */
export function ServiceAreaCard() {
  const serviceAreas = useSettingsStore((s) => s.service_areas);
  const getLeadsByCity = useCRMStore((s) => s.getLeadsByCity);
  const leadCounts = getLeadsByCity();
  const countByCity = new Map(leadCounts.map((c) => [c.city, c.count]));
  const maxCount = leadCounts.reduce((m, c) => Math.max(m, c.count), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-brand-blue" />
          Service Areas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {serviceAreas.length === 0 ? (
          <EmptyState
            title="No service areas configured"
            description="Add service areas in Settings to track lead activity by area."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {serviceAreas.map((area) => {
              const count = countByCity.get(area) ?? 0;
              const intensity = maxCount > 0 ? count / maxCount : 0;
              return (
                <div
                  key={area}
                  className="rounded-lg border p-3 text-center transition-colors hover:border-brand-blue/50 hover:bg-brand-blue-light/40"
                  style={{ opacity: 0.6 + intensity * 0.4 }}
                >
                  <p className="text-lg font-bold text-brand-blue">{count}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{area}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
