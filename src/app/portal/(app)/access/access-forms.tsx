"use client";

import { useActionState } from "react";
import { ROLE_META, type Role } from "@/lib/rbac";
import { inviteUser, resetPassword, type AccessState } from "./actions";

const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

function Secret({ state }: { state: AccessState }) {
  if (!state?.tempPassword) return null;
  return (
    <div className="mt-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
      <div>
        Temporary password for <span className="font-semibold">{state.email}</span>. It is shown once.
        They must replace it at first sign-in.
      </div>
      <code className="mt-2 block select-all rounded bg-slate-950 px-2 py-1.5 font-mono text-sm text-white">
        {state.tempPassword}
      </code>
    </div>
  );
}

export function InviteForm({ roles }: { roles: Role[] }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(inviteUser, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-4">
      <input name="email" type="email" required placeholder="Email" maxLength={254} className={input} />
      <input name="name" placeholder="Name (optional)" maxLength={120} className={input} />
      <select name="role" defaultValue="lp" className={input}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {ROLE_META[role].label}
          </option>
        ))}
      </select>
      <select name="passwordMode" defaultValue="none" className={input}>
        <option value="none">No password (Google, LinkedIn or email link)</option>
        <option value="generate">Generate a temporary password</option>
      </select>
      <div className="md:col-span-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Inviting" : "Invite"}
        </button>
        {state?.message && !state.tempPassword ? (
          <span role="status" className="text-xs text-slate-400">
            {state.message}
          </span>
        ) : null}
        {state?.message === "Invited." && !state.tempPassword ? (
          <span className="text-xs text-slate-400">{state.email} can now sign in.</span>
        ) : null}
      </div>
      <div className="md:col-span-4">
        <Secret state={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(resetPassword, null);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-60"
      >
        {pending ? "Resetting" : "Reset password"}
      </button>
      {state?.message && !state.tempPassword ? (
        <div className="mt-1 text-xs text-red-400">{state.message}</div>
      ) : null}
      <Secret state={state} />
    </form>
  );
}
