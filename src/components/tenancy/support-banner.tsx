"use client";

/**
 * Persistent platform-support banner (§4, §26).
 *
 * Rendered for the ENTIRE duration of a support/impersonation session so a
 * tenant workspace can never be mistaken for the admin's own. Shows the mode,
 * the reason, the hard expiry, and always offers an explicit exit.
 */
import { useRouter } from "next/navigation";
import { ShieldAlert, Eye, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supportBannerText } from "@/lib/tenancy/audit";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";
import { formatDateTime } from "@/lib/utils";

export function SupportBanner() {
  const router = useRouter();
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const endSupport = useTenancyStore((s) => s.endSupport);
  const session = useTenancySession();

  const support = session?.support;
  const text = supportBannerText(support);

  if (!hasHydrated || !support || !text) return null;

  const readOnly = support.mode === "read_only";
  const ModeIcon = readOnly ? Eye : ShieldAlert;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-4 py-2.5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ModeIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">
              {text}{" "}
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
                {readOnly ? "Read-only" : "Impersonation"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Reason: {support.reason || "—"} · Expires {formatDateTime(support.expires_at)} · All
              actions are audited against your platform account.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
          onClick={() => {
            endSupport();
            router.push("/platform-admin/companies");
          }}
        >
          <LogOut className="h-4 w-4" />
          End session
        </Button>
      </div>
    </div>
  );
}
