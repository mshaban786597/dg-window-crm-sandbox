import type { Lead, Customer, Quote, Job } from "@/types/database";

export type {
  LeadFormData,
  QuoteFormData,
  CustomerFormData,
  EstimateFormData,
  PurchaseOrderFormData,
  JobFormData,
  CalendarEventFormData,
  CrewFormData,
  InventoryFormData,
  ReviewRequestFormData,
  MarketingCampaignFormData,
} from "./form-types";

export interface DashboardStats {
  totalLeads: number;
  totalCustomers: number;
  newLeads: number;
  qualifiedLeads: number;
  measurementsScheduled: number;
  measurementsCompleted: number;
  totalMeasurements: number;
  proposalsSent: number;
  proposalsAccepted: number;
  quotesCreated: number;
  activeOrders: number;
  ordersInProduction: number;
  unitsAwaitingInstallation: number;
  installationsScheduled: number;
  jobsWon: number;
  jobsLost: number;
  activeJobs: number;
  completedJobs: number;
  pendingInvoices: number;
  outstandingInvoices: number;
  pipelineValue: number;
  quotedRevenue: number;
  soldRevenue: number;
  collectedRevenue: number;
  avgProjectValue: number;
  avgQuoteValue: number;
  closeRate: number;
  totalCrews: number;
  lowStockItems: number;
  reviewsRequested: number;
  reviewsReceived: number;
}

export type { Lead, Customer, Quote, Job };
