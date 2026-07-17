import { useCRMStore } from "@/lib/store/crm-store";

/** Subscribe to CRM store with hydration guard */
export function useCRM() {
  const store = useCRMStore();
  const hydrated = useCRMStore((s) => s._hasHydrated);
  return { ...store, hydrated };
}
