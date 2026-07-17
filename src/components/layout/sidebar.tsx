"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Ruler,
  FileText,
  PackageOpen,
  Hammer,
  Calendar,
  HardHat,
  Package,
  Star,
  BarChart3,
  Megaphone,
  Settings,
  PanelsTopLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP, NAV_ITEMS } from "@/lib/domain";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  UserCircle,
  Ruler,
  FileText,
  PackageOpen,
  Hammer,
  Calendar,
  HardHat,
  Package,
  Star,
  BarChart3,
  Megaphone,
  Settings,
};

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const role = useCRMStore((s) => s.currentUser.role);
  const companyName = useSettingsStore((s) => s.company.name);

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (item.roles === "all") return true;
    return item.roles.split(",").includes(role);
  });

  return (
    <>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue">
              <PanelsTopLeft className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-white">{APP.name}</p>
              <p className="text-[10px] text-slate-400">{companyName || APP.subtitle}</p>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const Icon = ICON_MAP[item.icon] || LayoutDashboard;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-blue text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <p className="text-xs text-slate-400">{companyName || APP.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{APP.subtitle}</p>
        </div>
      </aside>
    </>
  );
}
