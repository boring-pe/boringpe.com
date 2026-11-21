"use client";

import { useActionState } from "react";
import type { Created } from "./actions";

const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

function Shown({ state, what }: { state: Created; what: string }) {
  if (state.error) return <p role="status" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>;
  if (!state.secret) return null;
  return (
    <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      Copy this {what} now. It will not be shown again.
      <code className="mt-2 block break-all rounded bg-slate-950 p-2 text-xs text-white" data-secret>{state.secret}</code>
    </div>
  );
}

export function NewKeyForm({ action, scopes }: { action: (s: Created, f: FormData) => Promise<Created>; scopes: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <input name="name" required maxLength={80} placeholder="Name, e.g. Zapier" className={input} />
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        {scopes.map((s) => <label key={s.id} className="flex items-center gap-2"><input type="checkbox" name="scopes" value={s.id} defaultChecked={s.id === "read"} />{s.label}</label>)}
      </div>
      <button disabled={pending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Create key</button>
      <Shown state={state} what="key" />
    </form>
  );
}

export function NewWebhookForm({ action, events }: { action: (s: Created, f: FormData) => Promise<Created>; events: readonly string[] }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <input name="url" required placeholder="https://hooks.zapier.com/…" className={input} />
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        {events.map((e) => <label key={e} className="flex items-center gap-2"><input type="checkbox" name="events" value={e} />{e}</label>)}
      </div>
      <button disabled={pending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Add endpoint</button>
      <Shown state={state} what="signing secret" />
    </form>
  );
}
