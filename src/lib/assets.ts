import { getSql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, ensureCharts, postByCodes } from "./books";
import { disposal, monthlyDepreciation, type AssetCategory } from "./assets-calc";
import { monthEnd } from "./venture-calc";

export type AssetRow = {
  id: string; entity_id: string; name: string; category: AssetCategory; purchase_date: string; cost: string; salvage: string;
  method: "slm" | "wdv"; life_months: number; wdv_bps: number; status: "active" | "disposed"; disposed_on: string | null;
  proceeds: string | null; accumulated: string;
};
export type RunRow = { id: string; period: string; total: string };

export async function listAssets(entityId: string) {
  const sql = await getSql();
  return sql.query<AssetRow>(
    `select a.id, a.entity_id, a.name, a.category, a.purchase_date::text, a.cost::text, a.salvage::text, a.method, a.life_months,
            a.wdv_bps, a.status, a.disposed_on::text, a.proceeds::text,
            coalesce((select sum(d.amount) from asset_depreciation d where d.asset_id = a.id), 0)::text as accumulated
       from fixed_assets a where a.entity_id = $1 order by a.status, a.purchase_date desc`,
    [entityId],
  );
}

export async function listRuns(entityId: string) {
  const sql = await getSql();
  return sql.query<RunRow>("select id, period::text, total::text from depreciation_runs where entity_id = $1 order by period desc limit 24", [entityId]);
}

/** Records a purchase: the asset at cost against the bank (paid) or payables (on credit). */
export async function addAsset(a: {
  entityId: string; name: string; category: AssetCategory; purchaseDate: string; cost: bigint; salvage: bigint;
  method: "slm" | "wdv"; lifeMonths: number; wdvBps: number; paid: boolean; by: string;
}) {
  await ensureCharts();
  const sql = await getSql();
  return sql.tx(async (db) => {
    const row = (await db.query<{ id: string }>(
      `insert into fixed_assets (entity_id, name, category, purchase_date, cost, salvage, method, life_months, wdv_bps, created_by)
       values ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10) returning id`,
      [a.entityId, a.name, a.category, a.purchaseDate, paiseToDecimal(a.cost), paiseToDecimal(a.salvage), a.method, a.lifeMonths, a.wdvBps, a.by],
    ))[0];
    const journal = await postByCodes(db, {
      entityId: a.entityId, date: a.purchaseDate, by: a.by, sourceType: "asset", sourceId: row.id, memo: `Bought ${a.name}`,
      lines: [{ code: "1600", debit: a.cost, credit: 0n }, { code: a.paid ? "1010" : "2010", debit: 0n, credit: a.cost }],
    });
    await db.query("update fixed_assets set purchase_journal_id = $2 where id = $1", [row.id, journal]);
    return row.id;
  });
}

/**
 * Charges one month's depreciation for every asset an entity holds that month, once per month,
 * as a single entry: depreciation expense against accumulated depreciation.
 */
export async function runDepreciation(entityId: string, period: string, by: string): Promise<"ok" | "exists" | "nothing"> {
  await ensureCharts();
  const sql = await getSql();
  return sql.tx(async (db) => {
    await db.query("select id from entities where id = $1 for update", [entityId]);
    if ((await db.query("select 1 from depreciation_runs where entity_id = $1 and period = $2::date", [entityId, period])).length) return "exists" as const;
    const assets = await db.query<{ id: string; purchase_date: string; cost: string; salvage: string; method: "slm" | "wdv"; life_months: number; wdv_bps: number; accumulated: string }>(
      `select a.id, a.purchase_date::text, a.cost::text, a.salvage::text, a.method, a.life_months, a.wdv_bps,
              coalesce((select sum(d.amount) from asset_depreciation d where d.asset_id = a.id), 0)::text as accumulated
         from fixed_assets a
        where a.entity_id = $1 and a.purchase_date <= $3::date and (a.disposed_on is null or a.disposed_on >= $2::date)`,
      [entityId, period, monthEnd(period)],
    );
    const charges = assets
      .map((a) => ({
        id: a.id,
        amount: monthlyDepreciation({
          cost: decimalToPaise(a.cost), salvage: decimalToPaise(a.salvage), method: a.method, lifeMonths: a.life_months,
          wdvBps: a.wdv_bps, purchaseDate: a.purchase_date,
        }, period, decimalToPaise(a.accumulated)),
      }))
      .filter((c) => c.amount > 0n);
    if (charges.length === 0) return "nothing" as const;
    const total = charges.reduce((s, c) => s + c.amount, 0n);
    const journal = await postByCodes(db, {
      entityId, date: monthEnd(period), by, sourceType: "depreciation", memo: `Depreciation ${period.slice(0, 7)}`,
      lines: [{ code: "5200", debit: total, credit: 0n }, { code: "1690", debit: 0n, credit: total }],
    });
    const run = (await db.query<{ id: string }>(
      "insert into depreciation_runs (entity_id, period, total, journal_entry_id, created_by) values ($1, $2::date, $3, $4, $5) returning id",
      [entityId, period, paiseToDecimal(total), journal, by],
    ))[0];
    for (const c of charges) {
      await db.query("insert into asset_depreciation (run_id, asset_id, amount) values ($1, $2, $3)", [run.id, c.id, paiseToDecimal(c.amount)]);
    }
    return "ok" as const;
  });
}

/** Sells or scraps an asset: removes cost and accumulated depreciation, books proceeds and the gain or loss. */
export async function disposeAsset(id: string, date: string, proceeds: bigint, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const a = (await db.query<{ entity_id: string; name: string; cost: string; accumulated: string; purchase_date: string }>(
      `select a.entity_id, a.name, a.cost::text, a.purchase_date::text,
              coalesce((select sum(d.amount) from asset_depreciation d where d.asset_id = a.id), 0)::text as accumulated
         from fixed_assets a where a.id = $1 and a.status = 'active' for update`,
      [id],
    ))[0];
    if (!a || date < a.purchase_date) return false;
    const cost = decimalToPaise(a.cost);
    const acc = decimalToPaise(a.accumulated);
    const { gain } = disposal(cost, acc, proceeds);
    const journal = await postByCodes(db, {
      entityId: a.entity_id, date, by, sourceType: "asset_disposal", sourceId: id, memo: `Disposed of ${a.name}`,
      lines: [
        { code: "1010", debit: proceeds, credit: 0n }, { code: "1690", debit: acc, credit: 0n }, { code: "1600", debit: 0n, credit: cost },
        { code: "4900", debit: 0n, credit: gain > 0n ? gain : 0n }, { code: "5900", debit: gain < 0n ? -gain : 0n, credit: 0n },
      ],
    });
    await db.query(
      "update fixed_assets set status = 'disposed', disposed_on = $2::date, proceeds = $3, disposal_journal_id = $4 where id = $1",
      [id, date, paiseToDecimal(proceeds), journal],
    );
    return true;
  });
}
