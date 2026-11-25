"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DEFAULT_PERIOD, PERIODS, type Period } from "@/lib/dashboard-calc";

/** Picks the dates every money figure on the dashboard covers. The choice lives in the address, so it can be shared. */
export function PeriodPicker({ current }: { current: Period }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const pick = (v: Period) => {
    const next = new URLSearchParams(params.toString());
    if (v === DEFAULT_PERIOD) next.delete("period");
    else next.set("period", v);
    start(() => router.replace(`${path}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return (
    <div className="flex min-w-0 items-center gap-2" data-period-picker>
      <div role="radiogroup" aria-label="Period" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-1">
        {PERIODS.map((p) => {
          const on = p.value === current;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => !on && pick(p.value)}
              data-period={p.value}
              title={p.label}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="hidden md:inline">{p.label}</span>
              <span className="md:hidden">{p.short}</span>
            </button>
          );
        })}
      </div>
      {pending ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" role="status">
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          Updating
        </span>
      ) : null}
    </div>
  );
}
