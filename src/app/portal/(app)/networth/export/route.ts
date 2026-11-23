import { paiseToDecimal } from "@/lib/accounting";
import { requireSection } from "@/lib/dal";
import { fiscalYearOf } from "@/lib/hr-calc";
import { csvCell } from "@/lib/mis-calc";
import { netWorthReport } from "@/lib/networth";
import { flatten } from "@/lib/networth-calc";

const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Every level's net worth, income and expenses as a CSV for a spreadsheet. */
export async function GET(request: Request) {
  await requireSection("networth");
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = isDate(url.searchParams.get("from")) ?? fiscalYearOf(today)[0];
  const to = isDate(url.searchParams.get("to")) ?? today;
  const r = await netWorthReport(from, to);
  const d = paiseToDecimal;
  const rows: (string | number)[][] = [
    ["Net worth", `balances at ${to}`, `income and expenses ${from} to ${to}`],
    [],
    ["Level", "Depth", "Kind", "Assets", "Liabilities", "Net worth", "At market", "Income", "Expenses", "Surplus", "Invested cost", "Current value", "Counted once inside"],
    ...flatten(r.tree).map((n) => {
      const f = r.figures.get(n.key)!;
      const inside = f.internal.fees + f.internal.transfers + f.internal.stakesCost;
      return [`${"  ".repeat(n.depth)}${n.name}`, n.depth, n.kind ?? "all", d(f.assets), d(f.liabilities), d(f.netWorth), d(f.marketNetWorth), d(f.income), d(f.expense), d(f.net), d(f.cost), d(f.value), d(inside)];
    }),
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="net-worth-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
