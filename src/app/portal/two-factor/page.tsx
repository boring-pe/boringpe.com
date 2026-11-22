import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-50">
      <div className="w-full max-w-sm">
        <KeyRound className="h-7 w-7 text-blue-500" />
        <h1 className="mt-6 text-2xl font-bold text-white">Two-step sign-in</h1>
        <p className="mt-2 text-sm text-slate-400">Enter the 6-digit code from your authenticator app for {user.email}, or one of your recovery codes.</p>
        {e ? <p role="alert" className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">That code did not work. After 5 wrong tries the account is locked for 15 minutes.</p> : null}
        <form action={submitCode} className="mt-6 space-y-4">
          <input
            name="code" required autoFocus autoComplete="one-time-code" inputMode="text" maxLength={12} placeholder="123456"
            aria-label="Code"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2.5 text-center font-mono text-xl tracking-[0.3em] text-white focus:border-blue-500 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="trust" /> Trust this browser for 30 days
          </label>
          <button className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Continue</button>
        </form>
        <form action={signOutAction} className="mt-6 text-center">
          <button className="text-xs text-slate-500 hover:text-white">Sign out</button>
        </form>
      </div>
    </main>
  );
}
