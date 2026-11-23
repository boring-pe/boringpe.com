import { getSql } from "./db";
import { decimalToPaise } from "./books";
import { fiscalYearOf } from "./hr-calc";
import { listHoldings, toTxns } from "./investments";
import { VERTICALS, type Vertical } from "./ops-fields";
import { position } from "./portfolio-calc";
import { listVentures } from "./ventures";
import { entityIdsInView, workspaceContext } from "./workspaces";

export type VerticalFigures = {
  vertical: Vertical;
  ventures: number;
  holdings: number;
  openDeals: number;
  openTasks: number;
  /** This financial year. */
  billed: bigint;
  owed: bigint;
  moneyIn: bigint;
  moneyOut: bigint;
  ventureRevenue: bigint;
  ventureNet: bigint;
  studioFees: bigint;
  holdingsValue: bigint;
  holdingsCost: bigint;
};

/** The headline figures for every vertical, this financial year, in the workspaces on view. */
export async function verticalFigures(today = new Date().toISOString().slice(0, 10)): Promise<VerticalFigures[]> {
  const sql = await getSql();
  const ids = await entityIdsInView();
  const [from, to] = fiscalYearOf(today);
  const firm = (await workspaceContext()).inView.includes("boring_pe");
  const [counts, ventures, holdings] = await Promise.all([
    sql.query<{ vertical: string; kind: string; n: string; a: string | null; b: string | null }>(
      `select pillar as vertical, 'deals' as kind, count(*)::text as n, null as a, null as b from deals where $4 and stage not in ('closed', 'passed') group by 1
       union all
       select vertical, 'tasks', count(*)::text, null, null from tasks where not done and vertical is not null and workspace = any($5::text[]) group by 1
       union all
       select vertical, 'invoices', count(*)::text, sum(total)::text, sum(total - received - tds)::text from invoices
        where status in ('issued', 'paid') and entity_id = any($1::text[]) and issue_date between $2::date and $3::date group by 1
       union all
       select vertical, 'money', count(*)::text,
              sum(case when direction = 'in' then amount else 0 end)::text, sum(case when direction = 'out' then amount else 0 end)::text
         from money_entries where entity_id = any($1::text[]) and entry_date between $2::date and $3::date and status in ('recorded', 'approved', 'paid') group by 1`,
      [ids, from, to, firm, (await workspaceContext()).inView],
    ),
    listVentures(null),
    listHoldings(),
  ]);
  const periods = await sql.query<{ pillar: string; revenue: string; net: string; fee: string }>(
    `select v.pillar, sum(p.revenue)::text as revenue, sum(p.net)::text as net, sum(p.fee)::text as fee
       from venture_periods p join ventures v on v.id = p.venture_id
      where v.entity_id = any($1::text[]) and p.period between date_trunc('month', $2::date)::date and $3::date group by 1`,
    [ids, from, to],
  );
  const get = (v: string, kind: string) => counts.find((c) => c.vertical === v && c.kind === kind);
  const p = (x: string | null | undefined) => decimalToPaise(x ?? "0");
  const allFees = periods.reduce((s, r) => s + p(r.fee), 0n);
  return VERTICALS.map(({ id }) => {
    const hs = holdings.filter((h) => h.pillar === id && h.status === "active").map((h) => position(toTxns(h)));
    const per = periods.find((r) => r.pillar === id);
    const inv = get(id, "invoices");
    const money = get(id, "money");
    return {
      vertical: id,
      ventures: ventures.filter((v) => v.pillar === id && v.status === "active").length,
      holdings: hs.length,
      openDeals: Number(get(id, "deals")?.n ?? 0),
      openTasks: Number(get(id, "tasks")?.n ?? 0),
      billed: p(inv?.a),
      owed: p(inv?.b),
      moneyIn: p(money?.a),
      moneyOut: p(money?.b),
      ventureRevenue: p(per?.revenue),
      ventureNet: p(per?.net),
      // Boring Studio earns the fees every venture pays it.
      studioFees: id === "enable" ? allFees : 0n,
      holdingsValue: hs.reduce((s, x) => s + x.currentValue, 0n),
      holdingsCost: hs.reduce((s, x) => s + x.costRemaining, 0n),
    };
  });
}

/** The records behind a vertical's page. */
export async function verticalRecords(v: Vertical) {
  const sql = await getSql();
  const ids = await entityIdsInView();
  const { inView } = await workspaceContext();
  const [ventures, holdings, deals, invoices, tasks] = await Promise.all([
    listVentures(null),
    listHoldings(),
    sql.query<{ id: string; name: string; stage: string; value: string | null; party_name: string | null }>(
      `select d.id, d.name, d.stage, d.value::text, p.name as party_name from deals d left join parties p on p.id = d.party_id
        where d.pillar = $1 and $2 and d.stage not in ('closed', 'passed') order by d.updated_at desc limit 20`,
      [v, inView.includes("boring_pe")],
    ),
    sql.query<{ id: string; number: string | null; party: string; total: string; status: string; due_date: string; owed: string }>(
      `select i.id, i.number, p.name as party, i.total::text, i.status, i.due_date::text, (i.total - i.received - i.tds)::text as owed
         from invoices i join parties p on p.id = i.party_id
        where i.vertical = $1 and i.entity_id = any($2::text[]) order by i.issue_date desc, i.created_at desc limit 15`,
      [v, ids],
    ),
    sql.query<{ id: string; title: string; due_date: string | null; assignee_email: string | null }>(
      `select t.id, t.title, t.due_date::text, u.email as assignee_email from tasks t left join users u on u.id = t.assignee_id
        where t.vertical = $1 and not t.done and t.workspace = any($2::text[]) order by t.due_date nulls last limit 15`,
      [v, inView],
    ),
  ]);
  return {
    // Boring Studio manages every venture.
    ventures: v === "enable" ? ventures : ventures.filter((x) => x.pillar === v),
    holdings: holdings.filter((h) => h.pillar === v).map((h) => ({ ...h, pos: position(toTxns(h)) })),
    deals,
    invoices,
    tasks,
  };
}

export async function setVertical(table: "invoices" | "money_entries" | "tasks", id: string, v: Vertical | null) {
  if (!v) return;
  const sql = await getSql();
  await sql.query(`update ${table} set vertical = $2 where id = $1`, [id, v]);
}
