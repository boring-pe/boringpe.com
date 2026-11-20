import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/dal";
import { providerFlags } from "@/lib/providers";
import { oauthSignIn } from "./actions";
import { MagicLinkForm, PasswordForm } from "./login-forms";

export const metadata: Metadata = {
  title: "Sign in — Boring Portal",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  AccessDenied: "That account has not been invited, or it is switched off. Ask an admin for access.",
  OAuthAccountNotLinked: "Use the sign-in method you were invited with.",
  Verification: "That link has expired or was already used. Request a new one.",
};

function Social({ provider, label }: { provider: "google" | "linkedin"; label: string }) {
  return (
    <form action={oauthSignIn}>
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        className="w-full rounded-md border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
      >
        {label}
      </button>
    </form>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; changed?: string }>;
}) {
  if (await getCurrentUser()) redirect("/portal");

  const { error, sent, changed } = await searchParams;
  const flags = providerFlags();
  const problem = error ? (ERRORS[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-50">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <Building2 className="h-7 w-7 text-blue-500" />
          <div>
            <div className="text-sm font-bold text-white">BORING PE</div>
            <div className="text-xs text-slate-500">Boring Portal</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">Access is by invitation.</p>

        {problem ? (
          <p role="alert" className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {problem}
          </p>
        ) : null}
        {changed ? (
          <p className="mt-6 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
            Password changed. Sign in again with the new one.
          </p>
        ) : null}
        {sent ? (
          <p className="mt-6 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
            If that address is invited, a sign-in link is on its way.
          </p>
        ) : null}

        <div className="mt-6 space-y-6">
          <PasswordForm />

          {flags.google || flags.linkedin || flags.email ? (
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="h-px flex-1 bg-slate-800" />
              or
              <span className="h-px flex-1 bg-slate-800" />
            </div>
          ) : null}

          {flags.google ? <Social provider="google" label="Continue with Google" /> : null}
          {flags.linkedin ? <Social provider="linkedin" label="Continue with LinkedIn" /> : null}
          {flags.email ? <MagicLinkForm /> : null}
        </div>
      </div>
    </main>
  );
}
