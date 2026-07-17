import type {
  Lead,
  Customer,
  Quote,
  Job,
  Estimate,
  Invoice,
  Review,
  Crew,
  Material,
  PurchaseOrder,
} from "@/types/database";
import type { DashboardStats } from "./types";
import { JOB_COMPLETE_STAGES } from "@/lib/domain";

interface StatsInput {
  leads: Lead[];
  customers: Customer[];
  quotes: Quote[];
  jobs: Job[];
  estimates: Estimate[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  reviews: Review[];
  crews: Crew[];
  materials: Material[];
}

const isComplete = (stage: string) =>
  (JOB_COMPLETE_STAGES as readonly string[]).includes(stage);

export function computeDashboardStats(input: StatsInput): DashboardStats {
  const {
    leads,
    customers,
    quotes,
    jobs,
    estimates,
    purchaseOrders,
    invoices,
    reviews,
    crews,
    materials,
  } = input;

  const newLeads = leads.filter((l) => l.status === "new_lead").length;
  const qualifiedLeads = leads.filter((l) => l.status === "qualified").length;
  const measurementsScheduled = estimates.filter((e) => e.status === "scheduled").length;
  const measurementsCompleted = estimates.filter((e) =>
    ["completed", "quoted", "converted_to_quote"].includes(e.status)
  ).length;
  const totalMeasurements = estimates.length;

  const quotesCreated = quotes.length;
  const proposalsSent = quotes.filter((q) =>
    ["sent", "viewed", "accepted", "declined", "expired"].includes(q.status)
  ).length;
  const proposalsAccepted = quotes.filter((q) => q.status === "accepted").length;

  const activeOrders = purchaseOrders.filter(
    (p) => !["received", "ready_for_installation", "cancelled"].includes(p.status)
  ).length;
  const ordersInProduction = purchaseOrders.filter((p) => p.status === "in_production").length;
  const unitsAwaitingInstallation = purchaseOrders
    .filter((p) => ["received", "ready_for_installation"].includes(p.status))
    .reduce((sum, p) => sum + p.items.reduce((s, i) => s + (i.received_quantity ?? i.quantity ?? 0), 0), 0);

  const installationsScheduled = jobs.filter((j) =>
    ["installation_scheduled", "crew_assigned"].includes(j.stage)
  ).length;

  const jobsWon = leads.filter((l) => l.status === "won").length;
  const jobsLost = leads.filter((l) => l.status === "lost").length;
  const activeJobs = jobs.filter((j) => !isComplete(j.stage)).length;
  const completedJobs = jobs.filter((j) => isComplete(j.stage)).length;

  const pendingInvoices = invoices.filter(
    (i) => i.status === "sent" || i.status === "draft" || i.status === "overdue"
  ).length;
  const outstandingInvoices = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + i.amount, 0);

  const collectedInvoices = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amount, 0);
  const collectedJobs = jobs
    .filter((j) => j.stage === "paid")
    .reduce((s, j) => s + j.job_value, 0);
  const collectedRevenue = collectedInvoices + collectedJobs;

  const pipelineValue = leads
    .filter((l) => !["won", "lost", "archived"].includes(l.status))
    .reduce((sum, l) => sum + (l.estimated_project_value || 0), 0);

  const quotedRevenue = quotes
    .filter((q) => ["sent", "viewed", "accepted"].includes(q.status))
    .reduce((s, q) => s + q.total, 0);

  const soldRevenue = quotes
    .filter((q) => q.status === "accepted")
    .reduce((s, q) => s + q.total, 0);

  const completed = jobs.filter((j) => isComplete(j.stage));
  const avgProjectValue =
    completed.length > 0
      ? completed.reduce((s, j) => s + j.job_value, 0) / completed.length
      : 0;
  const avgQuoteValue =
    quotes.length > 0 ? quotes.reduce((s, q) => s + q.total, 0) / quotes.length : 0;

  const closedWon = jobsWon;
  const closedTotal = leads.filter((l) => ["won", "lost"].includes(l.status)).length;
  const closeRate = closedTotal > 0 ? (closedWon / closedTotal) * 100 : 0;

  const lowStockItems = materials.filter((m) => m.quantity <= m.reorder_level).length;
  const reviewsRequested = reviews.filter((r) =>
    ["requested", "sent", "opened"].includes(r.status)
  ).length;
  const reviewsReceived = reviews.filter((r) => r.status === "received").length;

  return {
    totalLeads: leads.length,
    totalCustomers: customers.length,
    newLeads,
    qualifiedLeads,
    measurementsScheduled,
    measurementsCompleted,
    totalMeasurements,
    proposalsSent,
    proposalsAccepted,
    quotesCreated,
    activeOrders,
    ordersInProduction,
    unitsAwaitingInstallation,
    installationsScheduled,
    jobsWon,
    jobsLost,
    activeJobs,
    completedJobs,
    pendingInvoices,
    outstandingInvoices,
    pipelineValue,
    quotedRevenue,
    soldRevenue,
    collectedRevenue,
    avgProjectValue,
    avgQuoteValue,
    closeRate,
    totalCrews: crews.length,
    lowStockItems,
    reviewsRequested,
    reviewsReceived,
  };
}

export function getLeadSourceStats(leads: Lead[]) {
  const sources: Record<string, { count: number; won: number; value: number }> = {};
  leads.forEach((lead) => {
    if (!sources[lead.lead_source]) {
      sources[lead.lead_source] = { count: 0, won: 0, value: 0 };
    }
    sources[lead.lead_source].count++;
    if (lead.status === "won") sources[lead.lead_source].won++;
    sources[lead.lead_source].value += lead.estimated_project_value || 0;
  });
  return Object.entries(sources).map(([source, data]) => ({ source, ...data }));
}

export function getLeadsByCity(leads: Lead[]) {
  const cities: Record<string, number> = {};
  leads.forEach((l) => {
    if (!l.city) return;
    cities[l.city] = (cities[l.city] || 0) + 1;
  });
  return Object.entries(cities)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);
}

export function getServiceDemand(leads: Lead[]) {
  const services: Record<string, number> = {};
  leads.forEach((l) => {
    services[l.service_requested] = (services[l.service_requested] || 0) + 1;
  });
  return Object.entries(services)
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count);
}

export function getOrdersByManufacturer(orders: PurchaseOrder[]) {
  const m: Record<string, number> = {};
  orders.forEach((o) => {
    const key = o.manufacturer || "Unspecified";
    const units = o.items.reduce((s, i) => s + (i.quantity || 0), 0);
    m[key] = (m[key] || 0) + units;
  });
  return Object.entries(m)
    .map(([manufacturer, units]) => ({ manufacturer, units }))
    .sort((a, b) => b.units - a.units);
}

export function getPipelineByStage(leads: Lead[]) {
  const stages: Record<string, number> = {};
  leads.forEach((l) => {
    stages[l.status] = (stages[l.status] || 0) + 1;
  });
  return stages;
}

export function campaignROI(actual: number, cost: number) {
  if (cost <= 0) return 0;
  return ((actual - cost) / cost) * 100;
}

export function campaignCloseRate(jobsWon: number, leadsGenerated: number) {
  if (leadsGenerated <= 0) return 0;
  return (jobsWon / leadsGenerated) * 100;
}
