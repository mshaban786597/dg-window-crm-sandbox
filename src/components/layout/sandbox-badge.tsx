import { SANDBOX_MODE } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Small, non-intrusive badge shown in the header while the app runs in
 * sandbox mode. Signals that no production integrations will execute.
 */
export function SandboxBadge({ className }: { className?: string }) {
  if (!SANDBOX_MODE) return null;
  return (
    <span
      title="Sandbox mode — external integrations are disabled"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-brand-blue/30 bg-brand-blue-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-blue-dark",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
      Sandbox
    </span>
  );
}
