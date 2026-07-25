"use client";

/**
 * Public appointment-confirmation page (§10).
 *
 * This route lives OUTSIDE the (dashboard) route group on purpose: it renders
 * no CRM shell, no navigation, and never exposes any lead / customer data. Its
 * single job is to let an assigned rep or manager confirm they RECEIVED the
 * assignment email by clicking a one-time link.
 *
 * The raw token from the URL is hashed inside `confirmAppointment` and matched
 * by hash only, so this page never reveals a usable token or any record detail.
 * The action is idempotent — clicking multiple times is safe and shows the
 * "already confirmed" state on repeat visits.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock, ShieldAlert, Loader2, PanelsTopLeft } from "lucide-react";
import { useCRMStore } from "@/lib/store/crm-store";
import { APP } from "@/lib/domain";

type ViewState =
  | { kind: "loading" }
  | { kind: "success"; already: boolean }
  | { kind: "expired" }
  | { kind: "invalid" };

export default function ConfirmAppointmentPage() {
  const params = useParams<{ token: string }>();
  const rawToken = Array.isArray(params?.token) ? params.token[0] : params?.token;
  const [view, setView] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!rawToken) {
        if (!cancelled) setView({ kind: "invalid" });
        return;
      }
      try {
        // Idempotent: safe to click multiple times. Re-confirmations resolve to
        // { ok: true, already: true }.
        const result = await useCRMStore.getState().confirmAppointment(rawToken);
        if (cancelled) return;
        if (result.ok) {
          setView({ kind: "success", already: Boolean(result.already) });
        } else if (result.reason === "expired") {
          setView({ kind: "expired" });
        } else {
          setView({ kind: "invalid" });
        }
      } catch {
        if (!cancelled) setView({ kind: "invalid" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue">
          <PanelsTopLeft className="h-7 w-7 text-white" />
        </div>

        {view.kind === "loading" && (
          <div className="space-y-3">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-blue" />
            <p className="text-sm text-muted-foreground">Confirming…</p>
          </div>
        )}

        {view.kind === "success" && (
          <StatusBlock
            icon={<CheckCircle2 className="h-10 w-10 text-brand-blue" />}
            title={view.already ? "Already confirmed" : "Confirmation received"}
            message={
              view.already
                ? "This appointment was already confirmed. No further action is needed."
                : "Thank you. We received your confirmation."
            }
          />
        )}

        {view.kind === "expired" && (
          <StatusBlock
            icon={<Clock className="h-10 w-10 text-brand-blue" />}
            title="This link has expired"
            message="This confirmation link is no longer valid. Please contact your office for an updated link."
          />
        )}

        {view.kind === "invalid" && (
          <StatusBlock
            icon={<ShieldAlert className="h-10 w-10 text-muted-foreground" />}
            title="Link invalid or expired"
            message="This confirmation link is invalid or has expired. Please contact your office if you need a new one."
          />
        )}

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          This page only confirms that you received the appointment notification. It does not
          change any appointment details.
        </p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">{APP.name}</p>
      </div>
    </main>
  );
}

function StatusBlock({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="space-y-3">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-blue-light">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
