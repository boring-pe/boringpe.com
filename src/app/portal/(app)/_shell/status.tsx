import Link from "next/link";
import { AlarmClockOff, Clock } from "lucide-react";

// One colour per meaning on every portal page, always with a word (never colour alone):
// green done, amber waiting on someone, orange a date slipped, red something went wrong,
// blue in flight, neutral ended normally. Plain money figures stay neutral.
export type Tone = "success" | "warning" | "overdue" | "danger" | "info" | "neutral";

const TONE_BY_STATUS: Record<string, Tone> = {
  // done, good
  active: "success", approved: "success", recorded: "success", paid: "success", done: "success", completed: "success",
  verified: "success", passed: "success", accepted: "success", closed_won: "success", won: "success", settled: "success", published: "success", sent: "success",
  // in flight
  issued: "info", posted: "info", in_progress: "info", processing: "info", scheduled: "info", queued: "info", submitted: "info", started: "info", diligence: "info", negotiation: "info",
  // waiting on someone
  draft: "warning", pending: "warning", awaiting_approval: "warning", requested: "warning", invited: "warning", partial: "warning", on_hold: "warning", review: "warning",
  // went wrong
  rejected: "danger", failed: "danger", fail: "danger", error: "danger", revoked: "danger", lost: "danger",
  // a date slipped
  overdue: "overdue",
  // ended normally
  cancelled: "neutral", withdrawn: "neutral", closed: "neutral", passed_on: "neutral", archived: "neutral", exited: "neutral", disabled: "neutral", inactive: "neutral",
};

export function statusTone(status: string | null | undefined): Tone {
  return TONE_BY_STATUS[(status ?? "").toLowerCase().replace(/[\s-]+/g, "_")] ?? "neutral";
}

/** "awaiting_approval" → "Awaiting approval". */
export const statusLabel = (status: string) => {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** A status in the shared colour for its meaning. Pass `tone` to override, `label` to reword. */
export function StatusChip({ status, label, tone }: { status: string; label?: string; tone?: Tone }) {
  return (
    <span className="chip" data-tone={tone ?? statusTone(status)} data-status={status}>
      {label ?? statusLabel(status)}
    </span>
  );
}

/** The one pill for anything with a due date: icon, word and colour together. */
export function DueChip({ state, label }: { state: "overdue" | "dueSoon"; label?: string }) {
  const Icon = state === "overdue" ? AlarmClockOff : Clock;
  return (
    <span className="chip" data-tone={state === "overdue" ? "overdue" : "warning"} data-due={state}>
      <Icon aria-hidden className="h-3 w-3" />
      {label ?? (state === "overdue" ? "Overdue" : "Due soon")}
    </span>
  );
}

/** Whether a date (YYYY-MM-DD) is past or within the next week, compared with today. */
export function dueState(due: string | null | undefined, today: string, soonDays = 7): "overdue" | "dueSoon" | null {
  if (!due) return null;
  if (due < today) return "overdue";
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + soonDays * 86_400_000).toISOString().slice(0, 10);
  return due <= soon ? "dueSoon" : null;
}

/**
 * An empty list is an invitation to act: an icon, what is missing, one line on the next step,
 * and the button that takes it.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  body?: string;
  action?: { label: string; href: string };
  compact?: boolean;
}) {
  return (
    <div
      data-empty={title}
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 text-center ${compact ? "px-4 py-8" : "px-6 py-14"}`}
    >
      <Icon aria-hidden className={`mb-3 text-slate-500 ${compact ? "h-6 w-6" : "h-9 w-9"}`} />
      <p className={`font-semibold text-white ${compact ? "text-sm" : "text-base"}`}>{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-slate-400">{body}</p> : null}
      {action ? (
        <Link href={action.href} className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
