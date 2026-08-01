"use client";

/**
 * Invitation acceptance (§5, §15).
 *
 * SECURITY
 * --------
 * This page is reachable WITHOUT a session, so the only tenant details it may
 * render are the three the recipient needs in order to decide: the inviting
 * COMPANY, the ROLE they are being given, and WHO invited them. Nothing else
 * about the tenant — members, counts, ids, settings — is fetched or shown.
 *
 * The raw token is never inspected in the browser: it is handed to a Server
 * Action which hashes it and matches by hash only. Invalid, expired, revoked
 * and already-used are surfaced as distinct states, and the role always comes
 * from the stored invitation — there is no role selector anywhere in this flow.
 *
 * The invited address is FIXED. It is displayed read-only and is re-read from
 * the invitation on the server, so editing the DOM cannot redirect the
 * invitation to another account.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  MailCheck,
  PanelsTopLeft,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP } from "@/lib/domain";
import { MIN_PASSWORD_LENGTH, checkPassword } from "@/lib/auth/policy";
import { TENANT_ROLE_LABELS } from "@/lib/tenancy/types";
import type { InvitationPreview } from "@/lib/auth/auth-actions";
import {
  acceptInvitationAction,
  getViewerAction,
  previewInvitationAction,
  signOutAction,
  signUpForInvitationAction,
} from "@/app/(auth)/actions";

interface Viewer {
  signedIn: boolean;
  email: string | null;
}

type Stage =
  | { kind: "loading" }
  | { kind: "unavailable"; icon: "expired" | "used" | "invalid"; title: string; message: string }
  | { kind: "ready"; preview: InvitationPreview; viewer: Viewer }
  | { kind: "verify_email"; email: string; company: string }
  | { kind: "accepted"; company: string };

const STRENGTH_LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_BAR_COLORS = [
  "bg-red-400",
  "bg-red-400",
  "bg-amber-400",
  "bg-brand-blue",
  "bg-brand-blue",
] as const;

/** Turn a server code into a distinct, non-enumerable explanation. */
function unavailableFor(code: string | undefined, fallback: string | undefined): Stage {
  switch (code) {
    case "EXPIRED":
      return {
        kind: "unavailable",
        icon: "expired",
        title: "This invitation has expired",
        message: "Ask the person who invited you to send a new invitation.",
      };
    case "ALREADY_USED":
      return {
        kind: "unavailable",
        icon: "used",
        title: "This invitation has already been used",
        message: "Sign in with the invited account, or ask for a new invitation.",
      };
    case "REVOKED":
      return {
        kind: "unavailable",
        icon: "used",
        title: "This invitation is no longer valid",
        message: "It was withdrawn by the company. Ask them to send a new invitation.",
      };
    case "NOT_CONFIGURED":
      return {
        kind: "unavailable",
        icon: "invalid",
        title: "Authentication is not configured on this deployment",
        message: "Invitations cannot be accepted until the authentication provider is configured.",
      };
    case "RATE_LIMITED":
      return {
        kind: "unavailable",
        icon: "invalid",
        title: "Too many attempts",
        message: fallback ?? "Wait a few minutes before opening this link again.",
      };
    default:
      return {
        kind: "unavailable",
        icon: "invalid",
        title: "This invitation link is not valid",
        message: "The link cannot be used. Ask the person who invited you to send a new one.",
      };
  }
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const rawParam: unknown = params?.token;
  const token: string =
    typeof rawParam === "string"
      ? rawParam
      : Array.isArray(rawParam) && typeof rawParam[0] === "string"
        ? rawParam[0]
        : "";

  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) {
      setStage(unavailableFor("INVALID", undefined));
      return;
    }
    const [preview, viewer] = await Promise.all([
      previewInvitationAction(token),
      getViewerAction(),
    ]);

    if (!preview.ok || !preview.data) {
      setStage(unavailableFor(preview.code, preview.error));
      return;
    }
    setStage({
      kind: "ready",
      preview: preview.data,
      viewer: viewer.ok && viewer.data ? viewer.data : { signedIn: false, email: null },
    });
  }, [token]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load]);

  const passwordCheck = checkPassword(password, {
    email: stage.kind === "ready" ? stage.preview.email : undefined,
    company: stage.kind === "ready" ? stage.preview.company : undefined,
  });

  const accept = async () => {
    if (!token || stage.kind !== "ready" || busy) return;
    setBusy(true);
    setError(null);
    const result = await acceptInvitationAction(token);
    setBusy(false);

    if (result.ok && result.data) {
      setStage({ kind: "accepted", company: stage.preview.company });
      router.push("/app/dashboard");
      return;
    }
    if (result.code === "EMAIL_MISMATCH") {
      setError(
        "This invitation was sent to a different email address. Sign in with the invited account, or ask for an invitation for the address you use."
      );
      return;
    }
    if (result.code === "UNAUTHENTICATED") {
      setError("Your session has ended. Sign in again to accept this invitation.");
      setStage({ ...stage, viewer: { signedIn: false, email: null } });
      return;
    }
    if (["EXPIRED", "ALREADY_USED", "REVOKED", "NOT_CONFIGURED", "RATE_LIMITED"].includes(
      result.code ?? ""
    )) {
      setStage(unavailableFor(result.code, result.error));
      return;
    }
    setError(result.error ?? "This invitation could not be accepted.");
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || stage.kind !== "ready" || busy) return;
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!passwordCheck.ok) {
      setError(passwordCheck.errors[0]);
      return;
    }

    setBusy(true);
    const result = await signUpForInvitationAction(token, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      password,
    });
    setBusy(false);
    setPassword("");

    if (!result.ok || !result.data) {
      if (["EXPIRED", "ALREADY_USED", "REVOKED", "NOT_CONFIGURED"].includes(result.code ?? "")) {
        setStage(unavailableFor(result.code, result.error));
        return;
      }
      setError(result.error ?? "We could not create that account. Please try again.");
      return;
    }

    if (result.data.verificationRequired) {
      setStage({
        kind: "verify_email",
        email: stage.preview.email,
        company: stage.preview.company,
      });
      return;
    }
    setStage({ kind: "accepted", company: stage.preview.company });
    router.push("/app/dashboard");
  };

  const switchAccount = async () => {
    setBusy(true);
    setError(null);
    await signOutAction();
    setBusy(false);
    if (stage.kind === "ready") {
      setStage({ ...stage, viewer: { signedIn: false, email: null } });
    }
  };

  const signInHref = `/login?next=${encodeURIComponent(`/accept-invite/${token}`)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue">
          <PanelsTopLeft className="h-7 w-7 text-white" />
        </div>

        {stage.kind === "loading" && (
          <div className="space-y-3 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-blue" />
            <p className="text-sm text-muted-foreground">Checking your invitation…</p>
          </div>
        )}

        {stage.kind === "unavailable" && (
          <StatusBlock
            icon={
              stage.icon === "expired" ? (
                <Clock className="h-9 w-9 text-brand-blue" />
              ) : stage.icon === "used" ? (
                <ShieldAlert className="h-9 w-9 text-brand-blue" />
              ) : (
                <AlertTriangle className="h-9 w-9 text-muted-foreground" />
              )
            }
            title={stage.title}
            message={stage.message}
            action={
              <Button asChild variant="outline" className="mt-2">
                <Link href="/login">Go to sign in</Link>
              </Button>
            }
          />
        )}

        {stage.kind === "accepted" && (
          <StatusBlock
            icon={<CheckCircle2 className="h-9 w-9 text-brand-blue" />}
            title="You're in"
            message={`You have joined ${stage.company}. Taking you to your workspace…`}
          />
        )}

        {stage.kind === "verify_email" && (
          <StatusBlock
            icon={<MailCheck className="h-9 w-9 text-brand-blue" />}
            title="Check your email to verify your address"
            message={`Your account for ${stage.email} is created. Verify the address, then open this invitation link again to join ${stage.company}.`}
          />
        )}

        {stage.kind === "ready" && (
          <>
            <div className="mb-6 space-y-4 text-center">
              <div>
                <h1 className="text-xl font-semibold text-foreground">You have been invited</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review the details below before joining.
                </p>
              </div>

              {/* The ONLY tenant details this page may reveal (§15). */}
              <dl className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-left">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue-light">
                    <Building2 className="h-4 w-4 text-brand-blue" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Company
                    </dt>
                    <dd className="truncate text-sm font-medium text-foreground">
                      {stage.preview.company}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue-light">
                    <UserPlus className="h-4 w-4 text-brand-blue" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
                    <dd className="truncate text-sm font-medium text-foreground">
                      {TENANT_ROLE_LABELS[stage.preview.role]}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-blue-light">
                    <MailCheck className="h-4 w-4 text-brand-blue" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      Invited by
                    </dt>
                    <dd className="truncate text-sm font-medium text-foreground">
                      {stage.preview.invitedBy}
                    </dd>
                  </div>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Your role is set by the company that invited you and cannot be changed here.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
              >
                {error}
              </p>
            )}

            {stage.viewer.signedIn ? (
              <SignedInPanel
                viewerEmail={stage.viewer.email}
                invitedEmail={stage.preview.email}
                busy={busy}
                onAccept={accept}
                onSwitchAccount={switchAccount}
                signInHref={signInHref}
              />
            ) : (
              <div className="space-y-5">
                <Button asChild variant="outline" className="w-full">
                  <Link href={signInHref}>Sign in to accept</Link>
                </Button>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or create an account
                  <span className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={createAccount} noValidate className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-first-name">First Name</Label>
                      <Input
                        id="invite-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        autoComplete="given-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-last-name">Last Name</Label>
                      <Input
                        id="invite-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={stage.preview.email}
                      readOnly
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      The invitation is bound to this address and cannot be changed.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="invite-password">Password</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      autoComplete="new-password"
                      aria-describedby="invite-password-requirements"
                    />
                    {password.length > 0 ? (
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
                          <ul className="space-y-0.5" id="invite-password-requirements">
                            {passwordCheck.errors.map((message) => (
                              <li key={message} className="text-xs text-red-600">
                                {message}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p id="invite-password-requirements" className="text-xs text-brand-blue">
                            This password meets the requirements.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p id="invite-password-requirements" className="text-xs text-muted-foreground">
                        At least {MIN_PASSWORD_LENGTH} characters. A passphrase of a few words works
                        well.
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-brand-blue hover:bg-brand-blue-dark"
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating account…
                      </>
                    ) : (
                      "Create account & join"
                    )}
                  </Button>
                </form>
              </div>
            )}
          </>
        )}

        <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          This page shows only the company, role and inviter for this invitation.
        </p>
        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">{APP.name}</p>
      </div>
    </main>
  );
}

function SignedInPanel({
  viewerEmail,
  invitedEmail,
  busy,
  onAccept,
  onSwitchAccount,
  signInHref,
}: {
  viewerEmail: string | null;
  invitedEmail: string;
  busy: boolean;
  onAccept: () => void;
  onSwitchAccount: () => void;
  signInHref: string;
}) {
  const matches =
    viewerEmail !== null && viewerEmail.trim().toLowerCase() === invitedEmail.trim().toLowerCase();

  if (!matches) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-900">
              This invitation was sent to a different address
            </p>
            <p className="text-xs leading-relaxed text-amber-800">
              You are signed in as {viewerEmail ?? "another account"}, but the invitation is for{" "}
              {invitedEmail}. Sign in with that address to accept it — an invitation cannot be
              transferred to another account.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onSwitchAccount}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use a different account"}
        </Button>
        <Button asChild className="w-full bg-brand-blue hover:bg-brand-blue-dark">
          <Link href={signInHref}>Sign in as {invitedEmail}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-muted-foreground">Signed in as {invitedEmail}</p>
      <Button
        type="button"
        className="w-full bg-brand-blue hover:bg-brand-blue-dark"
        onClick={onAccept}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Joining…
          </>
        ) : (
          "Accept invitation"
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onSwitchAccount}
        disabled={busy}
      >
        Use a different account
      </Button>
    </div>
  );
}

function StatusBlock({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-blue-light">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
