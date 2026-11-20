"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { looksLikeEmail, normalizeEmail } from "@/lib/admin-emails";
import { providerFlags } from "@/lib/providers";

export type FormState = { message: string } | null;

const GENERIC =
  "Those details did not work. After 5 failed attempts an account is locked for 15 minutes.";

export async function passwordSignIn(_: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (!looksLikeEmail(email) || !password) return { message: GENERIC };
  try {
    await signIn("credentials", { email, password, redirectTo: "/portal" });
  } catch (error) {
    if (error instanceof AuthError) return { message: GENERIC };
    throw error; // the success redirect is thrown by Next and must pass through
  }
  return null;
}

export async function oauthSignIn(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  const flags = providerFlags();
  if ((provider === "google" && flags.google) || (provider === "linkedin" && flags.linkedin)) {
    await signIn(provider, { redirectTo: "/portal" });
  }
}

export async function emailSignIn(_: FormState, formData: FormData): Promise<FormState> {
  if (!providerFlags().email) return { message: "Email sign-in is not switched on." };
  const email = normalizeEmail(formData.get("email"));
  if (!looksLikeEmail(email)) return { message: "Enter a valid email address." };
  try {
    await signIn("resend", { email, redirectTo: "/portal" });
  } catch (error) {
    if (error instanceof AuthError) return { message: "Could not send the link. Try again shortly." };
    throw error;
  }
  return null;
}
