import { getSql, type Sql } from "./db";
import { paiseToDecimal } from "./accounting";
import { decimalToPaise, ensureCharts, postByCodes, type CodeLine } from "./books";
import { ageingBucket, invoiceNumber, invoiceTotals, type InvoiceLine } from "./invoice-calc";
import { rateText, toInr } from "./assets-calc";

export type GstProfile = { id: string; name: string; gstin: string | null; state_code: string | null; address: string; invoice_prefix: string };
export type PartyGst = { id: string; name: string; kind: string; email: string | null; gstin: string | null; state_code: string | null; address: string; entity_id: string | null };
export type InvoiceRow = {
  id: string; entity_id: string; entity_name: string; party_id: string; party_name: string; party_gstin: string | null;
  number: string | null; status: "draft" | "issued" | "paid" | "cancelled"; issue_date: string; due_date: string; place_of_supply: string;
  income_code: string; subtotal: string; cgst: string; sgst: string; igst: string; total: string; received: string; tds: string;
  notes: string; source_type: string; currency: string; fx_rate: string | null; fx_total: string | null; fx_settled: string;
};
export type InvoiceDetail = InvoiceRow & {
  seller: GstProfile; buyer: PartyGst;
  lines: { description: string; sac: string; qty_milli: string; rate: string; gst_bps: number; amount: string; tax: string; fx_rate_amount: string | null; fx_amount: string | null }[];
  receipts: { receipt_date: string; amount: string; tds: string }[];
};

export const INCOME_ACCOUNTS = [
  { code: "4010", label: "Management fees" },
  { code: "4020", label: "Commission and profit share" },
  { code: "4040", label: "Venture revenue" },
  { code: "4900", label: "Other income" },
] as const;

export async function gstProfiles() {
  await ensureCharts();
  const sql = await getSql();
  return sql.query<GstProfile>("select id, name, gstin, state_code, address, invoice_prefix from entities where active order by (kind = 'boring_pe') desc, name");
}
export async function updateEntityGst(id: string, p: { gstin: string | null; stateCode: string | null; address: string; prefix: string }) {
  const sql = await getSql();
  await sql.query("update entities set gstin = $2, state_code = $3, address = $4, invoice_prefix = $5 where id = $1", [id, p.gstin, p.stateCode, p.address, p.prefix]);
}
export async function listPartiesGst() {
  const sql = await getSql();
  return sql.query<PartyGst>("select id, name, kind, email, gstin, state_code, address, entity_id from parties order by name");
}
export async function updatePartyGst(id: string, p: { gstin: string | null; stateCode: string | null; address: string }) {
  const sql = await getSql();
  return (await sql.query("update parties set gstin = $2, state_code = $3, address = $4 where id = $1 returning id", [id, p.gstin, p.stateCode, p.address])).length > 0;
}

const INV_SELECT = `
  select i.id, i.entity_id, e.name as entity_name, i.party_id, p.name as party_name, p.gstin as party_gstin, i.number, i.status,
         i.issue_date::text, i.due_date::text, i.place_of_supply, i.income_code, i.subtotal::text, i.cgst::text, i.sgst::text,
         i.igst::text, i.total::text, i.received::text, i.tds::text, i.notes, i.source_type, i.currency, i.fx_rate::text,
         i.fx_total::text, i.fx_settled::text
    from invoices i join entities e on e.id = i.entity_id join parties p on p.id = i.party_id`;

export async function listInvoices() {
  const sql = await getSql();
  return sql.query<InvoiceRow>(`${INV_SELECT} order by i.issue_date desc, i.created_at desc limit 300`);
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const sql = await getSql();
  const inv = (await sql.query<InvoiceRow>(`${INV_SELECT} where i.id = $1`, [id]))[0];
  if (!inv) return null;
  const [seller, buyer, lines, receipts] = await Promise.all([
    sql.query<GstProfile>("select id, name, gstin, state_code, address, invoice_prefix from entities where id = $1", [inv.entity_id]),
    sql.query<PartyGst>("select id, name, kind, email, gstin, state_code, address, entity_id from parties where id = $1", [inv.party_id]),
    sql.query<InvoiceDetail["lines"][number]>(
      `select description, sac, qty_milli::text, rate::text, gst_bps, amount::text, tax::text, fx_rate_amount::text, fx_amount::text
         from invoice_lines where invoice_id = $1 order by id`,
      [id],
    ),
    sql.query<InvoiceDetail["receipts"][number]>(
      "select receipt_date::text, amount::text, tds::text from invoice_receipts where invoice_id = $1 order by receipt_date, created_at",
      [id],
    ),
  ]);
  return { ...inv, seller: seller[0], buyer: buyer[0], lines, receipts };
}

export type NewInvoice = {
  entityId: string; partyId: string; issueDate: string; dueDate: string; placeOfSupply: string; incomeCode: string; notes: string;
  lines: (InvoiceLine & { description: string; sac: string })[]; by: string; sourceType?: string; sourceId?: string | null;
  /** Rates on the lines are in this currency; the invoice is booked in rupees at `fxRate` (millionths of a rupee per unit). */
  currency?: string; fxRate?: bigint | null;
};

/** Creates a draft. Tax is CGST and SGST when the place of supply is the seller's state, otherwise IGST. */
export async function createInvoiceIn(db: Sql, inv: NewInvoice): Promise<string> {
  const seller = (await db.query<{ state_code: string | null }>("select state_code from entities where id = $1", [inv.entityId]))[0];
  const intra = !seller?.state_code || seller.state_code === inv.placeOfSupply;
  const foreign = inv.currency && inv.currency !== "INR" && inv.fxRate ? inv.fxRate : null;
  const t = invoiceTotals(inv.lines, intra);
  // In rupees: each line converted, then the invoice totals are the sums of the converted lines.
  const inr = t.perLine.map((l) => (foreign ? { amount: toInr(l.amount, foreign), tax: toInr(l.tax, foreign) } : l));
  const subtotal = inr.reduce((s, l) => s + l.amount, 0n);
  const tax = inr.reduce((s, l) => s + l.tax, 0n);
  const cgst = intra ? tax - tax / 2n : 0n;
  const sgst = intra ? tax / 2n : 0n;
  const igst = intra ? 0n : tax;
  const row = (await db.query<{ id: string }>(
    `insert into invoices (entity_id, party_id, issue_date, due_date, place_of_supply, income_code, subtotal, cgst, sgst, igst, total,
                           notes, source_type, source_id, created_by, currency, fx_rate, fx_total)
     values ($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::numeric,$18::numeric) returning id`,
    [inv.entityId, inv.partyId, inv.issueDate, inv.dueDate, inv.placeOfSupply, inv.incomeCode, paiseToDecimal(subtotal),
      paiseToDecimal(cgst), paiseToDecimal(sgst), paiseToDecimal(igst), paiseToDecimal(subtotal + tax), inv.notes,
      inv.sourceType ?? "manual", inv.sourceId ?? null, inv.by, foreign ? inv.currency : "INR",
      foreign ? rateText(foreign) : null, foreign ? paiseToDecimal(t.total) : null],
  ))[0];
  for (const [i, l] of inv.lines.entries()) {
    await db.query(
      `insert into invoice_lines (invoice_id, description, sac, qty_milli, rate, gst_bps, amount, tax, fx_rate_amount, fx_amount)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric)`,
      [row.id, l.description, l.sac, l.qtyMilli.toString(), paiseToDecimal(foreign ? toInr(l.rate, foreign) : l.rate), l.gstBps,
        paiseToDecimal(inr[i].amount), paiseToDecimal(inr[i].tax),
        foreign ? paiseToDecimal(l.rate) : null, foreign ? paiseToDecimal(t.perLine[i].amount) : null],
    );
  }
  return row.id;
}

export async function createInvoice(inv: NewInvoice) {
  const sql = await getSql();
  return sql.tx((db) => createInvoiceIn(db, inv));
}

/** Issues a draft: gives it the next number of its entity and posts receivable, income and output GST. */
export async function issueIn(db: Sql, id: string, by: string): Promise<{ journal: string; number: string } | null> {
  const inv = (await db.query<{ entity_id: string; issue_date: string; income_code: string; subtotal: string; cgst: string; sgst: string; igst: string; total: string; source_type: string; source_id: string | null; party: string }>(
    `select i.entity_id, i.issue_date::text, i.income_code, i.subtotal::text, i.cgst::text, i.sgst::text, i.igst::text, i.total::text,
            i.source_type, i.source_id, p.name as party
       from invoices i join parties p on p.id = i.party_id where i.id = $1 and i.status = 'draft' for update of i`,
    [id],
  ))[0];
  if (!inv) return null;
  const fy = invoiceNumber("", inv.issue_date, 0).split("/")[1];
  const seq = (await db.query<{ n: number; prefix: string }>(
    `update entities set next_invoice_no = case when invoice_fy is distinct from $2 then 2 else next_invoice_no + 1 end, invoice_fy = $2
      where id = $1 returning next_invoice_no - 1 as n, invoice_prefix as prefix`,
    [inv.entity_id, fy],
  ))[0];
  const number = invoiceNumber(seq.prefix, inv.issue_date, seq.n);
  const [sub, cgst, sgst, igst, total] = [inv.subtotal, inv.cgst, inv.sgst, inv.igst, inv.total].map(decimalToPaise);
  const lines: CodeLine[] = [
    { code: "1100", debit: total, credit: 0n }, { code: inv.income_code, debit: 0n, credit: sub },
    { code: "2110", debit: 0n, credit: cgst }, { code: "2120", debit: 0n, credit: sgst }, { code: "2130", debit: 0n, credit: igst },
  ];
  const journal = await postByCodes(db, {
    entityId: inv.entity_id, date: inv.issue_date, by, memo: `Invoice ${number} to ${inv.party}`,
    sourceType: inv.source_type === "venture_fee" ? "venture_fee" : "invoice", sourceId: id, lines,
  });
  await db.query("update invoices set status = 'issued', number = $2, journal_entry_id = $3 where id = $1", [id, number, journal]);
  return { journal, number };
}

export async function issueInvoice(id: string, by: string) {
  await ensureCharts();
  const sql = await getSql();
  return sql.tx((db) => issueIn(db, id, by));
}

export async function deleteDraft(id: string) {
  const sql = await getSql();
  return (await sql.query("delete from invoices where id = $1 and status = 'draft' returning id", [id])).length > 0;
}

/**
 * Money received against an invoice, with TDS the customer deducted. Never more than is outstanding.
 * For an invoice in another currency, `fxSettled` is how much of it this payment settles: the receivable
 * comes off at the invoice's rate and any difference from the rupees actually received is an exchange gain or loss.
 */
export async function recordReceipt(
  id: string, r: { date: string; amount: bigint; tds: bigint; by: string; fxSettled?: bigint | null; bankCode?: string },
): Promise<"ok" | "too-much" | "not-open" | "needs-fx"> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const inv = (await db.query<{ entity_id: string; number: string; total: string; received: string; tds: string; currency: string; fx_rate: string | null; fx_total: string | null; fx_settled: string }>(
      `select entity_id, number, total::text, received::text, tds::text, currency, fx_rate::text, fx_total::text, fx_settled::text
         from invoices where id = $1 and status = 'issued' for update`,
      [id],
    ))[0];
    if (!inv) return "not-open" as const;
    const outstanding = decimalToPaise(inv.total) - decimalToPaise(inv.received) - decimalToPaise(inv.tds);
    let settled = r.amount;
    let fx = 0n;
    if (inv.currency !== "INR") {
      if (!r.fxSettled || r.fxSettled <= 0n) return "needs-fx" as const;
      const fxLeft = decimalToPaise(inv.fx_total ?? "0") - decimalToPaise(inv.fx_settled);
      if (r.fxSettled > fxLeft) return "too-much" as const;
      const rate = BigInt(Math.round(Number(inv.fx_rate) * 1_000_000));
      // The last payment clears exactly what is left, so no stray paise remain.
      settled = r.fxSettled === fxLeft ? outstanding - r.tds : toInr(r.fxSettled, rate);
      fx = r.fxSettled;
    }
    if (settled < 0n || settled + r.tds > outstanding) return "too-much" as const;
    const gain = r.amount - settled;
    const journal = await postByCodes(db, {
      entityId: inv.entity_id, date: r.date, by: r.by, memo: `Receipt against ${inv.number}`, sourceType: "invoice_receipt", sourceId: id,
      lines: [
        { code: r.bankCode ?? "1010", debit: r.amount, credit: 0n }, { code: "1500", debit: r.tds, credit: 0n },
        { code: "1100", debit: 0n, credit: settled + r.tds },
        { code: "4910", debit: 0n, credit: gain > 0n ? gain : 0n }, { code: "5910", debit: gain < 0n ? -gain : 0n, credit: 0n },
      ],
    });
    await db.query(
      `insert into invoice_receipts (invoice_id, receipt_date, amount, tds, journal_entry_id, created_by, fx_amount, fx_gain)
       values ($1, $2::date, $3, $4, $5, $6, $7::numeric, $8)`,
      [id, r.date, paiseToDecimal(r.amount), paiseToDecimal(r.tds), journal, r.by, fx ? paiseToDecimal(fx) : null, paiseToDecimal(gain)],
    );
    const done = settled + r.tds === outstanding;
    await db.query(
      `update invoices set received = received + $2, tds = tds + $3, fx_settled = fx_settled + $5,
              status = case when $4 then 'paid' else status end where id = $1`,
      [id, paiseToDecimal(settled), paiseToDecimal(r.tds), done, paiseToDecimal(fx)],
    );
    return "ok" as const;
  });
}

/** Cancels an issued invoice with nothing received by posting its mirror image. */
export async function cancelInvoice(id: string, date: string, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const inv = (await db.query<{ entity_id: string; number: string; income_code: string; subtotal: string; cgst: string; sgst: string; igst: string; total: string }>(
      `select entity_id, number, income_code, subtotal::text, cgst::text, sgst::text, igst::text, total::text from invoices
        where id = $1 and status = 'issued' and received = 0 and tds = 0 and source_type = 'manual' for update`,
      [id],
    ))[0];
    if (!inv) return false;
    const [sub, cgst, sgst, igst, total] = [inv.subtotal, inv.cgst, inv.sgst, inv.igst, inv.total].map(decimalToPaise);
    const journal = await postByCodes(db, {
      entityId: inv.entity_id, date, by, memo: `Cancelled invoice ${inv.number}`, sourceType: "invoice_cancel", sourceId: id,
      lines: [
        { code: inv.income_code, debit: sub, credit: 0n }, { code: "2110", debit: cgst, credit: 0n },
        { code: "2120", debit: sgst, credit: 0n }, { code: "2130", debit: igst, credit: 0n }, { code: "1100", debit: 0n, credit: total },
      ],
    });
    await db.query("update invoices set status = 'cancelled', cancel_journal_id = $2 where id = $1", [id, journal]);
    return true;
  });
}

/**
 * Settles a Business House fee invoice between our own entities in one step: the venture's company
 * pays its payable from the bank, and Boring PE receives it against the receivable.
 */
export async function settleIntercompany(id: string, date: string, by: string): Promise<boolean> {
  const sql = await getSql();
  return sql.tx(async (db) => {
    const inv = (await db.query<{ entity_id: string; number: string; total: string; received: string; tds: string; buyer: string | null }>(
      `select i.entity_id, i.number, i.total::text, i.received::text, i.tds::text, p.entity_id as buyer
         from invoices i join parties p on p.id = i.party_id where i.id = $1 and i.status = 'issued' for update of i`,
      [id],
    ))[0];
    if (!inv?.buyer) return false;
    const due = decimalToPaise(inv.total) - decimalToPaise(inv.received) - decimalToPaise(inv.tds);
    if (due <= 0n) return false;
    await postByCodes(db, {
      entityId: inv.buyer, date, by, memo: `Paid ${inv.number} to Boring PE`, sourceType: "intercompany", sourceId: id,
      lines: [{ code: "2010", debit: due, credit: 0n }, { code: "1010", debit: 0n, credit: due }],
    });
    const journal = await postByCodes(db, {
      entityId: inv.entity_id, date, by, memo: `Received ${inv.number}`, sourceType: "invoice_receipt", sourceId: id,
      lines: [{ code: "1010", debit: due, credit: 0n }, { code: "1100", debit: 0n, credit: due }],
    });
    await db.query(
      "insert into invoice_receipts (invoice_id, receipt_date, amount, tds, journal_entry_id, created_by) values ($1, $2::date, $3, 0, $4, $5)",
      [id, date, paiseToDecimal(due), journal, by],
    );
    await db.query("update invoices set received = received + $2, status = 'paid' where id = $1", [id, paiseToDecimal(due)]);
    return true;
  });
}

/** The party standing for one of our own entities, created the first time it is billed. */
export async function partyForEntity(db: Sql, entityId: string, by: string): Promise<string> {
  const found = (await db.query<{ id: string }>("select id from parties where entity_id = $1", [entityId]))[0];
  if (found) return found.id;
  const e = (await db.query<{ name: string; gstin: string | null; state_code: string | null; address: string }>(
    "select name, gstin, state_code, address from entities where id = $1",
    [entityId],
  ))[0];
  const row = (await db.query<{ id: string }>(
    `insert into parties (name, kind, gstin, state_code, address, entity_id, created_by) values ($1, 'company', $2, $3, $4, $5, $6) returning id`,
    [e.name, e.gstin, e.state_code, e.address, entityId, by],
  ))[0];
  return row.id;
}

// ---- reports

export async function receivables(today: string) {
  const sql = await getSql();
  const rows = await sql.query<{ party_name: string; entity_name: string; due_date: string; outstanding: string }>(
    `select p.name as party_name, e.name as entity_name, i.due_date::text, (i.total - i.received - i.tds)::text as outstanding
       from invoices i join parties p on p.id = i.party_id join entities e on e.id = i.entity_id
      where i.status = 'issued' and i.total - i.received - i.tds > 0`,
  );
  const byParty = new Map<string, { party: string; entity: string; buckets: bigint[]; total: bigint }>();
  for (const r of rows) {
    const key = `${r.entity_name}|${r.party_name}`;
    const cur = byParty.get(key) ?? { party: r.party_name, entity: r.entity_name, buckets: [0n, 0n, 0n, 0n, 0n], total: 0n };
    const amt = decimalToPaise(r.outstanding);
    cur.buckets[ageingBucket(r.due_date, today)] += amt;
    cur.total += amt;
    byParty.set(key, cur);
  }
  return [...byParty.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
}

/** Monthly GST summary for one entity: outward supplies by rate, B2B and B2C, output tax, input credit. */
export async function gstSummary(entityId: string, from: string, to: string) {
  const sql = await getSql();
  const byRate = await sql.query<{ gst_bps: number; taxable: string; tax: string }>(
    `select l.gst_bps, sum(l.amount)::text as taxable, sum(l.tax)::text as tax
       from invoice_lines l join invoices i on i.id = l.invoice_id
      where i.entity_id = $1 and i.status in ('issued', 'paid') and i.issue_date between $2::date and $3::date
      group by l.gst_bps order by l.gst_bps`,
    [entityId, from, to],
  );
  const totals = (await sql.query<{ cgst: string; sgst: string; igst: string; b2b: string; b2c: string; n: number }>(
    `select coalesce(sum(i.cgst), 0)::text as cgst, coalesce(sum(i.sgst), 0)::text as sgst, coalesce(sum(i.igst), 0)::text as igst,
            coalesce(sum(i.subtotal) filter (where p.gstin is not null), 0)::text as b2b,
            coalesce(sum(i.subtotal) filter (where p.gstin is null), 0)::text as b2c, count(*)::int as n
       from invoices i join parties p on p.id = i.party_id
      where i.entity_id = $1 and i.status in ('issued', 'paid') and i.issue_date between $2::date and $3::date`,
    [entityId, from, to],
  ))[0];
  const b2b = await sql.query<{ number: string; issue_date: string; party: string; gstin: string; place: string; taxable: string; tax: string }>(
    `select i.number, i.issue_date::text, p.name as party, p.gstin, i.place_of_supply as place, i.subtotal::text as taxable,
            (i.cgst + i.sgst + i.igst)::text as tax
       from invoices i join parties p on p.id = i.party_id
      where i.entity_id = $1 and i.status in ('issued', 'paid') and p.gstin is not null and i.issue_date between $2::date and $3::date
      order by i.issue_date, i.number`,
    [entityId, from, to],
  );
  const input = (await sql.query<{ amount: string }>(
    `select coalesce(sum(l.debit - l.credit), 0)::text as amount
       from journal_lines l join journal_entries e on e.id = l.entry_id join ledger_accounts a on a.id = l.account_id
      where a.entity_id = $1 and a.code = '1400' and e.entry_date between $2::date and $3::date`,
    [entityId, from, to],
  ))[0];
  const output = decimalToPaise(totals.cgst) + decimalToPaise(totals.sgst) + decimalToPaise(totals.igst);
  const inputCredit = decimalToPaise(input.amount);
  return {
    count: totals.n,
    byRate: byRate.map((r) => ({ rate: r.gst_bps, taxable: decimalToPaise(r.taxable), tax: decimalToPaise(r.tax) })),
    cgst: decimalToPaise(totals.cgst), sgst: decimalToPaise(totals.sgst), igst: decimalToPaise(totals.igst),
    b2bValue: decimalToPaise(totals.b2b), b2cValue: decimalToPaise(totals.b2c),
    b2b, output, inputCredit, netPayable: output - inputCredit,
  };
}
