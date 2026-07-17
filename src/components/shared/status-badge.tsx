import { Badge } from "@/components/ui/badge";
import {
  LEAD_STAGE_LABELS,
  JOB_STAGE_LABELS,
  LEAD_SOURCE_LABELS,
  SERVICE_LABELS,
  QUOTE_STATUS_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
  MEASUREMENT_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "success" | "warning" | "danger" | "outline";

const STAGE_COLORS: Record<string, Variant> = {
  // Lead stages
  new_lead: "default",
  contact_attempted: "secondary",
  contacted: "secondary",
  qualified: "warning",
  measurement_scheduled: "warning",
  measurement_completed: "warning",
  proposal_sent: "secondary",
  follow_up_needed: "warning",
  won: "success",
  lost: "danger",
  archived: "outline",

  // Job stages
  not_scheduled: "outline",
  deposit_pending: "warning",
  measurement_verified: "secondary",
  order_pending: "warning",
  ordered: "secondary",
  in_production: "warning",
  materials_received: "secondary",
  installation_scheduled: "warning",
  crew_assigned: "secondary",
  in_progress: "warning",
  quality_check: "warning",
  punch_list: "warning",
  completed: "success",
  invoice_sent: "secondary",
  paid: "success",
  review_requested: "secondary",
  closed: "success",

  // Purchase order statuses
  draft: "outline",
  submitted: "secondary",
  confirmed: "secondary",
  shipped: "secondary",
  partially_received: "warning",
  received: "success",
  damaged_short: "danger",
  ready_for_installation: "success",
  cancelled: "danger",

  // Quote / measurement statuses
  sent: "secondary",
  viewed: "warning",
  accepted: "success",
  declined: "danger",
  expired: "outline",
  scheduled: "warning",
  quoted: "success",
  no_show: "danger",
  rescheduled: "warning",
  converted_to_quote: "success",

  // Review request statuses
  not_requested: "outline",
  requested: "secondary",
  opened: "warning",
  failed: "danger",
};

interface StatusBadgeProps {
  status: string;
  type?: "lead" | "job" | "quote" | "order" | "measurement" | "service" | "source" | "review";
  className?: string;
}

export function StatusBadge({ status, type = "lead", className }: StatusBadgeProps) {
  let label = status;
  if (type === "lead") label = LEAD_STAGE_LABELS[status] || status;
  else if (type === "job") label = JOB_STAGE_LABELS[status] || status;
  else if (type === "order") label = PURCHASE_ORDER_STATUS_LABELS[status] || status;
  else if (type === "measurement") label = MEASUREMENT_STATUS_LABELS[status] || status;
  else if (type === "review") label = REVIEW_STATUS_LABELS[status] || status;
  else if (type === "service") label = SERVICE_LABELS[status] || status;
  else if (type === "source") label = LEAD_SOURCE_LABELS[status] || status;
  else if (type === "quote")
    label = QUOTE_STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1);
  else label = status.charAt(0).toUpperCase() + status.slice(1);

  const variant = STAGE_COLORS[status] || "outline";

  return (
    <Badge variant={variant} className={cn(className)}>
      {label}
    </Badge>
  );
}
