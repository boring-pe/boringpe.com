import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { progress } from "@/lib/guides-calc";

type Progress = ReturnType<typeof progress>;

/** One workflow: a bar, its steps ticked off, and a button to the next one. */
export function Checklist({ id, title, summary, p, compact = false }: { id: string; title: string; summary: string; p: Progress; compact?: boolean }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5" data-guide={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{summary}</p>
        </div>
        <span className={`text-xs ${p.complete ? "text-green-400" : "text-slate-400"}`} data-guide-progress>{p.complete ? "Done" : `${p.done} of ${p.total}`}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden><div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} /></div>
      <ol className="mt-4 space-y-2">
        {p.steps.slice(0, compact ? 4 : undefined).map((s) => (
          <li key={s.title} className="flex items-start gap-2.5 text-sm">
            {s.isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />}
            <span className="min-w-0">
              <Link href={s.href} className={s.isDone ? "text-slate-400 line-through decoration-slate-600" : "text-white hover:text-blue-300"}>{s.title}</Link>
              {!compact ? <span className="block text-xs text-slate-500">{s.why}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {p.next ? (
        <Link href={p.next.href} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500" data-guide-next>
          Next: {p.next.title}<ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </section>
  );
}
