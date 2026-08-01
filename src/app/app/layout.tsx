import { AppShell } from "@/components/layout/app-shell";
import { CRMProvider } from "@/components/providers/crm-provider";
import { SupportBanner } from "@/components/tenancy/support-banner";
import { WorkspaceGuard } from "@/components/tenancy/workspace-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CRMProvider>
      {/* Blocks the workspace for suspended tenants / disabled memberships (§24). */}
      <WorkspaceGuard>
        {/* Visible for the whole time a platform admin is inside a tenant (§26). */}
        <SupportBanner />
        <AppShell>{children}</AppShell>
      </WorkspaceGuard>
    </CRMProvider>
  );
}
