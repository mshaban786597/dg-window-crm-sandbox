import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Bare 403 screen for `/platform-admin` (§3, §8).
 *
 * Intentionally minimal: no navigation, no shell, no tenant data and no hint
 * about what the caller would need in order to pass. It renders in place of the
 * console — never alongside it.
 */
export function PlatformAccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-white">
          Access denied — platform administrator required
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          This area is restricted to platform super administrators. No tenant data is loaded for
          this session.
        </p>
        <Link
          href="/platform-admin/login"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-brand-blue px-4 text-sm font-medium text-white transition-colors hover:bg-brand-blue-dark"
        >
          Return to platform sign-in
        </Link>
      </div>
    </div>
  );
}
