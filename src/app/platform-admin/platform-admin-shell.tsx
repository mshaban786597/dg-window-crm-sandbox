"use client";

/**
 * Platform Super Admin navigation shell (§3, §15–§17, §21, §26).
 *
 * PRESENTATION ONLY. This component performs no authorization of its own — the
 * server layout renders it strictly *after* `requirePlatformAdmin()` has passed
 * (or, in the non-production sandbox, after the client gate has passed).
 *
 * It is a SEPARATE application area from the tenant workspace at `/app/*`:
 *  - it never renders the client CRM navigation
 *  - the client workspace never renders this navigation
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  ScrollText,
  AlertTriangle,
  Layers,
  Settings,
  ShieldCheck,
  LogOut,
  Users,
  ToggleRight,
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { platformSignOutAction } from "./actions";

interface PlatformNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  /** Deliverable 10: live count rendered beside the label. */
  badge?: "companies";
}

const PLATFORM_NAV: PlatformNavItem[] = [
  { href: "/platform-admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/platform-admin/companies", label: "Companies", icon: Building2, badge: "companies" },
  { href: "/platform-admin/users", label: "Platform Users", icon: Users },
  { href: "/platform-admin/plans", label: "Plans & Billing", icon: Layers },
  { href: "/platform-admin/features", label: "Feature Flags", icon: ToggleRight },
  { href: "/platform-admin/audit", label: "Audit Logs", icon: ScrollText },
  { href: "/platform-admin/events", label: "System Events", icon: AlertTriangle },
  { href: "/platform-admin/support", label: "Support", icon: LifeBuoy },
  { href: "/platform-admin/settings", label: "Settings", icon: Settings },
];

function PlatformBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-brand-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
      <ShieldCheck className="h-3 w-3" />
      Platform
    </span>
  );
}

/** The subset of the admin's profile the shell displays. Nothing sensitive. */
export interface PlatformShellUser {
  first_name: string;
  last_name: string;
  email: string;
}

export interface PlatformAdminShellProps {
  user: PlatformShellUser;
  /**
   * `"server"` — Supabase-backed session, sign-out runs as a Server Action.
   * `"sandbox"` — NON-PRODUCTION local mode; `onSandboxSignOut` clears the
   * browser-side store instead. The banner makes this visible to the operator.
   */
  mode: "server" | "sandbox";
  onSandboxSignOut?: () => void;
  children: React.ReactNode;
}

export function PlatformAdminShell({
  user,
  mode,
  onSandboxSignOut,
  children,
}: PlatformAdminShellProps) {
  const pathname = usePathname();
  const productName = usePlatformSettingsStore((s) => s.settings.product_name);
  /** Live company count for the Companies badge (Deliverable 10). Zero on an
   *  empty platform — never a placeholder. */
  const companyCount = useTenancyStore((s) => s.tenants.length);

  const badgeValue = (item: PlatformNavItem) =>
    item.badge === "companies" ? companyCount : null;

  const isActive = (item: PlatformNavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const signOutControl =
    mode === "sandbox" ? (
      <button
        type="button"
        onClick={onSandboxSignOut}
        className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition-colors hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    ) : (
      <form action={platformSignOutAction}>
        <button
          type="submit"
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition-colors hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </form>
    );

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-slate-950 text-slate-200 lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-white">{productName}</p>
            <p className="text-[10px] uppercase tracking-widest text-brand-blue">Admin Console</p>
          </div>
        </div>

        <div className="border-b border-slate-800 px-5 py-3">
          <PlatformBadge />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {PLATFORM_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item)
                    ? "bg-brand-blue text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {badgeValue(item) !== null && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      isActive(item) ? "bg-white/25 text-white" : "bg-slate-800 text-slate-300"
                    )}
                  >
                    {badgeValue(item)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-xs font-medium text-white">
            {user.first_name} {user.last_name}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          {signOutControl}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {mode === "sandbox" && (
          <p className="bg-amber-500 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-950">
            Non-production sandbox — Supabase is not configured. Access is gated in the browser
            only and is not a security boundary.
          </p>
        )}

        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-white px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-blue lg:hidden">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <PlatformBadge />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Platform administration — not a tenant workspace
            </span>
          </div>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </header>

        {/* Mobile nav: the platform area still never shows tenant CRM links. */}
        <nav className="flex gap-1 overflow-x-auto border-b bg-slate-950 p-2 lg:hidden">
          {PLATFORM_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive(item) ? "bg-brand-blue text-white" : "text-slate-300 hover:bg-white/10"
              )}
            >
              {item.label}
              {badgeValue(item) !== null && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                  {badgeValue(item)}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
