import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CHART, balanceSheet, paiseToDecimal, parsePaise, profitAndLoss, rupees, trialBalance, validateJournal,
  type BalanceRow,
} from "../src/lib/accounting.ts";

test("amounts parse exactly, with Indian commas, and reject nonsense", () => {
  assert.equal(parsePaise("1,50,000.50"), 15_000_050n);
  assert.equal(parsePaise("0.1"), 10n);
  assert.equal(parsePaise(""), 0n);
  for (const bad of ["abc", "-1", "1.234", "1e5", "9999999999999999"]) assert.equal(parsePaise(bad), null, bad);
  assert.equal(paiseToDecimal(15_050n), "150.50");
  assert.equal(paiseToDecimal(5n), "0.05");
  assert.match(rupees(150_000_000n), /15,00,000/);
});

test("the default chart has unique codes and every type", () => {
  assert.equal(new Set(DEFAULT_CHART.map((a) => a.code)).size, DEFAULT_CHART.length);
  for (const t of ["asset", "liability", "equity", "income", "expense"]) {
    assert.ok(DEFAULT_CHART.some((a) => a.type === t), t);
  }
});

test("a balanced entry validates; blank rows are skipped", () => {
  const { lines, errors } = validateJournal([
    { accountId: "a", debit: "1,000", credit: "" },
    { accountId: "b", debit: "", credit: "1000.00" },
    { accountId: "", debit: "", credit: "" },
  ]);
  assert.deepEqual(errors, []);
  assert.equal(lines.length, 2);
});

test("unbalanced, one-sided, both-sided and unknown-account entries are refused", () => {
  const e = (rows: Parameters<typeof validateJournal>[0]) => validateJournal(rows).errors.join(" | ");
  assert.match(e([{ accountId: "a", debit: "100", credit: "" }, { accountId: "b", debit: "", credit: "99" }]), /must be equal/);
  assert.match(e([{ accountId: "a", debit: "100", credit: "" }]), /at least two/);
  assert.match(e([{ accountId: "a", debit: "5", credit: "5" }, { accountId: "b", debit: "", credit: "5" }]), /not both/);
  assert.match(e([{ accountId: "", debit: "5", credit: "" }, { accountId: "b", debit: "", credit: "5" }]), /choose an account/);
  assert.match(e([{ accountId: "a", debit: "x", credit: "" }, { accountId: "b", debit: "", credit: "5" }]), /not valid/);
  assert.match(e([{ accountId: "a", debit: "0", credit: "" }, { accountId: "b", debit: "", credit: "5" }]), /enter an amount/);
});

const row = (id: string, type: BalanceRow["type"], debit: bigint, credit: bigint): BalanceRow => ({
  id, code: id, name: id, type, debit, credit,
});
// Capital 1,00,000 in; fee income 30,000 received; rent 10,000 paid.
const rows: BalanceRow[] = [
  row("bank", "asset", 13_000_000n, 1_000_000n),
  row("capital", "equity", 0n, 10_000_000n),
  row("fees", "income", 0n, 3_000_000n),
  row("rent", "expense", 1_000_000n, 0n),
];

test("trial balance balances and puts each account on its own side", () => {
  const tb = trialBalance(rows);
  assert.equal(tb.balanced, true);
  assert.equal(tb.debit, 13_000_000n);
  assert.equal(tb.lines.find((l) => l.id === "capital")?.credit, 10_000_000n);
});

test("profit and loss and the balance sheet agree", () => {
  const pl = profitAndLoss(rows);
  assert.equal(pl.income.total, 3_000_000n);
  assert.equal(pl.expense.total, 1_000_000n);
  assert.equal(pl.net, 2_000_000n);
  const bs = balanceSheet(rows);
  assert.equal(bs.assets.total, 12_000_000n);
  assert.equal(bs.earnings, 2_000_000n);
  assert.equal(bs.balanced, true);
});
