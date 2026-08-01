"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickAddMenu } from "./quick-add-menu";
import { SandboxBadge } from "./sandbox-badge";
import { RoleSwitcher } from "./role-switcher";
import { WorkspaceSwitcher } from "@/components/tenancy/workspace-switcher";
import { getInitials } from "@/lib/utils";
import { useCRMStore } from "@/lib/store/crm-store";
import { AIAssistant } from "@/components/ai/ai-assistant";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [search, setSearch] = useState("");
  const user = useCRMStore((s) => s.currentUser);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative hidden flex-1 max-w-md md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search leads, customers, jobs..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <SandboxBadge className="ml-2" />

      <div className="ml-auto flex items-center gap-2">
        <WorkspaceSwitcher />

        <RoleSwitcher />

        <AIAssistant />

        <QuickAddMenu />

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-blue" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
              <Avatar>
                <AvatarFallback className="bg-brand-blue text-white text-xs">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline">{user.full_name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/login">Sign out</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
