import { getSql } from "./db";
import { profitAndLoss } from "./accounting";
import { balances, decimalToPaise } from "./books";
import { fiscalYearOf } from "./hr-calc";
import { listCapTable, listHoldings, type HoldingRow } from "./investments";
import { listVentures, type VentureRow } from "./ventures";

export type ScopeType = "entity" | "venture" | "holding";
export const isScopeType = (v: unknown): v is ScopeType => v === "entity" || v === "venture" || v === "holding";
export const SCOPE_LABEL: Record<ScopeType, string> = { entity: "SPV or company", venture: "Venture", holding: "Holding" };

/** Roles that see only what is linked to them. */
export const EXTERNAL_ROLES = ["operator", "cobuild_partner", "founder", "lp"] as const;

export type ScopeRow = { id: string; user_id: string; user_email: string; user_role: string; scope_type: ScopeType; ref_id: string; ref_name: string | null };

export async function listScopes() {
  const sql = await getSql();
  return sql.query<ScopeRow>(
    `select s.id, s.user_id, u.email as user_email, u.role as user_role, s.scope_type, s.ref_id,
            coalesce(e.name, v.name, h.name) as ref_name
       from access_scopes s join users u on u.id = s.user_id
       left join entities e on s.scope_type = 'entity' and e.id = s.ref_id
       left join ventures v on s.scope_type = 'venture' and v.id = s.ref_id
       left join holdings h on s.scope_type = 'holding' and h.id = s.ref_id
      order by u.email, s.scope_type, ref_name`,
  );
}

export async function externalUsers() {
  const sql = await getSql();
  return sql.query<{ id: string; email: string; role: string }>(
    "select id, email, role from users where status = 'active' and role = any($1::text[]) order by email",
    [[...EXTERNAL_ROLES]],
  );
}

/** Links a user to one item. Returns false when the user or item is not valid. */
export async function addScope(userId: string, type: ScopeType, refId: string, by: string): Promise<boolean> {
  const sql = await getSql();
  const table = type === "entity" ? "entities" : type === "venture" ? "ventures" : "holdings";
  const rows = await sql.query(
    `insert into access_scopes (user_id, scope_type, ref_id, created_by)
     select u.id, $2, x.id, $4 from users u, ${table} x
      where u.id = $1 and u.role = any($5::text[]) and x.id = $3
     on conflict (user_id, scope_type, ref_id) do nothing returning id`,
    [userId, type, refId, by, [...EXTERNAL_ROLES]],
  );
  return rows.length > 0;
}

export async function removeScope(id: string) {
  const sql = await getSql();
  return (await sql.query("delete from access_scopes where id = $1 returning id", [id])).length > 0;
}

async function scopeIds(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ scope_type: ScopeType; ref_id: string }>(
    "select scope_type, ref_id from access_scopes where user_id = $1",
    [userId],
  );
  const of = (t: ScopeType) => new Set(rows.filter((r) => r.scope_type === t).map((r) => r.ref_id));
  return { entities: of("entity"), ventures: of("venture"), holdings: of("holding") };
}

export type ScopedEntity = {
  id: string; name: string; kind: string;
  income: bigint; expense: bigint; net: bigint; cash: bigint; fyFrom: string;
  cap: Awaited<ReturnType<typeof listCapTable>>;
  holdings: HoldingRow[];
};

/** Everything one external person may see: linked companies, holdings and ventures. */
export async function myView(userId: string): Promise<{ entities: ScopedEntity[]; holdings: HoldingRow[]; ventures: VentureRow[] }> {
  const ids = await scopeIds(userId);
  const sql = await getSql();
  const today = new Date().toISOString().slice(0, 10);
  const [fyFrom] = fiscalYearOf(today);
  const entityRows = ids.entities.size
    ? await sql.query<{ id: string; name: string; kind: string }>(
        "select id, name, kind from entities where id = any($1::text[]) order by name",
        [[...ids.entities]],
      )
    : [];
  const allHoldings = ids.entities.size || ids.holdings.size ? await listHoldings() : [];
  const entities = await Promise.all(
    entityRows.map(async (e) => {
      const [period, upTo, cap] = await Promise.all([balances(e.id, fyFrom, today), balances(e.id, null, today), listCapTable(e.id)]);
      const pl = profitAndLoss(period);
      const cash = upTo.filter((r) => r.code === "1010" || r.code === "1020").reduce((s, r) => s + r.debit - r.credit, 0n);
      return {
        ...e, income: pl.income.total, expense: pl.expense.total, net: pl.net, cash, fyFrom, cap,
        holdings: allHoldings.filter((h) => h.holder_entity_id === e.id),
      };
    }),
  );
  return {
    entities,
    holdings: allHoldings.filter((h) => ids.holdings.has(h.id)),
    ventures: await listVentures(userId),
  };
}

export const capRowPaise = (r: { invested: string }) => decimalToPaise(r.invested);
