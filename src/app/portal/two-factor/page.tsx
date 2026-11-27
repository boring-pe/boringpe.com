import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SignInCard, SignInNotice, SignInShell } from "../sign-in-shell";
import { getCurrentUser, getSessionUser } from "@/lib/dal";
import { signOutAction } from "../(app)/sign-out";
import { submitCode } from "./actions";

export const metadata: Metadata = { title: "Two-step sign-in — Boring Portal", robots: { index: false, follow: false } };

/** The second step: a code from the authenticator app, or a recovery code. */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getCurrentUser()) redirect("/portal");
  const user = await getSessionUser();
  if (!user) redirect("/portal/login");
  const { e } = await searchParams;
  return (
    <SignInShell>
      <SignInCard step={2} stepText="Step 2 of 2: your two-step code" title="Two-step sign-in" icon={ShieldCheck}>
        <p className="mt-5 text-sm text-slate-300">
          Enter the 6-digit code from your authenticator app for <span className="font-medium text-white [overflow-wrap:anywhere]">{user.email}</span>, or one of your recovery codes.
        </p>
        {e ? <SignInNotice tone="bad">That code did not work. After 5 wrong tries the account is locked for 15 minutes.</SignInNotice> : null}
        <form action={submitCode} className="auth-stage mt-5 space-y-4">
          <input
            name="code" required autoFocus autoComplete="one-time-code" inputMode="text" maxLength={12} placeholder="123456"
            aria-label="Code"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-center font-mono text-2xl tracking-[0.35em] text-white focus:border-blue-500 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="trust" className="h-4 w-4 accent-[var(--a-500)]" /> Trust this browser for 30 days
          </label>
          <button className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Continue</button>
        </form>
        <form action={signOutAction} className="mt-4 text-center">
          <button className="inline-flex min-h-8 items-center text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">Use a different account</button>
        </form>
      </SignInCard>
    </SignInShell>
  );
}
