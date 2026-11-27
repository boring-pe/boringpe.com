import { IDLE_MINUTES } from "@/lib/security-calc";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { providerFlags } from "@/lib/providers";
import { SignIn } from "./login-forms";
import { SignInShell } from "../sign-in-shell";

export const metadata: Metadata = {
  title: "Sign in — Boring Portal",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  AccessDenied: "That account has not been invited, or it is switched off. Ask an admin for access.",
  OAuthAccountNotLinked: "Use the sign-in method you were invited with.",
  Verification: "That link has expired or was already used. Request a new one.",
};

/**
 * Boring portal sign-in, laid out like Sevastack's impact portal: one card, your email first,
 * then how to prove it. Step 2 is the two-step code for roles that need one.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; changed?: string; idle?: string }>;
}) {
  if (await getCurrentUser()) redirect("/portal");

  const { error, sent, changed, idle } = await searchParams;
  const flags = providerFlags();
  const notice = error
    ? { tone: "bad" as const, text: ERRORS[error] ?? "Sign-in failed. Try again." }
    : idle
      ? { tone: "info" as const, text: `You were signed out after ${IDLE_MINUTES} minutes without activity, to keep the portal safe on an unattended screen.` }
      : changed
        ? { tone: "info" as const, text: "Password changed. Sign in again with the new one." }
        : null;

  return (
    <SignInShell>
      <SignIn flags={flags} notice={notice} sent={Boolean(sent)} />
    </SignInShell>
  );
}
