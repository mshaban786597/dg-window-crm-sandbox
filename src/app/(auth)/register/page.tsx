"use client";

/**
 * Company registration (§3, §15).
 *
 * Self-service sign-up ALWAYS creates a brand-new company workspace whose
 * creator becomes `tenant_owner`. There is deliberately NO role selector: the
 * role is hardcoded on the server and no value from this form can influence it
 * (§12).
 *
 * Two client-side safeguards worth naming:
 *   - `checkPassword` from `@/lib/auth/policy` runs live in the browser purely
 *     for feedback. The server re-runs the identical check and is authoritative.
 *   - a single idempotency key is generated once per mounted form, so a double
 *     click or a retried submit resolves to the SAME company instead of
 *     creating a second one.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, MailCheck, PanelsTopLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/lib/domain";
import { MIN_PASSWORD_LENGTH, checkPassword } from "@/lib/auth/policy";
import { registerCompanyAction } from "../actions";

const COUNTRY_OPTIONS = [
  { value: "United States", label: "United States" },
  { value: "Canada", label: "Canada" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "Australia", label: "Australia" },
  { value: "Other", label: "Other" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
  { value: "America/Chicago", label: "Central Time (America/Chicago)" },
  { value: "America/Denver", label: "Mountain Time (America/Denver)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (America/Los_Angeles)" },
  { value: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
  { value: "America/Toronto", label: "Toronto (America/Toronto)" },
  { value: "America/Vancouver", label: "Vancouver (America/Vancouver)" },
  { value: "UTC", label: "UTC" },
];

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_BAR_COLORS = [
  "bg-red-400",
  "bg-red-400",
  "bg-amber-400",
  "bg-brand-blue",
  "bg-brand-blue",
] as const;

interface RegisterFormState {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  company_name: string;
  company_phone: string;
  website: string;
  country: string;
  state: string;
  timezone: string;
}

type FormField = keyof RegisterFormState;
type FieldErrors = Partial<Record<FormField | "terms", string>>;

const EMPTY_FORM: RegisterFormState = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  company_name: "",
  company_phone: "",
  website: "",
  country: "United States",
  state: "",
  timezone: "America/New_York",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Stable per-form key. `crypto.randomUUID` with a fallback for old browsers. */
function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `reg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState<RegisterFormState>(EMPTY_FORM);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Generated once for the lifetime of this mounted form. Every submit — the
  // first and any retry — carries the same key, so the server resolves a
  // duplicate submission to the company it already created (§3).
  const idempotencyKeyRef = useRef<string | null>(null);
  const idempotencyKey = (): string => {
    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }
    return idempotencyKeyRef.current;
  };

  // Live, non-authoritative password feedback.
  const passwordCheck = checkPassword(form.password, {
    email: form.email,
    company: form.company_name,
  });
  const showPasswordFeedback = form.password.length > 0;

  const set = (field: FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!form.first_name.trim()) next.first_name = "First name is required.";
    if (!form.last_name.trim()) next.last_name = "Last name is required.";
    if (!form.email.trim()) next.email = "Work email is required.";
    else if (!EMAIL_PATTERN.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (!form.password) next.password = "Password is required.";
    else if (!passwordCheck.ok) next.password = passwordCheck.errors[0];
    if (!form.company_name.trim()) next.company_name = "Company name is required.";
    if (!form.company_phone.trim()) next.company_phone = "Company phone is required.";
    if (!form.country.trim()) next.country = "Country is required.";
    if (!form.state.trim()) next.state = "State or province is required.";
    if (!form.timezone.trim()) next.timezone = "Timezone is required.";
    if (!acceptedTerms) next.terms = "You must agree to the Terms & Privacy Policy to continue.";
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    const result = await registerCompanyAction({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      password: form.password,
      company_name: form.company_name.trim(),
      company_phone: form.company_phone.trim(),
      website: form.website.trim() || undefined,
      country: form.country,
      state: form.state.trim(),
      timezone: form.timezone,
      accepted_terms: acceptedTerms,
      idempotency_key: idempotencyKey(),
    });

    if (!result.ok) {
      setSubmitting(false);
      if (result.code === "WEAK_PASSWORD") {
        setErrors({ password: result.error ?? "Choose a stronger password." });
        return;
      }
      if (result.code === "TERMS") {
        setErrors({ terms: result.error ?? "You must accept the Terms and Privacy Policy." });
        return;
      }
      setFormError(
        result.error ?? "We could not create the workspace. Please review the form and try again."
      );
      return;
    }

    // The password is never kept in memory after a successful submit.
    setForm((prev) => ({ ...prev, password: "" }));
    setRegistered(true);
    setSubmitting(false);
    window.setTimeout(() => router.push("/onboarding"), 2500);
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
              Create your company workspace in a couple of minutes.
            </h2>
            <p className="text-slate-400 text-lg">
              Your company gets its own private workspace. Your data is never mixed with any other
              company&apos;s data.
            </p>
            <ul className="space-y-3 text-slate-300">
              {[
                "Your own isolated company workspace",
                "Invite your team and set their roles",
                "Guided setup for services and service areas",
                "Start with a 14-day trial",
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

      <div className="flex flex-1 items-start justify-center overflow-y-auto bg-background p-6">
        <Card className="my-4 w-full max-w-xl shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue lg:hidden">
              <PanelsTopLeft className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Create your company workspace</CardTitle>
            <CardDescription>
              You become the owner of this workspace and can invite your team next.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {registered ? (
              <div className="space-y-4 py-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-blue-light">
                  <MailCheck className="h-8 w-8 text-brand-blue" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  Check your email to verify your address
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your workspace is created. We sent a verification link to your work email —
                  you must verify the address before you can sign in and use the workspace.
                </p>
                <p className="text-xs text-muted-foreground">Taking you to the setup guide…</p>
                <Button asChild className="bg-brand-blue hover:bg-brand-blue-dark">
                  <Link href="/onboarding">Continue to setup</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-5 flex gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3">
                  <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                  <p className="text-xs leading-relaxed text-foreground">
                    <span className="font-semibold">Email verification is required.</span> After you
                    register we send a verification link to your work email. Your workspace stays
                    locked until that address is verified.
                  </p>
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <p className="text-xs text-red-700">{formError}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Your details</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="first_name" label="First Name" error={errors.first_name}>
                        <Input
                          id="first_name"
                          value={form.first_name}
                          onChange={(e) => set("first_name", e.target.value)}
                          autoComplete="given-name"
                        />
                      </Field>
                      <Field id="last_name" label="Last Name" error={errors.last_name}>
                        <Input
                          id="last_name"
                          value={form.last_name}
                          onChange={(e) => set("last_name", e.target.value)}
                          autoComplete="family-name"
                        />
                      </Field>
                    </div>
                    <Field id="email" label="Work Email" error={errors.email}>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@yourcompany.com"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        autoComplete="email"
                      />
                    </Field>

                    <div className="space-y-1.5">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={form.password}
                        onChange={(e) => set("password", e.target.value)}
                        autoComplete="new-password"
                        aria-describedby="password-requirements"
                      />
                      {showPasswordFeedback ? (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
                              {[0, 1, 2, 3].map((index) => (
                                <span
                                  key={index}
                                  className={`h-full flex-1 rounded-full ${
                                    index < passwordCheck.score
                                      ? STRENGTH_BAR_COLORS[passwordCheck.score]
                                      : "bg-muted"
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">
                              {STRENGTH_LABELS[passwordCheck.score]}
                            </span>
                          </div>
                          {passwordCheck.errors.length > 0 ? (
                            <ul className="space-y-0.5" id="password-requirements">
                              {passwordCheck.errors.map((message) => (
                                <li key={message} className="text-xs text-red-600">
                                  {message}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p id="password-requirements" className="text-xs text-brand-blue">
                              This password meets the requirements.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p id="password-requirements" className="text-xs text-muted-foreground">
                          At least {MIN_PASSWORD_LENGTH} characters. A passphrase of a few words
                          works well.
                        </p>
                      )}
                      {errors.password && !showPasswordFeedback && (
                        <p className="text-xs text-red-600">{errors.password}</p>
                      )}
                    </div>
                  </section>

                  <section className="space-y-4 border-t border-border pt-5">
                    <h3 className="text-sm font-semibold text-foreground">Company</h3>
                    <Field id="company_name" label="Company Name" error={errors.company_name}>
                      <Input
                        id="company_name"
                        value={form.company_name}
                        onChange={(e) => set("company_name", e.target.value)}
                        autoComplete="organization"
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="company_phone" label="Company Phone" error={errors.company_phone}>
                        <Input
                          id="company_phone"
                          type="tel"
                          value={form.company_phone}
                          onChange={(e) => set("company_phone", e.target.value)}
                          autoComplete="tel"
                        />
                      </Field>
                      <Field id="website" label="Website (optional)" error={errors.website}>
                        <Input
                          id="website"
                          placeholder="https://"
                          value={form.website}
                          onChange={(e) => set("website", e.target.value)}
                          autoComplete="url"
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SelectField
                        label="Country"
                        options={COUNTRY_OPTIONS}
                        value={form.country}
                        onChange={(value) => set("country", value)}
                        error={errors.country}
                      />
                      <Field id="state" label="State / Province" error={errors.state}>
                        <Input
                          id="state"
                          value={form.state}
                          onChange={(e) => set("state", e.target.value)}
                          autoComplete="address-level1"
                        />
                      </Field>
                    </div>
                    <SelectField
                      label="Timezone"
                      options={TIMEZONE_OPTIONS}
                      value={form.timezone}
                      onChange={(value) => set("timezone", value)}
                      error={errors.timezone}
                    />
                  </section>

                  <section className="space-y-3 border-t border-border pt-5">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-brand-blue"
                        checked={acceptedTerms}
                        onChange={(e) => {
                          setAcceptedTerms(e.target.checked);
                          setErrors((prev) => ({ ...prev, terms: undefined }));
                        }}
                      />
                      <span className="text-sm text-foreground">
                        I agree to the <span className="font-medium text-brand-blue">Terms</span>{" "}
                        &amp; <span className="font-medium text-brand-blue">Privacy Policy</span>.
                      </span>
                    </label>
                    {errors.terms && <p className="text-xs text-red-600">{errors.terms}</p>}

                    {/* Transparency about platform-operator access. */}
                    <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      Privacy note: platform operators may access your workspace data when it is
                      needed for support, security or abuse investigations. Any such access is
                      time-boxed and written to an audit log you can review.
                    </p>
                  </section>

                  <Button
                    type="submit"
                    className="w-full bg-brand-blue hover:bg-brand-blue-dark"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating workspace…
                      </>
                    ) : (
                      "Create company workspace"
                    )}
                  </Button>
                </form>
              </>
            )}

            <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-brand-blue hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
