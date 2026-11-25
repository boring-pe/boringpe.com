// Small server-rendered SVG charts that follow the portal theme. No chart library.
import Link from "next/link";

const short = (p: bigint) => {
  const r = Number(p) / 100;
  const a = Math.abs(r);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : `${Math.round(a)}`;
  return `${r < 0 ? "−" : ""}₹${s}`;
};
export const compactRupees = short;

export function Sparkline({ values, label }: { values: bigint[]; label: string }) {
  if (values.length < 2) return null;
  const nums = values.map(Number);
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => [(i / (nums.length - 1)) * 100, 28 - ((v - min) / span) * 24]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-3 h-8 w-full opacity-90" role="img" aria-label={label}>
      <path d={`${line} L100,32 L0,32 Z`} fill="currentColor" fillOpacity="0.14" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Deals per stage; each row opens the deals list. */
export function StageBars({ rows }: { rows: { label: string; n: number; value: string; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="truncate text-slate-400 group-hover:text-white">{r.label}</span>
            <span className="h-2 rounded-full bg-slate-800">
              <span className="block h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${(r.n / max) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-slate-300">{r.n}{r.value ? <span className="ml-1 text-xs text-slate-500">{r.value}</span> : null}</span>
          </>
        );
        const cls = "group grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 rounded-md px-1.5 py-1.5 text-sm";
        return (
          <li key={r.label} data-stage={r.label}>
            {r.href ? <Link href={r.href} className={`${cls} transition-colors hover:bg-slate-800/60`}>{inner}</Link> : <div className={cls}>{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
