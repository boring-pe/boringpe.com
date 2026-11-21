import { paiseToDecimal } from "@/lib/accounting";
import { requireSection } from "@/lib/dal";
import { fiscalYearOf } from "@/lib/hr-calc";
import { misReport } from "@/lib/mis";
import { csvCell } from "@/lib/mis-calc";

const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The MIS figures as a CSV for a spreadsheet: entities, group, months, verticals. */
export async function GET(request: Request) {
  await requireSection("reports");
  const url = new URL(request.url);
  const [fyFrom, fyTo] = fiscalYearOf(new Date().toISOString().slice(0, 10));
  const from = isDate(url.searchParams.get("from")) ?? fyFrom;
  const to = isDate(url.searchParams.get("to")) ?? fyTo;
  const r = await misReport(from, to);
  const d = paiseToDecimal;
  const rows: (string | number)[][] = [
    ["Boring PE MIS", `${from} to ${to}`],
    [],
    ["Entity", "Kind", "Income", "Expenses", "Profit", "Cash", "Assets", "Liabilities"],
    ...r.perEntity.map((e) => [e.name, e.kind, d(e.income), d(e.expense), d(e.net), d(e.cash), d(e.assets), d(e.liabilities)]),
    ["Less: fees between our entities", "", d(-r.intercompany), d(-r.intercompany), "", "", "", ""],
    ["Group", "", d(r.group.income), d(r.group.expense), d(r.group.net), d(r.group.cash), d(r.group.assets), d(r.group.liabilities)],
    [],
    ["Month", "Income", "Expenses"],
    ...r.months.map((m) => [m.month, d(m.income), d(m.expense)]),
    [],
    ["Venture vertical", "Venture-months", "Revenue", "Costs", "Fee", "Operators", "Net"],
    ...r.ventures.map((v) => [v.pillar, v.months, d(v.revenue), d(v.costs), d(v.fee), d(v.operators), d(v.net)]),
    [],
    ["Holdings vertical", "Holdings", "Invested", "Value", "Returned"],
    ...r.holdings.map((h) => [h.pillar, h.count, d(h.invested), d(h.value), d(h.returned)]),
    [],
    ["Active people", r.headcount],
    ["Payroll gross", d(r.payroll)],
    ["Impact Marrow contributions", d(r.impact.amount)],
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="boring-pe-mis-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
