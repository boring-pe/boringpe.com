"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { CATEGORIES, PILLARS } from "@/lib/ops-fields";
import { quickAdd, quickOptions, type QuickKind, type QuickOptions, type QuickResult } from "./quick-actions";
import { SubmitButton } from "./buttons";

export const OPEN_QUICK = "portal:quick";
/** Opens the quick-add panel from anywhere: a + New item, a shortcut, an empty state. */
export const openQuick = (kind: QuickKind) => window.dispatchEvent(new CustomEvent(OPEN_QUICK, { detail: kind }));

const TITLE: Record<QuickKind, { title: string; note: string; page: string; done: string }> = {
  task: { title: "Add a task", note: "Something to do, with an owner and a date.", page: "Open tasks", done: "Add task" },
  money: { title: "Record money", note: "Money that came in, or a payment to make.", page: "Open money", done: "Record" },
  deal: { title: "Add a deal", note: "A new opportunity in the pipeline.", page: "Open deals", done: "Add deal" },
};

const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const field = "block space-y-1.5";
const label = "block text-xs font-medium text-slate-400";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function Fields({ kind, opts }: { kind: QuickKind; opts: QuickOptions | null }) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  if (kind === "task") {
    return (
      <>
        <label className={field}><span className={label}>Task</span><input name="title" required minLength={2} maxLength={200} autoFocus placeholder="What needs doing" className={input} /></label>
        <label className={field}><span className={label}>Due date (optional)</span><input name="due" type="date" className={input} /></label>
        {opts?.assignees.length ? (
          <label className={field}><span className={label}>Owner</span>
            <select name="assigneeId" defaultValue={opts.me} className={input}>
              <option value="">Nobody yet</option>
              {opts.assignees.map((a) => <option key={a.id} value={a.id}>{a.id === opts.me ? `${a.label} (you)` : a.label}</option>)}
            </select>
          </label>
        ) : null}
        {opts?.deals.length ? (
          <label className={field}><span className={label}>Deal (optional)</span>
            <select name="dealId" defaultValue="" className={input}><option value="">No deal</option>{opts.deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
          </label>
        ) : null}
      </>
    );
  }
  if (kind === "deal") {
    return (
      <>
        <label className={field}><span className={label}>Deal name</span><input name="name" required minLength={2} maxLength={140} autoFocus placeholder="Company or opportunity" className={input} /></label>
        <label className={field}><span className={label}>Vertical</span>
          <select name="pillar" defaultValue="build" className={input}>{PILLARS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </label>
        <label className={field}><span className={label}>Value in ₹ (optional)</span><input name="value" inputMode="decimal" placeholder="25,00,000" className={input} /></label>
        <label className={field}><span className={label}>Notes (optional)</span><textarea name="notes" maxLength={1000} rows={3} className={input} /></label>
      </>
    );
  }
  return (
    <>
      <input type="hidden" name="currency" value="INR" />
      <input type="hidden" name="direction" value={direction} />
      <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
        {(["in", "out"] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} data-direction={d}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${direction === d ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
            {d === "in" ? "Money in" : "Payment out"}
          </button>
        ))}
      </div>
      {direction === "out" ? <p className="text-xs text-slate-500">A payment counts once the Super Admin approves it. If that is you, it counts at once.</p> : null}
      <label className={field}><span className={label}>Amount in ₹</span><input name="amount" required inputMode="decimal" autoFocus placeholder="50,000" className={input} /></label>
      <label className={field}><span className={label}>Category</span>
        <select name="category" defaultValue={direction === "in" ? "investment" : "expense"} key={direction} className={input}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
      </label>
      <label className={field}><span className={label}>Date</span><input name="date" type="date" defaultValue={today()} className={input} /></label>
      {opts?.entities.length ? (
        <label className={field}><span className={label}>Whose books</span>
          <select name="entityId" defaultValue={opts.entities.find((e) => e.main)?.id ?? opts.entities[0].id} className={input}>{opts.entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
        </label>
      ) : null}
      <label className={field}><span className={label}>{direction === "out" ? "What is it for?" : "What is it for? (optional)"}</span>
        <input name="memo" maxLength={300} required={direction === "out"} minLength={direction === "out" ? 3 : undefined} placeholder={direction === "out" ? "Say what the payment is for" : "Optional"} className={input} />
      </label>
      {opts?.deals.length ? (
        <label className={field}><span className={label}>Deal (optional)</span>
          <select name="dealId" defaultValue="" className={input}><option value="">No deal</option>{opts.deals.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </label>
      ) : null}
    </>
  );
}

/** One kind's form. Remounted for each opening, so a fresh form never shows the last result. */
function QuickForm({ kind, onDone }: { kind: QuickKind; onDone: (r: NonNullable<QuickResult>) => void }) {
  const [state, action] = useActionState(quickAdd.bind(null, kind), null);
  const [opts, setOpts] = useState<QuickOptions | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    quickOptions(kind).then((o) => { if (live) setOpts(o); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [kind]);
  useEffect(() => { if (state?.ok) onDone(state); }, [state, onDone]);
  const t = TITLE[kind];
  return (
    <form action={action} className="flex h-full flex-col" data-quick-form={kind}>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {state && !state.ok ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "color-mix(in oklab, var(--p-bad) 45%, transparent)", color: "var(--p-bad)" }} data-quick-error>
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{state.text}
          </p>
        ) : null}
        {failed ? <p className="text-sm text-slate-400">The lists for this form did not load. You can still fill in the rest, or <Link href={`/portal/${kind === "task" ? "tasks" : kind === "money" ? "money" : "deals"}`} className="text-blue-400">open the page</Link>.</p> : null}
        <Fields kind={kind} opts={opts} />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
        <SubmitButton pending="Saving…">{t.done}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * The quick-add panel: add a task, record money or add a deal from any page without leaving it.
 * It runs each page's own action, so nothing is checked or recorded differently.
 */
export function QuickAddHost({ allowed }: { allowed: QuickKind[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<QuickKind | null>(null);
  const [opening, setOpening] = useState(0);
  const kindRef = useRef<QuickKind | null>(null);
  const [toast, setToast] = useState<{ r: NonNullable<QuickResult>; kind: QuickKind } | null>(null);

  useEffect(() => {
    const open = (e: Event) => {
      const k = (e as CustomEvent<QuickKind>).detail;
      if (!allowed.includes(k)) return;
      setKind(k);
      kindRef.current = k;
      setOpening((n) => n + 1);
      dialog.current?.showModal();
    };
    window.addEventListener(OPEN_QUICK, open);
    return () => window.removeEventListener(OPEN_QUICK, open);
  }, [allowed]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const done = useCallback((r: NonNullable<QuickResult>) => {
    dialog.current?.close();
    setToast({ r, kind: kindRef.current ?? "task" });
  }, []);
  const t = kind ? TITLE[kind] : null;

  return (
    <>
      <dialog ref={dialog} className="sheet" aria-labelledby="quick-title" onClick={(e) => e.target === dialog.current && dialog.current?.close()} onClose={() => setKind(null)} data-quick>
        {kind && t ? (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <h2 id="quick-title" className="text-base font-semibold text-white">{t.title}</h2>
                <p className="mt-0.5 text-sm text-slate-400">{t.note}</p>
              </div>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1"><QuickForm key={`${kind}-${opening}`} kind={kind} onDone={done} /></div>
          </div>
        ) : null}
      </dialog>
      {toast ? (
        <div role="status" data-persist data-quick-toast className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0" style={{ color: "var(--p-good)" }} />
          <span>{toast.r.text}</span>
          <Link href={toast.r.href} onClick={() => setToast(null)} className="shrink-0 font-medium text-blue-400 hover:text-blue-300">{TITLE[toast.kind].page}</Link>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="shrink-0 rounded p-0.5 text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      ) : null}
    </>
  );
}
