import Link from "next/link";
import { Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Account suspended" };

/**
 * Neutral account-suspended page (§16).
 *
 * Deliberately says nothing about why the workspace was suspended, who
 * suspended it, or what data exists — a suspended tenant's users may still
 * authenticate, so this page must not become an information channel. Tenant
 * data is preserved and untouched; access is simply blocked.
 */
export default function SuspendedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Pause className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">This account is suspended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access to this workspace is currently unavailable. Your data has been preserved. Please
          contact your administrator to restore access.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
