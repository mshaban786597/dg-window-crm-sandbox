"use client";

/**
 * Set a new password from a recovery link (§10, §15).
 *
 * The recovery link carries a one-time `?code=`, which is exchanged for a
 * short-lived session by a Server Action before the form is shown. The password
 * itself is validated in the browser with `checkPassword` for feedback and
 * re-validated on the server, which is authoritative.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, Lock, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MIN_PASSWORD_LENGTH, checkPassword } from "@/lib/auth/policy";
import { exchangeRecoveryCodeAction, updatePasswordAction } from "../actions";

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_BAR_COLORS = [
  "bg-red-400",
  "bg-red-400",
  "bg-amber-400",
  "bg-brand-blue",
  "bg-brand-blue",
] as const;

type Stage =
  | { kind: "verifying" }
  | { kind: "form" }
  | { kind: "invalid_link"; message: string }
  | { kind: "not_configured" }
  | { kind: "done" };

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
        </main>
      }
    >
      <ResetPasswordScreen />
    </Suspense>
  );
}

function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [stage, setStage] = useState<Stage>({ kind: "verifying" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      // Links delivered through the implicit flow put the token in the URL
      // fragment and the Supabase client establishes the session itself; in
      // that case there is no `code` to exchange and the form is shown.
      if (!code) {
        if (!cancelled) setStage({ kind: "form" });
        return;
      }
      const result = await exchangeRecoveryCodeAction(code);
      if (cancelled) return;
      if (result.ok) {
        setStage({ kind: "form" });
        return;
      }
      if (result.code === "NOT_CONFIGURED") {
        setStage({ kind: "not_configured" });
        return;
      }
      setStage({
        kind: "invalid_link",
        message: result.error ?? "This reset link is no longer valid. Request a new one.",
      });
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const check = checkPassword(password);
  const showFeedback = password.length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!check.ok) {
      setError(check.errors[0]);
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    const result = await updatePasswordAction(password);
    setSubmitting(false);
    setPassword("");
    setConfirmation("");

    if (!result.ok) {
      if (result.code === "NOT_CONFIGURED") {
        setStage({ kind: "not_configured" });
        return;
      }
      if (result.code === "UNAUTHENTICATED" || result.code === "INVALID_LINK") {
        setStage({
          kind: "invalid_link",
          message: result.error ?? "This reset link is no longer valid. Request a new one.",
        });
        return;
      }
      setError(result.error ?? "We could not update your password. Please try again.");
      return;
    }

    setStage({ kind: "done" });
    window.setTimeout(() => router.push("/login"), 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue">
            <PanelsTopLeft className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>
            Pick a password you do not use anywhere else. It replaces the old one immediately.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {stage.kind === "verifying" && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
              Checking your reset link…
            </div>
          )}

          {stage.kind === "not_configured" && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-900">
                  Authentication is not configured on this deployment
                </p>
                <p className="text-xs leading-relaxed text-amber-800">
                  Passwords cannot be changed until the authentication provider is configured.
                </p>
              </div>
            </div>
          )}

          {stage.kind === "invalid_link" && (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-light">
                <AlertTriangle className="h-8 w-8 text-brand-blue" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">This link cannot be used</h2>
              <p className="text-sm text-muted-foreground">{stage.message}</p>
              <Button asChild className="bg-brand-blue hover:bg-brand-blue-dark">
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
            </div>
          )}

          {stage.kind === "done" && (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-light">
                <CheckCircle2 className="h-8 w-8 text-brand-blue" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Your password is updated</h2>
              <p className="text-sm text-muted-foreground">
                Sign in with your new password to continue.
              </p>
              <Button asChild className="bg-brand-blue hover:bg-brand-blue-dark">
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
          )}

          {stage.kind === "form" && (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    className="pl-9"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    autoComplete="new-password"
                    aria-describedby="new-password-requirements"
                    required
                  />
                </div>
                {showFeedback ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
                        {[0, 1, 2, 3].map((index) => (
                          <span
                            key={index}
                            className={`h-full flex-1 rounded-full ${
                              index < check.score ? STRENGTH_BAR_COLORS[check.score] : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {STRENGTH_LABELS[check.score]}
                      </span>
                    </div>
                    {check.errors.length > 0 ? (
                      <ul className="space-y-0.5" id="new-password-requirements">
                        {check.errors.map((message) => (
                          <li key={message} className="text-xs text-red-600">
                            {message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p id="new-password-requirements" className="text-xs text-brand-blue">
                        This password meets the requirements.
                      </p>
                    )}
                  </div>
                ) : (
                  <p id="new-password-requirements" className="text-xs text-muted-foreground">
                    At least {MIN_PASSWORD_LENGTH} characters. A passphrase of a few words works
                    well.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    className="pl-9"
                    value={confirmation}
                    onChange={(e) => {
                      setConfirmation(e.target.value);
                      setError(null);
                    }}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-brand-blue hover:bg-brand-blue-dark"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating password…
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          )}

          <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/login" className="font-medium text-brand-blue hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
