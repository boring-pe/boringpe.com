"use client";

import { useActionState } from "react";
import { changePassword, type AccountState } from "./actions";

const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none";

export function PasswordChangeForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(changePassword, null);
  return (
    <form action={action} className="max-w-sm space-y-3">
      {hasPassword ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Current password</span>
          <input name="current" type="password" required autoComplete="current-password" maxLength={200} className={input} />
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">New password (12 or more characters)</span>
        <input name="next" type="password" required minLength={12} autoComplete="new-password" maxLength={200} className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Repeat new password</span>
        <input name="confirm" type="password" required minLength={12} autoComplete="new-password" maxLength={200} className={input} />
      </label>
      {state?.message ? (
        <p role="alert" className="text-xs text-red-400">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Saving" : "Save password"}
      </button>
    </form>
  );
}
