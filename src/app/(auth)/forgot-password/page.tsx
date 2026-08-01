"use client";

/**
 * Request a password reset link (§10, §15).
 *
 * The confirmation is ALWAYS the same, whether or not an account exists for the
 * address. Nothing on this screen — wording, timing branches or error codes —
 * may be used to discover which addresses are registered.
 */

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Loader2, Mail, MailCheck, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/lib/domain";
import { requestPasswordResetAction } from "../actions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    const result = await requestPasswordResetAction(address);
    setSubmitting(false);

    if (!result.ok && result.code === "NOT_CONFIGURED") {
      setNotConfigured(true);
      return;
    }
    // Any other outcome is reported as success — see the file header.
    setSent(true);
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
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            Enter the email address you use for {APP.name} and we will send a reset link.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {notConfigured ? (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-900">
                  Authentication is not configured on this deployment
                </p>
                <p className="text-xs leading-relaxed text-amber-800">
                  Password resets are unavailable until the authentication provider is configured.
                  Contact your administrator.
                </p>
              </div>
            </div>
          ) : sent ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-light">
                <MailCheck className="h-8 w-8 text-brand-blue" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If an account exists for that address, we have sent a link to reset the password.
                The link expires shortly, so use it soon.
              </p>
              <p className="text-xs text-muted-foreground">
                Nothing arrived? Check your spam folder, then try again.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    className="pl-9"
                    placeholder="you@yourcompany.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    autoComplete="email"
                    required
                  />
                </div>
                {error && (
                  <p role="alert" className="text-xs text-red-600">
                    {error}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-brand-blue hover:bg-brand-blue-dark"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending link…
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          )}

          <p className="mt-6 border-t border-border pt-4 text-center text-sm">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 font-medium text-brand-blue hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
