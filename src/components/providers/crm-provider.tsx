"use client";

import { useEffect } from "react";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { Toaster } from "@/components/ui/toaster";

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const setHasHydrated = useCRMStore((s) => s.setHasHydrated);

  useEffect(() => {
    useCRMStore.persist.rehydrate();
    useSettingsStore.persist.rehydrate();
    setHasHydrated(true);
  }, [setHasHydrated]);

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
