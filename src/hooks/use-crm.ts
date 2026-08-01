import { useCRMStore } from "@/lib/store/crm-store";
import type { FullCRMState } from "@/lib/store/crm-store";

/**
 * Subscribe to the tenant-scoped CRM store with a hydration guard.
 *
 * The store hook now requires an explicit selector (it applies tenant scoping
 * on every read), so the whole-state form passes an identity selector.
 */
export function useCRM(): FullCRMState & { hydrated: boolean } {
  const store = useCRMStore((s) => s);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  return { ...store, hydrated };
}
