/**
 * @deprecated Use useCRMStore from @/lib/store/crm-store instead.
 * Kept for gradual migration — re-exports store getters.
 */
export {
  useCRMStore,
  getLeadById,
  getCustomerById,
  getQuoteById,
  getJobById,
  getCommunicationsForEntity,
  PROFILES,
} from "@/lib/store/crm-store";
