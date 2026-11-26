import Link from "next/link";
import { Check, X } from "lucide-react";
import type { Step } from "@/lib/workflows-calc";

const DOT: Record<Step["state"], string> = {
  done: "var(--p-good)",
  current: "var(--a-500)",
  todo: "var(--p-line-strong)",
  stopped: "var(--p-muted)",
};

/**
 * A workflow as numbered steps, the order being the point: across the card on wide screens, down
 * it on phones. Done steps are ticked, the current one says what to do and links straight to it.
 */
export function WorkflowSteps({ steps, title, note }: { steps: Step[]; title: string; note?: string }) {
  const current = steps.find((s) => s.state === "current");
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5" data-workflow={title}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-slate-500" data-workflow-progress>
          {steps.filter((s) => s.state === "done").length} of {steps.length} done{note ? ` · ${note}` : ""}
        </span>
      </div>
      <ol className="grid gap-4 md:grid-flow-col md:auto-cols-fr md:gap-2">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 md:flex-col md:gap-2" data-step={s.id} data-state={s.state} aria-current={s.state === "current" ? "step" : undefined}>
            {/* The line joining this step to the next. */}
            {i < steps.length - 1 ? (
              <span aria-hidden className="absolute left-[0.9rem] top-8 bottom-[-1rem] w-px md:left-8 md:right-[-0.5rem] md:top-[0.9rem] md:bottom-auto md:h-px md:w-auto" style={{ background: s.state === "done" ? DOT.done : "var(--p-line)" }} />
            ) : null}
            <span
              className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold tabular-nums"
              style={{
                borderColor: DOT[s.state],
                background: s.state === "done" ? DOT.done : "var(--p-surface)",
                color: s.state === "done" ? "white" : s.state === "current" ? DOT.current : "var(--p-muted)",
              }}
            >
              {s.state === "done" ? <Check aria-hidden className="h-4 w-4" /> : s.state === "stopped" ? <X aria-hidden className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 md:pr-2">
              <p className={`text-sm font-medium ${s.state === "todo" || s.state === "stopped" ? "text-slate-400" : "text-white"}`}>{s.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">{s.detail}</p>
              {s.action && s.state === "current" ? (
                <Link href={s.action.href} className="mt-2 inline-flex rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500" data-step-action={s.id}>
                  {s.action.label}
                </Link>
              ) : s.action && s.state === "done" ? (
                <Link href={s.action.href} className="mt-1 inline-flex text-xs text-blue-400 hover:text-blue-300">{s.action.label}</Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!current && steps.every((s) => s.state === "done") ? <p className="mt-4 text-xs" style={{ color: "var(--p-good)" }}>Every step is done.</p> : null}
    </section>
  );
}

/** A row of small dots for a list: how far a record has come, with the next step in words. */
export function StepDots({ steps, label }: { steps: Step[]; label?: string }) {
  const next = steps.find((s) => s.state === "current");
  const done = steps.filter((s) => s.state === "done").length;
  const stopped = steps.some((s) => s.state === "stopped");
  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-500" title={steps.map((s) => `${s.label}: ${s.detail}`).join("\n")} data-step-dots={`${done}/${steps.length}`}>
      <span className="inline-flex gap-1" aria-hidden>
        {steps.map((s) => <span key={s.id} className="h-1.5 w-3 rounded-full" style={{ background: DOT[s.state] }} />)}
      </span>
      <span className="sr-only">{label ?? "Progress"}: {done} of {steps.length} steps done.</span>
      {stopped ? "Stopped" : next ? `Next: ${next.label.charAt(0).toLowerCase()}${next.label.slice(1)}` : "Done"}
    </span>
  );
}
