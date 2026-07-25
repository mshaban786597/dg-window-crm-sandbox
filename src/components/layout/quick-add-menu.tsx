"use client";

import { useState } from "react";
import {
  Plus,
  ChevronDown,
  UserPlus,
  UserCircle,
  CalendarPlus,
  PackageOpen,
  Ruler,
  Hammer,
  HardHat,
  Package,
  Star,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { EstimateFormDialog } from "@/components/estimates/estimate-form-dialog";
import { PurchaseOrderFormDialog } from "@/components/orders/purchase-order-form-dialog";
import { JobFormDialog } from "@/components/jobs/job-form-dialog";
import { CalendarEventFormDialog } from "@/components/calendar/calendar-event-form-dialog";
import { CrewFormDialog } from "@/components/crews/crew-form-dialog";
import { InventoryFormDialog } from "@/components/inventory/inventory-form-dialog";
import { ReviewRequestFormDialog } from "@/components/reviews/review-request-form-dialog";
import { MarketingCampaignFormDialog } from "@/components/marketing/marketing-campaign-form-dialog";

type DialogKey =
  | "lead"
  | "customer"
  | "estimate"
  | "order"
  | "job"
  | "calendar"
  | "crew"
  | "inventory"
  | "review"
  | "campaign"
  | null;

// Quotes are always created from a specific Lead (§13/§15), so "Create Quote"
// lives on the Leads page — not in generic Quick Add.
const ACTIONS: { key: DialogKey; label: string; icon: typeof Plus }[] = [
  { key: "lead", label: "Add Lead", icon: UserPlus },
  { key: "customer", label: "Add Customer", icon: UserCircle },
  { key: "estimate", label: "Schedule Measurement", icon: Ruler },
  { key: "order", label: "Create Window Order", icon: PackageOpen },
  { key: "job", label: "Add Job", icon: Hammer },
  { key: "calendar", label: "Add Calendar Event", icon: CalendarPlus },
  { key: "crew", label: "Add Crew", icon: HardHat },
  { key: "inventory", label: "Add Inventory Item", icon: Package },
  { key: "review", label: "Request Review", icon: Star },
  { key: "campaign", label: "Add Marketing Campaign", icon: Megaphone },
];

export function QuickAddMenu() {
  const [open, setOpen] = useState<DialogKey>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="gap-1.5 bg-brand-blue hover:bg-brand-blue-dark">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Add</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {ACTIONS.map((action) => (
            <DropdownMenuItem key={action.key} onClick={() => setOpen(action.key)}>
              <action.icon className="h-4 w-4 mr-2" />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <LeadFormDialog open={open === "lead"} onOpenChange={(v) => !v && setOpen(null)} />
      <CustomerFormDialog open={open === "customer"} onOpenChange={(v) => !v && setOpen(null)} />
      <EstimateFormDialog open={open === "estimate"} onOpenChange={(v) => !v && setOpen(null)} />
      <PurchaseOrderFormDialog open={open === "order"} onOpenChange={(v) => !v && setOpen(null)} />
      <JobFormDialog open={open === "job"} onOpenChange={(v) => !v && setOpen(null)} />
      <CalendarEventFormDialog open={open === "calendar"} onOpenChange={(v) => !v && setOpen(null)} />
      <CrewFormDialog open={open === "crew"} onOpenChange={(v) => !v && setOpen(null)} />
      <InventoryFormDialog open={open === "inventory"} onOpenChange={(v) => !v && setOpen(null)} />
      <ReviewRequestFormDialog open={open === "review"} onOpenChange={(v) => !v && setOpen(null)} />
      <MarketingCampaignFormDialog open={open === "campaign"} onOpenChange={(v) => !v && setOpen(null)} />
    </>
  );
}
