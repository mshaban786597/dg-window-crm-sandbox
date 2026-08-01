"use client";

/**
 * Client sign-in (§4, §15).
 *
 * Real authentication: the credentials are posted to a Server Action and every
 * decision — whether the password is correct, whether the address is verified,
 * which workspaces the account may enter — is made on the server. This screen
 * only renders the outcome.
 *
 * Deliberately absent (§15): demo credentials, an account picker and any role
 * selector. A role is never chosen at sign-in; it comes from the membership.
 *
 * Routing:
 *   workspace        -> /app/dashboard
 *   choose_workspace -> in-page workspace selector
 *   platform_admin   -> /platform-admin
 *   no_membership    -> access-disabled notice
 *   unverified       -> verify-your-email notice
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  PanelsTopLeft,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/lib/domain";
import { TENANT_ROLE_LABELS, type TenantRole } from "@/lib/tenancy/types";
import { signInAction, switchWorkspaceAction } from "../actions";

interface WorkspaceChoice {
  id: string;
  name: string;
  role: TenantRole;
}

type View =
  | { kind: "form" }
  | { kind: "choose_workspace"; workspaces: WorkspaceChoice[] }
  | { kind: "no_membership" }
  | { kind: "unverified"; email: string };

/** A non-credential problem worth explaining rather than genericising. */
type Notice = { tone: "warning" | "info"; title: string; message: string } | null;

/** Only same-origin, path-relative redirects are honoured. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app/dashboard";
  return next;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
        </main>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const justVerified = searchParams.get("verified") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<View>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    resetMessages();

    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }

    setSubmitting(true);
    const result = await signInAction(email.trim(), password);
    setSubmitting(false);

    if (!result.ok || !result.data) {
      if (result.code === "NOT_CONFIGURED") {
        setNotice({
          tone: "warning",
          title: "Authentication is not configured on this deployment",
          message:
            "Sign-in is unavailable until the authentication provider is configured. Contact your administrator.",
        });
        return;
      }
      if (result.code === "RATE_LIMITED") {
        setNotice({
          tone: "warning",
          title: "Too many sign-in attempts",
          message:
            result.error ?? "Too many attempts from this device. Wait a few minutes and try again.",
        });
        return;
      }
      // Everything else is reported identically so the form cannot be used to
      // discover which addresses have accounts.
      setError("Incorrect email or password.");
      return;
    }

    const outcome = result.data;
    switch (outcome.kind) {
      case "workspace":
        router.push(next);
        return;
      case "platform_admin":
        router.push("/platform-admin");
        return;
      case "choose_workspace":
        setPassword("");
        setView({ kind: "choose_workspace", workspaces: outcome.workspaces });
        return;
      case "no_membership":
        setPassword("");
        setView({ kind: "no_membership" });
        return;
      case "unverified":
        setPassword("");
        setView({ kind: "unverified", email: email.trim() });
        return;
    }
  };

  const chooseWorkspace = async (tenantId: string) => {
    resetMessages();
    setSwitchingTo(tenantId);
    const result = await switchWorkspaceAction(tenantId);
    if (!result.ok) {
      setSwitchingTo(null);
      setError(result.error ?? "That workspace could not be opened.");
      return;
    }
    router.push(next);
  };

  const backToForm = () => {
    resetMessages();
    setView({ kind: "form" });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen">
      <aside className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-sidebar p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue">
              <PanelsTopLeft className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{APP.name}</h1>
              <p className="text-slate-400 text-sm">{APP.subtitle}</p>
            </div>
          </div>
          <div className="mt-16 space-y-6">
            <h2 className="text-3xl font-bold leading-tight">
              Manage window leads, measurements, orders &amp; installs — all in one place.
            </h2>
            <p className="text-slate-400 text-lg">
              A window sales and operations CRM for replacement, installation, impact,
              energy-efficient, and commercial window projects.
            </p>
            <ul className="space-y-3 text-slate-300">
              {[
                "Lead pipeline & proposal management",
                "Measurements, window orders & install tracking",
                "Crew scheduling & job management",
                "DG Window Growth Assistant",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {APP.name} — {APP.subtitle}
        </p>
      </aside>

      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-background p-6">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue lg:hidden">
              <PanelsTopLeft className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Sign in to your company workspace</CardTitle>
            <CardDescription>
              Use the email address your company workspace was created with.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {justVerified && view.kind === "form" && (
              <div className="mb-5 flex gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                <p className="text-xs leading-relaxed text-foreground">
                  Your email address is verified. Sign in to continue.
                </p>
              </div>
            )}

            {notice && (
              <div
                className={
                  notice.tone === "warning"
                    ? "mb-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
                    : "mb-5 flex gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3"
                }
              >
                <AlertTriangle
                  className={
                    notice.tone === "warning"
                      ? "mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                      : "mt-0.5 h-4 w-4 shrink-0 text-brand-blue"
                  }
                />
                <div className="space-y-1">
                  <p
                    className={
                      notice.tone === "warning"
                        ? "text-xs font-semibold text-amber-900"
                        : "text-xs font-semibold text-foreground"
                    }
                  >
                    {notice.title}
                  </p>
                  <p
                    className={
                      notice.tone === "warning"
                        ? "text-xs leading-relaxed text-amber-800"
                        : "text-xs leading-relaxed text-muted-foreground"
                    }
                  >
                    {notice.message}
                  </p>
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {error}
              </p>
            )}

            {view.kind === "form" && (
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      className="pl-9"
                      placeholder="you@yourcompany.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-brand-blue hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-brand-blue hover:bg-brand-blue-dark"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            )}

            {view.kind === "choose_workspace" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">Choose a workspace</h2>
                  <p className="text-xs text-muted-foreground">
                    Your account belongs to more than one company. Pick the workspace to open.
                  </p>
                </div>
                <ul className="space-y-2">
                  {view.workspaces.map((workspace) => (
                    <li key={workspace.id}>
                      <button
                        type="button"
                        onClick={() => chooseWorkspace(workspace.id)}
                        disabled={switchingTo !== null}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-blue hover:bg-brand-blue-light/40 disabled:opacity-60"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue-light">
                            <Building2 className="h-4 w-4 text-brand-blue" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {workspace.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {TENANT_ROLE_LABELS[workspace.role]}
                            </span>
                          </span>
                        </span>
                        {switchingTo === workspace.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-blue" />
                        ) : (
                          <ArrowRight className="h-4 w-4 shrink-0 text-brand-blue" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" className="w-full" onClick={backToForm}>
                  Use a different account
                </Button>
              </div>
            )}

            {view.kind === "no_membership" && (
              <StatusPanel
                icon={<ShieldAlert className="h-8 w-8 text-brand-blue" />}
                title="Your account is not linked to a workspace"
                message="Access is disabled until a company workspace is linked to this account. Ask an administrator at your company to send you an invitation, or register a new company workspace."
                action={
                  <div className="flex flex-col gap-2">
                    <Button asChild className="bg-brand-blue hover:bg-brand-blue-dark">
                      <Link href="/register">Register a new company</Link>
                    </Button>
                    <Button type="button" variant="outline" onClick={backToForm}>
                      Back to sign in
                    </Button>
                  </div>
                }
              />
            )}

            {view.kind === "unverified" && (
              <StatusPanel
                icon={<MailCheck className="h-8 w-8 text-brand-blue" />}
                title="Verify your email to continue"
                message={`We sent a verification link to ${view.email}. Open it to activate your account, then sign in again.`}
                hint="No email yet? Check your spam folder. A new link is sent each time you sign in, so you can try again in a few minutes."
                action={
                  <Button type="button" variant="outline" onClick={backToForm}>
                    Back to sign in
                  </Button>
                }
              />
            )}

            <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
              New to {APP.name}?{" "}
              <Link href="/register" className="font-medium text-brand-blue hover:underline">
                Register a new company
              </Link>
            </p>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Invited by a colleague? Open the link from your invitation email.
            </p>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function StatusPanel({
  icon,
  title,
  message,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-light">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
