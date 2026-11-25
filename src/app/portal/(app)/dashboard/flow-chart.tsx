"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type FlowPoint = {
  key: string;
  label: string;
  /** The day or month in words, for the tooltip. */
  title: string;
  /** Rupees (not paise): the chart only draws them. */
  income: number;
  expense: number;
  lastYear: number;
  /** Where clicking this bar goes: the reports for exactly these dates. */
  href: string;
};

type Series = "income" | "expense" | "lastYear";
const SERIES: { id: Series; label: string; color: string; dashed?: boolean }[] = [
  { id: "income", label: "Income", color: "var(--a-500)" },
  { id: "expense", label: "Expenses", color: "color-mix(in oklab, var(--p-muted) 60%, transparent)" },
  { id: "lastYear", label: "Income a year earlier", color: "var(--p-muted)", dashed: true },
];

export function compactINR(r: number): string {
  const a = Math.abs(r);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
  return `${r < 0 ? "−" : ""}₹${s.replace(".0", "")}`;
}
const fullINR = (r: number) => `${r < 0 ? "−" : ""}₹${Math.abs(r).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function Tip({ active, payload }: { active?: boolean; payload?: { payload: FlowPoint }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const net = p.income - p.expense;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-white">{p.title}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
        <dt className="text-slate-400">Income</dt><dd className="text-right text-white">{fullINR(p.income)}</dd>
        <dt className="text-slate-400">Expenses</dt><dd className="text-right text-white">{fullINR(p.expense)}</dd>
        <dt className="text-slate-400">Net</dt><dd className={`text-right font-semibold ${net < 0 ? "text-red-400" : "text-white"}`}>{fullINR(net)}</dd>
        <dt className="text-slate-500">A year earlier</dt><dd className="text-right text-slate-400">{fullINR(p.lastYear)}</dd>
      </dl>
      <p className="mt-1.5 text-[11px] text-slate-500">Click to open its report</p>
    </div>
  );
}

/** Income and expenses for each day or month of the period, with the same time a year earlier. Hover for figures, click a bar for its report. */
export default function FlowChart({ data }: { data: FlowPoint[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<Series>>(new Set());
  const toggle = (s: Series) => setHidden((h) => {
    const n = new Set(h);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });
  const open = (p?: FlowPoint) => p && router.push(p.href);
  const many = data.length > 14;
  return (
    <div className="flex flex-col gap-2" data-flow-chart>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show or hide a series">
        {SERIES.map((s) => {
          const on = !hidden.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              data-series={s.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${on ? "border-slate-700 text-slate-200" : "border-slate-800 text-slate-500 line-through"}`}
            >
              {s.dashed
                ? <span aria-hidden className="w-3 border-t-2 border-dashed" style={{ borderColor: s.color }} />
                : <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />}
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap={many ? "12%" : "24%"}>
            <CartesianGrid vertical={false} stroke="var(--p-line)" strokeDasharray="3 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--p-line-strong)" }} tick={{ fill: "var(--p-muted)", fontSize: 11 }} interval={many ? "preserveStartEnd" : 0} minTickGap={8} />
            <YAxis tickFormatter={(v: number) => compactINR(v)} tickLine={false} axisLine={false} tick={{ fill: "var(--p-muted)", fontSize: 11 }} width={56} />
            <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in oklab, var(--p-muted) 12%, transparent)" }} />
            {!hidden.has("income") ? <Bar dataKey="income" name="Income" fill="var(--a-500)" radius={[3, 3, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={(d) => open((d as unknown as { payload: FlowPoint }).payload)} /> : null}
            {!hidden.has("expense") ? <Bar dataKey="expense" name="Expenses" fill={SERIES[1].color} radius={[3, 3, 0, 0]} isAnimationActive={false} cursor="pointer" onClick={(d) => open((d as unknown as { payload: FlowPoint }).payload)} /> : null}
            {!hidden.has("lastYear") ? <Line dataKey="lastYear" name="Income a year earlier" type="monotone" stroke="var(--p-muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
