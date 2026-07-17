/**
 * Sandbox seed data.
 *
 * This is a CLEAN sandbox: every business collection starts EMPTY. No demo
 * leads, customers, measurements, quotes, orders, jobs, invoices, reviews,
 * crews, inventory, campaigns, or calendar events are seeded.
 *
 * The only record here is a minimal generic local sandbox user, required by
 * the current app architecture to attribute actions in the UI.
 */
import type {
  Lead,
  Customer,
  Estimate,
  Quote,
  Job,
  PurchaseOrder,
  Crew,
  Material,
  Communication,
  Review,
  ScheduleEvent,
  Invoice,
  Profile,
  MarketingCampaign,
  InventoryLog,
} from "@/types/database";

export const SANDBOX_USER: Profile = {
  id: "sandbox-admin",
  email: "admin@windowcrm.local",
  full_name: "Sandbox Admin",
  role: "owner",
  created_at: "2024-01-01T00:00:00Z",
};

// Kept for backwards compatibility with existing imports.
export const DEMO_USER: Profile = SANDBOX_USER;
export const PROFILES: Profile[] = [SANDBOX_USER];

export const LEADS: Lead[] = [];
export const CUSTOMERS: Customer[] = [];
export const ESTIMATES: Estimate[] = [];
export const QUOTES: Quote[] = [];
export const PURCHASE_ORDERS: PurchaseOrder[] = [];
export const JOBS: Job[] = [];
export const CREWS: Crew[] = [];
export const MATERIALS: Material[] = [];
export const COMMUNICATIONS: Communication[] = [];
export const REVIEWS: Review[] = [];
export const SCHEDULE_EVENTS: ScheduleEvent[] = [];
export const INVOICES: Invoice[] = [];
export const MARKETING_CAMPAIGNS: MarketingCampaign[] = [];
export const INVENTORY_LOGS: InventoryLog[] = [];
