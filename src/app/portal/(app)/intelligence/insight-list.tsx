import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AREA_LABEL, type Insight, type Severity } from "@/lib/insights-calc";

export const SEVERITY: Record<Severity, { label: string; dot: string; text: string }> = {
  critical: { label: "Act now", dot: "bg-red-400", text: "text-red-400" },
  warning: { label: "Watch", dot: "bg-amber-400", text: "text-amber-400" },
  info: { label: "Note", dot: "bg-blue-400", text: "text-blue-400" },
  good: { label: "Going well", dot: "bg-green-400", text: "text-green-400" },
};

export function InsightList({ items, compact = false }: { items: Insight[]; compact?: boolean }) {
  return (
    <ul className="divide-y divide-slate-800">
      {items.map((i) => (
        <li key={i.id} data-insight={i.id} data-severity={i.severity}>
          <Link href={i.href} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-800/40">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY[i.severity].dot}`} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-white">{i.title}</span>
              {compact ? null : <span className="mt-0.5 block text-sm text-slate-400">{i.detail}</span>}
              <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span className={SEVERITY[i.severity].text}>{SEVERITY[i.severity].label}</span>
                <span>{AREA_LABEL[i.area]}</span>
                {compact ? null : <span>{i.scope}</span>}
              </span>
            </span>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-blue-400" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
