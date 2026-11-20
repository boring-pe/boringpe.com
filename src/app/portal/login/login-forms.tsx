"use client";

import { useActionState } from "react";
import { emailSignIn, passwordSignIn, type FormState } from "./actions";

const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const primary =
  "w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(passwordSignIn, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Email</span>
        <input name="email" type="email" required autoComplete="username" maxLength={254} className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={200}
          className={input}
        />
      </label>
      {state?.message ? (
        <p role="alert" className="text-xs text-red-400">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}

export function MagicLinkForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(emailSignIn, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Email me a sign-in link</span>
        <input name="email" type="email" required autoComplete="email" maxLength={254} className={input} />
      </label>
      {state?.message ? (
        <p role="alert" className="text-xs text-red-400">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Sending" : "Send link"}
      </button>
    </form>
  );
}
