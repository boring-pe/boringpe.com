"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Loader2, LockKeyhole, Mail, MailCheck } from "lucide-react";
import { emailSignIn, oauthSignIn, passwordSignIn, type FormState } from "./actions";
import { SignInCard, SignInNotice } from "../sign-in-shell";

type Stage = "identify" | "password" | "sent";
type Flags = { google: boolean; linkedin: boolean; email: boolean };

const input =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none sm:text-sm";
const primary =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60";
const outline =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60";
const link = "font-medium text-blue-400 underline-offset-4 hover:underline";
const quiet = "inline-flex min-h-8 items-center text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline";
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path fill="#0A66C2" d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z" />
    </svg>
  );
}

/**
 * Step 1 of the sign-in, after Sevastack's impact portal: your email first, then how to prove it
 * (password, or a link by email when that is switched on), or Google or LinkedIn. Step 2 is the
 * two-step code for roles that need one, on its own page; everyone else lands in the portal.
 */
export function SignIn({ flags, notice, sent = false }: { flags: Flags; notice: { tone: "bad" | "info"; text: string } | null; sent?: boolean }) {
  const [stage, setStage] = useState<Stage>(sent ? "sent" : "identify");
  const [email, setEmail] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(passwordSignIn, null);
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(emailSignIn, null);
  const social = flags.google || flags.linkedin;

  const proceed = (to: Stage) => {
    if (!looksLikeEmail(email)) { setIdError("Enter the email address you were invited with."); return false; }
    setIdError(null);
    setStage(to);
    return true;
  };

  const stepText = stage === "identify" ? "Step 1 of 2: who are you?" : stage === "password" ? "Step 1 of 2: confirm it's you" : "Step 2 of 2: open the link we sent";

  return (
    <SignInCard step={stage === "sent" ? 2 : 1} stepText={stepText}>
      {notice ? <SignInNotice tone={notice.tone}>{notice.text}</SignInNotice> : null}

      {stage === "identify" ? (
        <form
          className="auth-stage mt-5 space-y-4"
          data-signin-stage="identify"
          onSubmit={(e) => { e.preventDefault(); proceed("password"); }}
          noValidate
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Email</span>
            <input
              name="email" type="email" required autoComplete="username" maxLength={254} autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" className={input}
              aria-invalid={idError ? true : undefined} aria-describedby={idError ? "id-error" : undefined}
            />
          </label>
          {idError ? <p id="id-error" role="alert" className="text-sm text-red-400">{idError}</p> : null}
          <div className={`grid gap-3 ${flags.email ? "grid-cols-2" : "grid-cols-1"}`}>
            {flags.email ? (
              <button
                type="button"
                className={outline}
                data-method="link"
                disabled={linkPending}
                onClick={() => {
                  if (!looksLikeEmail(email)) { setIdError("Enter the email address you were invited with."); return; }
                  setIdError(null);
                  (document.getElementById("link-form") as HTMLFormElement | null)?.requestSubmit();
                }}
              >
                {linkPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
                {linkPending ? "Sending…" : "Email link"}
              </button>
            ) : null}
            <button type="submit" className={primary} data-method="password">
              <LockKeyhole className="h-4 w-4" aria-hidden /> Password
            </button>
          </div>
          {linkState?.message ? <p role="alert" className="text-sm text-red-400">{linkState.message}</p> : null}
          {social ? (
            <>
              <div className="flex items-center gap-3 text-xs text-slate-500" role="separator">
                <span className="h-px flex-1 bg-slate-800" /> or <span className="h-px flex-1 bg-slate-800" />
              </div>
              <div className="grid gap-2">
                {flags.google ? (
                  <button type="submit" form="oauth-google" className={outline}><GoogleMark /> Continue with Google</button>
                ) : null}
                {flags.linkedin ? (
                  <button type="submit" form="oauth-linkedin" className={outline}><LinkedInMark /> Continue with LinkedIn</button>
                ) : null}
              </div>
            </>
          ) : null}
        </form>
      ) : null}

      {stage === "password" ? (
        <form action={pwAction} className="auth-stage mt-5 space-y-4" data-signin-stage="password">
          <p className="text-sm text-slate-300">
            Signing in as <span className="font-medium text-white [overflow-wrap:anywhere]">{email}</span>.{" "}
            <button type="button" onClick={() => setStage("identify")} className={link}>Change</button>
          </p>
          {/* The address goes with the password, and password managers still see a username. */}
          <input type="email" name="email" value={email} readOnly autoComplete="username" hidden />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Password</span>
            <input name="password" type="password" required autoComplete="current-password" maxLength={200} autoFocus className={input} />
          </label>
          {pwState?.message ? <p role="alert" className="text-sm text-red-400">{pwState.message}</p> : null}
          <button type="submit" disabled={pwPending} className={primary}>
            {pwPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Signing in…</> : <>Sign in <ArrowRight className="h-4 w-4" aria-hidden /></>}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-500">Forgot it? An admin can reset it.</span>
            {flags.email ? (
              <button type="submit" form="link-form" className={quiet}>Email me a link instead</button>
            ) : null}
          </div>
        </form>
      ) : null}

      {stage === "sent" ? (
        <div className="auth-stage mt-6 flex flex-col items-center gap-3 py-4 text-center" role="status">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400"><MailCheck className="h-7 w-7" aria-hidden /></span>
          <p className="font-medium text-white">Check your inbox</p>
          <p className="text-sm text-slate-400">If that address is invited, a sign-in link is on its way. It works once and expires soon.</p>
          <button type="button" onClick={() => setStage("identify")} className={quiet}>Use a different email</button>
        </div>
      ) : null}

      {/* Forms the buttons above submit, kept outside the stages so each works from either one. */}
      {flags.email ? (
        <form id="link-form" action={linkAction} hidden>
          <input type="hidden" name="email" value={email} />
        </form>
      ) : null}
      {flags.google ? <form id="oauth-google" action={oauthSignIn} hidden><input type="hidden" name="provider" value="google" /></form> : null}
      {flags.linkedin ? <form id="oauth-linkedin" action={oauthSignIn} hidden><input type="hidden" name="provider" value="linkedin" /></form> : null}
    </SignInCard>
  );
}
