"use client";

/** Plans & feature flags (§21). */
import { PageHeader } from "@/components/shared/page-header";
import { FeatureFlagsPanel, PlansPanel } from "@/components/tenancy/plans-flags-panels";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";

export default function PlatformPlansPage() {
  const defaultPlanSlug = usePlatformSettingsStore((s) => s.settings.default_plan_slug);

  return (
    <div>
      <PageHeader
        title="Plans & Flags"
        description="Subscription tiers and platform feature flags available to tenants."
      />
      <div className="space-y-6">
        <PlansPanel defaultPlanSlug={defaultPlanSlug} />
        <FeatureFlagsPanel />
      </div>
    </div>
  );
}
