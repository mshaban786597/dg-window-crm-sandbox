import { AppShell } from "@/components/layout/app-shell";
import { CRMProvider } from "@/components/providers/crm-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CRMProvider>
      <AppShell>{children}</AppShell>
    </CRMProvider>
  );
}
