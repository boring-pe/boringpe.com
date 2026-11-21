// Small server-rendered SVG charts that follow the portal theme. No chart library.

const short = (p: bigint) => {
  const r = Number(p) / 100;
  const a = Math.abs(r);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : `${Math.round(a)}`;
  return `${r < 0 ? "−" : ""}₹${s}`;
};
export const compactRupees = short;
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });

export function Sparkline({ values, label }: { values: bigint[]; label: string }) {
  if (values.length < 2) return null;
  const nums = values.map(Number);
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums.map((v, i) => [(i / (nums.length - 1)) * 100, 28 - ((v - min) / span) * 24]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-3 h-8 w-full" role="img" aria-label={label}>
      <path d={`${line} L100,32 L0,32 Z`} fill="color-mix(in oklab, var(--a-500) 14%, transparent)" />
      <path d={line} fill="none" stroke="var(--a-500)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Income and expenses side by side for each month; the net is in each bar pair's tooltip. */
export function IncomeExpenseChart({ months }: { months: { month: string; income: bigint; expense: bigint }[] }) {
  const max = months.reduce((m, x) => (x.income > m ? x.income : x.expense > m ? x.expense : m), 1n);
  const H = 160, W = 640;
  const slot = W / Math.max(months.length, 1);
  const h = (v: bigint) => (v <= 0n ? 0 : Math.max(2, (Number(v) / Number(max)) * (H - 24)));
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 22}`} preserveAspectRatio="xMidYMid meet" className="h-56 w-full min-w-[320px]" role="img" aria-label="Income and expenses by month">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - f * (H - 24)} y2={H - f * (H - 24)} stroke="var(--p-line)" strokeDasharray="3 4" />
        ))}
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--p-line-strong)" />
        {months.map((m, i) => {
          const x = i * slot + slot / 2 - 14;
          return (
            <g key={m.month}>
              <title>{`${monthName(m.month)}: income ${short(m.income)}, expenses ${short(m.expense)}, net ${short(m.income - m.expense)}`}</title>
              <rect x={x} y={H - h(m.income)} width="13" height={h(m.income)} rx="3" fill="var(--a-500)" />
              <rect x={x + 16} y={H - h(m.expense)} width="13" height={h(m.expense)} rx="3" fill="color-mix(in oklab, var(--p-muted) 55%, transparent)" />
              <text x={x + 14} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--p-muted)">{monthName(m.month)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function StageBars({ rows }: { rows: { label: string; n: number; value: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-400">{r.label}</span>
          <span className="h-2 rounded-full bg-slate-800">
            <span className="block h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="text-slate-300">{r.n}{r.value ? <span className="ml-1 text-xs text-slate-500">{r.value}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}
