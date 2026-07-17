"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCRMStore } from "@/lib/store/crm-store";
import { buildReviewMessage } from "@/lib/store/crm-modules";
import { LEAD_STAGE_LABELS, SERVICE_LABELS } from "@/lib/domain";
import { formatCurrency } from "@/lib/utils";

const SUGGESTIONS = [
  "Summarize current leads",
  "Identify leads needing follow-up",
  "Measurements not converted to quotes",
  "Proposals awaiting a decision",
  "Accepted quotes without purchase orders",
  "Identify delayed window orders",
  "Energy-efficiency upgrade opportunities",
  "Impact-window opportunities",
  "Write a review request",
  "Summarize monthly performance",
];

const NO_DATA =
  "There's no data to analyze yet. Once you add leads, measurements, quotes, orders, and jobs, " +
  "I'll summarize them here from your actual CRM records.";

/**
 * The assistant computes every answer from live CRM state. It NEVER calls an
 * external AI provider (sandbox mode). When the CRM is empty it says so plainly.
 */
function generateResponse(query: string): string {
  const q = query.toLowerCase();
  const s = useCRMStore.getState();
  const { leads, estimates, quotes, purchaseOrders, jobs } = s;
  const stats = s.getDashboardStats();

  const isEmpty =
    leads.length === 0 &&
    estimates.length === 0 &&
    quotes.length === 0 &&
    purchaseOrders.length === 0 &&
    jobs.length === 0;

  if (q.includes("review")) {
    const sample = buildReviewMessage("[Customer Name]", "window_replacement");
    return `**Review Request (edit the template in Settings):**\n\n${sample}`;
  }

  if (isEmpty) return `**DG Window Growth Assistant**\n\n${NO_DATA}`;

  if (q.includes("follow-up") || q.includes("follow up") || q.includes("needing")) {
    const list = leads.filter((l) => ["follow_up_needed", "proposal_sent", "contact_attempted"].includes(l.status));
    if (!list.length) return "No leads currently need follow-up.";
    return `**Leads needing follow-up (${list.length}):**\n\n${list
      .slice(0, 8)
      .map((l) => `• ${l.full_name} — ${LEAD_STAGE_LABELS[l.status]}${l.next_follow_up_date ? ` (due ${new Date(l.next_follow_up_date).toLocaleDateString()})` : ""}`)
      .join("\n")}`;
  }

  if (q.includes("measurement")) {
    const unconverted = estimates.filter((e) => !["converted_to_quote", "quoted"].includes(e.status));
    if (!unconverted.length) return "All measurements have been converted to quotes.";
    return `**Measurements not yet converted to quotes (${unconverted.length}):**\n\n${unconverted
      .slice(0, 8)
      .map((e) => `• ${e.customer_name} — ${e.openings?.length || 0} openings`)
      .join("\n")}`;
  }

  if (q.includes("proposal") || q.includes("awaiting") || q.includes("decision")) {
    const pending = quotes.filter((qt) => ["sent", "viewed"].includes(qt.status));
    if (!pending.length) return "No proposals are currently awaiting a decision.";
    return `**Proposals awaiting a decision (${pending.length}):**\n\n${pending
      .slice(0, 8)
      .map((qt) => `• ${qt.customer_name} — ${formatCurrency(qt.total)} (${qt.status})`)
      .join("\n")}`;
  }

  if (q.includes("without purchase") || q.includes("accepted quote") || q.includes("without order")) {
    const orderedQuoteIds = new Set(purchaseOrders.map((p) => p.quote_id).filter(Boolean));
    const missing = quotes.filter((qt) => qt.status === "accepted" && !orderedQuoteIds.has(qt.id));
    if (!missing.length) return "Every accepted quote has a purchase order.";
    return `**Accepted quotes without a purchase order (${missing.length}):**\n\n${missing
      .slice(0, 8)
      .map((qt) => `• ${qt.customer_name} — ${formatCurrency(qt.total)}`)
      .join("\n")}`;
  }

  if (q.includes("delayed") || q.includes("order")) {
    const active = purchaseOrders.filter((p) => !["received", "ready_for_installation", "cancelled"].includes(p.status));
    if (!active.length) return "No open window orders to review.";
    const today = new Date();
    const delayed = active.filter((p) => p.estimated_arrival_date && new Date(p.estimated_arrival_date) < today && !p.actual_arrival_date);
    return `**Window orders (${active.length} open, ${delayed.length} past ETA):**\n\n${active
      .slice(0, 8)
      .map((p) => `• ${p.customer_name} — ${p.status}${p.estimated_arrival_date ? ` (ETA ${new Date(p.estimated_arrival_date).toLocaleDateString()})` : ""}`)
      .join("\n")}`;
  }

  if (q.includes("energy")) {
    const list = leads.filter((l) => l.energy_efficiency_interest || l.service_requested === "energy_efficient_windows");
    if (!list.length) return "No leads have flagged energy-efficiency interest yet.";
    return `**Energy-efficiency opportunities (${list.length}):**\n\n${list.slice(0, 8).map((l) => `• ${l.full_name} — ${SERVICE_LABELS[l.service_requested]}`).join("\n")}`;
  }

  if (q.includes("impact")) {
    const list = leads.filter((l) => l.impact_interest || l.service_requested === "impact_windows");
    if (!list.length) return "No leads have flagged impact-window interest yet.";
    return `**Impact-window opportunities (${list.length}):**\n\n${list.slice(0, 8).map((l) => `• ${l.full_name} — ${SERVICE_LABELS[l.service_requested]}`).join("\n")}`;
  }

  if (q.includes("performance") || q.includes("month") || q.includes("summar")) {
    return `**Performance Summary (from current records):**\n\n• Total leads: ${stats.totalLeads}\n• Qualified: ${stats.qualifiedLeads}\n• Measurements completed: ${stats.measurementsCompleted}\n• Proposals sent / accepted: ${stats.proposalsSent} / ${stats.proposalsAccepted}\n• Active window orders: ${stats.activeOrders}\n• Active jobs: ${stats.activeJobs}\n• Pipeline value: ${formatCurrency(stats.pipelineValue)}\n• Sold revenue: ${formatCurrency(stats.soldRevenue)}\n• Collected revenue: ${formatCurrency(stats.collectedRevenue)}\n• Close rate: ${stats.closeRate.toFixed(0)}%`;
  }

  // Default: summarize current leads
  const byStage = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});
  return `**Current Leads (${leads.length}):**\n\n${Object.entries(byStage)
    .map(([stage, n]) => `• ${LEAD_STAGE_LABELS[stage] || stage}: ${n}`)
    .join("\n")}\n\nAsk me about follow-ups, measurements, proposals, orders, or performance.`;
}

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm the **DG Window Growth Assistant**. I analyze your live CRM data — leads, measurements, quotes, window orders, and jobs. Ask me for summaries, follow-ups, or opportunities. (Sandbox mode: no external AI provider is used.)",
    },
  ]);

  const handleSend = (text?: string) => {
    const q = text || query;
    if (!q.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: generateResponse(q) },
    ]);
    setQuery("");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-brand-blue/30 text-brand-blue hover:bg-brand-blue-light"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Growth Assistant</span>
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, x: 320 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 320 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b px-4 py-3 bg-brand-blue text-white">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  <span className="font-semibold">DG Window Growth Assistant</span>
                </div>
                <button onClick={() => setOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        msg.role === "user" ? "bg-brand-blue text-white" : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.content.split("**").map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t p-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.slice(0, 4).map((sug) => (
                    <button key={sug} onClick={() => handleSend(sug)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
                      {sug}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask the Growth Assistant..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                  <Button size="icon" onClick={() => handleSend()} className="shrink-0 bg-brand-blue hover:bg-brand-blue-dark">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
