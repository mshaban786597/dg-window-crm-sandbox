"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  UserPlus,
  BadgeCheck,
  Ruler,
  ClipboardCheck,
  FileText,
  Trophy,
  PackageOpen,
  Factory,
  PackageCheck,
  CalendarClock,
  Hammer,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Percent,
  Star,
  Calendar,
  MapPin,
  Receipt,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import {
  RevenueChart,
  LeadSourceChart,
  ServiceDemandChart,
  ServiceAreaCard,
} from "@/components/dashboard/dashboard-charts";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency } from "@/lib/utils";
import { SERVICE_LABELS, JOB_COMPLETE_STAGES } from "@/lib/constants";
import { useState } from "react";

export default function DashboardPage() {
  const getDashboardStats = useCRMStore((s) => s.getDashboardStats);
  const leads = useCRMStore((s) => s.leads);
  const jobs = useCRMStore((s) => s.jobs);
  const scheduleEvents = useCRMStore((s) => s.scheduleEvents);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const [leadFormOpen, setLeadFormOpen] = useState(false);

  if (!hydrated) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Loading dashboard...
      </div>
    );
  }

  const stats = getDashboardStats();
  const upcomingEvents = scheduleEvents.slice(0, 5);
  const recentLeads = leads
    .filter((l) => l.status === "new_lead" || l.status === "contacted")
    .slice(0, 5);
  const completeStages = JOB_COMPLETE_STAGES as readonly string[];
  const activeJobs = jobs
    .filter((j) => !completeStages.includes(j.stage))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Window sales & operations overview"
        actions={
          <Button
            className="bg-brand-blue hover:bg-brand-blue-dark"
            onClick={() => setLeadFormOpen(true)}
          >
            + New Lead
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard title="Total Leads" value={stats.totalLeads} icon={Users} />
        <StatCard title="New Leads" value={stats.newLeads} icon={UserPlus} />
        <StatCard title="Qualified Leads" value={stats.qualifiedLeads} icon={BadgeCheck} />
        <StatCard title="Measurements Scheduled" value={stats.measurementsScheduled} icon={Ruler} />
        <StatCard title="Measurements Completed" value={stats.measurementsCompleted} icon={ClipboardCheck} />
        <StatCard title="Proposals Sent" value={stats.proposalsSent} icon={FileText} />
        <StatCard title="Proposals Accepted" value={stats.proposalsAccepted} icon={Trophy} />
        <StatCard title="Active Orders" value={stats.activeOrders} icon={PackageOpen} />
        <StatCard title="Orders in Production" value={stats.ordersInProduction} icon={Factory} />
        <StatCard title="Units Awaiting Installation" value={stats.unitsAwaitingInstallation} icon={PackageCheck} />
        <StatCard title="Installations Scheduled" value={stats.installationsScheduled} icon={CalendarClock} />
        <StatCard title="Active Jobs" value={stats.activeJobs} icon={Hammer} />
        <StatCard title="Completed Jobs" value={stats.completedJobs} icon={CheckCircle2} />
        <StatCard title="Pipeline Value" value={formatCurrency(stats.pipelineValue)} icon={TrendingUp} />
        <StatCard title="Quoted Revenue" value={formatCurrency(stats.quotedRevenue)} icon={TrendingUp} />
        <StatCard title="Sold Revenue" value={formatCurrency(stats.soldRevenue)} icon={DollarSign} />
        <StatCard title="Collected Revenue" value={formatCurrency(stats.collectedRevenue)} icon={DollarSign} />
        <StatCard title="Average Project Value" value={formatCurrency(stats.avgProjectValue)} icon={FileText} />
        <StatCard title="Close Rate" value={`${stats.closeRate.toFixed(0)}%`} icon={Percent} />
        <StatCard
          title="Reviews Received"
          value={stats.reviewsReceived}
          icon={Star}
          subtitle={`${stats.reviewsRequested} pending`}
        />
        <StatCard title="Outstanding Invoices" value={formatCurrency(stats.outstandingInvoices)} icon={Receipt} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <LeadSourceChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ServiceDemandChart />
        <ServiceAreaCard />
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-blue" />
              Upcoming Appointments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingEvents.length === 0 ? (
              <EmptyState
                title="No upcoming appointments"
                description="Scheduled measurements and installations will appear here."
                className="border-0 bg-transparent py-8"
              />
            ) : (
              upcomingEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-blue-light text-brand-blue text-xs font-bold">
                    {new Date(evt.start).getDate()}
                    <span className="text-[10px] font-normal">
                      {new Date(evt.start).toLocaleString("en", {
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{evt.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {evt.address || evt.customer_name || "No location"}
                    </p>
                  </div>
                </div>
              ))
            )}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/calendar">View Calendar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid gap-6 lg:grid-cols-2"
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Leads</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/leads">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentLeads.length === 0 ? (
                <EmptyState
                  title="No leads yet"
                  description="Add your first lead to start tracking your pipeline."
                  action={
                    <Button
                      size="sm"
                      className="bg-brand-blue hover:bg-brand-blue-dark"
                      onClick={() => setLeadFormOpen(true)}
                    >
                      Add First Lead
                    </Button>
                  }
                  className="border-0 bg-transparent py-8"
                />
              ) : (
                recentLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{lead.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.city} · {SERVICE_LABELS[lead.service_requested]}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} type="lead" />
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Active Jobs</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/jobs">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeJobs.length === 0 ? (
                <EmptyState
                  title="No jobs scheduled"
                  description="Active window installation jobs will appear here."
                  className="border-0 bg-transparent py-8"
                />
              ) : (
                activeJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{job.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[job.crew_name, job.city, formatCurrency(job.job_value)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <StatusBadge status={job.stage} type="job" />
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <LeadFormDialog open={leadFormOpen} onOpenChange={setLeadFormOpen} />
    </div>
  );
}
