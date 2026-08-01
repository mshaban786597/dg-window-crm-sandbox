"use client";

import {
  DollarSign,
  Percent,
  Hammer,
  Star,
  TrendingUp,
  PackageOpen,
  Layers,
  MapPin,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { formatCurrency } from "@/lib/utils";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  SERVICE_LABELS,
} from "@/lib/constants";

const CHART_HEIGHT = 260;
const BAR_COLOR = "hsl(var(--primary))";

/** Empty-state card wrapper for chart sections so we never render a blank canvas. */
function ChartCard({
  title,
  icon,
  hasData,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hasData: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          children
        ) : (
          <EmptyState title="No data available yet" className="border-0 bg-transparent py-8" />
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const getDashboardStats = useCRMStore((s) => s.getDashboardStats);
  const getLeadSourceStats = useCRMStore((s) => s.getLeadSourceStats);
  const getServiceDemand = useCRMStore((s) => s.getServiceDemand);
  const getPipelineByStage = useCRMStore((s) => s.getPipelineByStage);
  const getOrdersByManufacturer = useCRMStore((s) => s.getOrdersByManufacturer);
  const serviceAreas = useSettingsStore((s) => s.service_areas);

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  const stats = getDashboardStats();

  const reviewsTotal = stats.reviewsRequested + stats.reviewsReceived;

  // Leads by source.
  const sourceData = getLeadSourceStats()
    .map((row) => ({
      name: LEAD_SOURCE_LABELS[row.source] ?? row.source,
      count: row.count,
      won: row.won,
      value: row.value,
    }))
    .sort((a, b) => b.count - a.count);

  // Leads by service.
  const serviceData = getServiceDemand().map((d) => ({
    name: SERVICE_LABELS[d.service] ?? d.service,
    count: d.count,
  }));

  // Pipeline by stage — ordered by the canonical stage sequence.
  const pipelineByStage = getPipelineByStage();
  const pipelineData = LEAD_STAGES.map((stage) => ({
    name: LEAD_STAGE_LABELS[stage] ?? stage,
    count: pipelineByStage[stage] ?? 0,
  })).filter((d) => d.count > 0);

  // Ordered units by manufacturer.
  const manufacturerData = getOrdersByManufacturer().map((m) => ({
    name: m.manufacturer,
    units: m.units,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Revenue, pipeline, close rate, and window order performance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sold Revenue"
          value={formatCurrency(stats.soldRevenue)}
          icon={DollarSign}
        />
        <StatCard title="Close Rate" value={`${stats.closeRate.toFixed(1)}%`} icon={Percent} />
        <StatCard
          title="Avg Project Value"
          value={formatCurrency(stats.avgProjectValue)}
          icon={Hammer}
        />
        <StatCard
          title="Reviews Completed"
          value={`${stats.reviewsReceived}/${reviewsTotal}`}
          icon={Star}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(stats.pipelineValue)}
          icon={TrendingUp}
        />
        <StatCard
          title="Quoted Revenue"
          value={formatCurrency(stats.quotedRevenue)}
          icon={DollarSign}
        />
        <StatCard
          title="Collected Revenue"
          value={formatCurrency(stats.collectedRevenue)}
          icon={DollarSign}
        />
        <StatCard
          title="Active Orders"
          value={stats.activeOrders}
          icon={PackageOpen}
          subtitle={`${stats.ordersInProduction} in production`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Proposals Sent"
          value={stats.proposalsSent}
          icon={Layers}
        />
        <StatCard
          title="Proposals Accepted"
          value={stats.proposalsAccepted}
          icon={Layers}
        />
        <StatCard
          title="Units Awaiting Install"
          value={stats.unitsAwaitingInstallation}
          icon={PackageOpen}
        />
        <StatCard
          title="Installations Scheduled"
          value={stats.installationsScheduled}
          icon={Hammer}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Leads by Source"
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          hasData={sourceData.length > 0}
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={sourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Leads by Service"
          icon={<Layers className="h-4 w-4 text-primary" />}
          hasData={serviceData.length > 0}
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={serviceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Pipeline by Stage"
          icon={<Percent className="h-4 w-4 text-primary" />}
          hasData={pipelineData.length > 0}
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]}>
                {pipelineData.map((entry) => (
                  <Cell key={entry.name} fill={BAR_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Ordered Units by Manufacturer"
          icon={<PackageOpen className="h-4 w-4 text-primary" />}
          hasData={manufacturerData.length > 0}
        >
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={manufacturerData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="units" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" />
            Service Areas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {serviceAreas.length === 0 ? (
            <EmptyState
              title="No service areas configured"
              description="Add service areas in Settings to see coverage insights here."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {serviceAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                >
                  {area}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
