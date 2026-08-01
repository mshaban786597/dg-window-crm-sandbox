"use client";

/**
 * Platform administration sign-in UI (§15, §16).
 *
 * Deliberately NOT the tenant sign-in screen:
 *   - dark slate chrome with a single blue accent, so the two are unmistakable
 *   - no registration link, no company signup prompt, no role selector
 *   - no CRM shell, no tenant data, no workspace switcher
 *
 * Three steps, all decided by the server:
 *   credentials → (enrol TOTP | challenge TOTP) → /platform-admin
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  enrollMfaAction,
  platformMfaStatusAction,
  platformSignInAction,
  verifyMfaAction,
} from "./actions";
import type { PlatformMfaEnrolment, PlatformSignInNext } from "./types";
import { PlatformSandboxEntry } from "./sandbox-entry";

type Step = "resolving" | "credentials" | "enrol" | "challenge";

export interface PlatformLoginFormProps {
  /** True when the layout bounced us here with `?mfa=1` (password already done). */
  resumeMfa: boolean;
  /** Server-decided: no Supabase, so /platform-admin uses the sandbox gate. */
  sandboxFallback: boolean;
}

const HEADING = "Window CRM Platform Administration";

export function PlatformLoginForm({ resumeMfa, sandboxFallback }: PlatformLoginFormProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(resumeMfa ? "resolving" : "credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrolment, setEnrolment] = useState<PlatformMfaEnrolment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enterConsole = useCallback(() => {
    // `requirePlatformAdmin()` in the layout re-checks everything server-side.
    router.replace("/platform-admin");
    router.refresh();
  }, [router]);

  const beginEnrolment = useCallback(async () => {
    const result = await enrollMfaAction();
    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not start authenticator enrolment.");
      setStep("credentials");
      return;
    }
    setEnrolment(result.data);
    setCode("");
    setStep("enrol");
  }, []);

  const applyNext = useCallback(
    async (next: PlatformSignInNext) => {
      if (next === "authorized") {
        enterConsole();
        return;
      }
      if (next === "mfa_challenge") {
        setCode("");
        setStep("challenge");
        return;
      }
      await beginEnrolment();
    },
    [beginEnrolment, enterConsole]
  );

  const resolveMfaStep = useCallback(async () => {
    const status = await platformMfaStatusAction();
    if (!status.ok) {
      setStep("credentials");
      setError(status.error ?? "Sign in again to continue.");
      return;
    }
    await applyNext(
      status.verified ? "authorized" : status.enrolled ? "mfa_challenge" : "mfa_enroll"
    );
  }, [applyNext]);

  useEffect(() => {
    if (!resumeMfa) return;
    setBusy(true);
    void resolveMfaStep().finally(() => setBusy(false));
  }, [resumeMfa, resolveMfaStep]);

  const submitCredentials = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await platformSignInAction(email, password);
      // The password is not kept in memory once it has been submitted.
      setPassword("");
      if (!result.ok || !result.next) {
        setError(result.error ?? "Invalid credentials.");
        return;
      }
      await applyNext(result.next);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (step === "enrol" && !enrolment) {
      setError("This enrolment expired. Start again.");
      return;
    }
    setBusy(true);
    try {
      // Enrolment supplies the brand-new factor id; on a plain challenge the
      // server resolves the already-verified factor itself.
      const factorId = enrolment?.factorId ?? "";
      const result = await verifyMfaAction(factorId, code);
      if (!result.ok) {
        setError(result.error ?? "That code is not valid.");
        setCode("");
        return;
      }
      enterConsole();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(60rem_40rem_at_50%_-10%,rgba(37,99,235,0.18),transparent)] p-6">
      <div className="w-full max-w-md">
        {/* Identity band — intentionally unlike the tenant sign-in card. */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <span className="mb-3 inline-flex items-center gap-1 rounded-md border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">
            Restricted console
          </span>
          <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">{HEADING}</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign-in for platform operators only. This is not a company workspace.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/40">
          {error && (
            <p
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          {step === "resolving" && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
              Checking multi-factor status…
            </div>
          )}

          {step === "credentials" && (
            <form onSubmit={submitCredentials} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="platform-email" className="text-slate-200">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="platform-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="admin@yourdomain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-slate-700 bg-slate-950 pl-9 text-white placeholder:text-slate-600 focus-visible:ring-brand-blue"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform-password" className="text-slate-200">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="platform-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-slate-700 bg-slate-950 pl-9 text-white placeholder:text-slate-600 focus-visible:ring-brand-blue"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Continue
              </Button>

              <p className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs leading-relaxed text-slate-400">
                <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
                <span>
                  Multi-factor authentication is <strong className="text-slate-200">mandatory</strong>{" "}
                  for platform administrators. After your password you will be asked for a code from
                  your authenticator app.
                </span>
              </p>
            </form>
          )}

          {step === "enrol" && enrolment && (
            <form onSubmit={submitCode} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Set up your authenticator</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  No authenticator is registered for this account yet. MFA is mandatory for platform
                  administrators, so enrolment must be completed before the console will open.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Setup key (enter manually)
                </p>
                <code className="block select-all break-all rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-blue-300">
                  {enrolment.secret}
                </code>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Or scan / paste this otpauth URI
                </p>
                <code className="block max-h-24 select-all overflow-auto break-all rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
                  {enrolment.uri}
                </code>
                <p className="text-[11px] text-slate-500">
                  Shown once. It is not stored in this page and will not be shown again after
                  verification.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform-enrol-code" className="text-slate-200">
                  6-digit code
                </Label>
                <Input
                  id="platform-enrol-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="border-slate-700 bg-slate-950 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:text-slate-700 focus-visible:ring-brand-blue"
                />
              </div>

              <Button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify and enable MFA
              </Button>
            </form>
          )}

          {step === "challenge" && (
            <form onSubmit={submitCode} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Multi-factor verification</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Enter the current 6-digit code from the authenticator app registered to this
                  platform administrator account. MFA is mandatory — the console will not open
                  without it.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform-challenge-code" className="text-slate-200">
                  6-digit code
                </Label>
                <Input
                  id="platform-challenge-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="border-slate-700 bg-slate-950 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:text-slate-700 focus-visible:ring-brand-blue"
                />
              </div>

              <Button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full bg-brand-blue text-white hover:bg-brand-blue-dark"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify
              </Button>
            </form>
          )}
        </div>

        <PlatformSandboxEntry sandboxFallback={sandboxFallback} />

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-600">
          Platform administrator accounts are provisioned by the operator bootstrap process only.
          They cannot be created, requested or self-assigned from this screen.
        </p>
      </div>
    </div>
  );
}
