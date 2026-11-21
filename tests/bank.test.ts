import assert from "node:assert/strict";
import { test } from "node:test";
import { autoMatch, lineKey, parseBankAmount, parseBankDate, parseCsv, readStatement } from "../src/lib/bank-calc.ts";

test("CSV with quotes, commas and blank lines", () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""q"""\r\n\r\n1,2,3'), [["a", "b, c", 'd "q"'], ["1", "2", "3"]]);
});

test("Indian bank dates and amounts", () => {
  assert.equal(parseBankDate("21/11/2026"), "2026-11-21");
  assert.equal(parseBankDate("21-11-26"), "2026-11-21");
  assert.equal(parseBankDate("05-Nov-2026"), "2026-11-05");
  assert.equal(parseBankDate("2026-11-21"), "2026-11-21");
  assert.equal(parseBankDate("31/02/2026"), null);
  assert.equal(parseBankAmount("1,23,456.78"), 12_345_678n);
  assert.equal(parseBankAmount("(500.00)"), -50_000n);
  assert.equal(parseBankAmount("500.00 Dr"), -50_000n);
  assert.equal(parseBankAmount(""), null);
});

test("a debit/credit statement with a preamble", () => {
  const csv = [
    "Boring PE Current Account,,,,,",
    "Statement from 01/11/2026 to 30/11/2026,,,,,",
    "Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    '02/11/2026,"NEFT-ACME SUPPLIES",UTR1,,"1,08,000.00","2,08,000.00"',
    "03/11/2026,BANK CHARGES,,236.00,,207764.00",
    "Opening balance,,,,,",
  ].join("\n");
  const r = readStatement(csv);
  assert.ok("lines" in r);
  assert.equal(r.lines.length, 2);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.lines.map((l) => l.amount), [10_800_000n, -23_600n]);
  assert.equal(r.lines[0].ref, "UTR1");
  assert.equal(r.lines[1].balance, 20_776_400n);
});

test("a signed amount column also works; nonsense is refused", () => {
  const r = readStatement("Txn Date,Description,Amount\n2026-11-02,Fee,-1500\n");
  assert.ok("lines" in r && r.lines[0].amount === -150_000n);
  assert.ok("error" in readStatement("just,some,words\n1,2,3"));
});

test("matching pairs same amounts by nearest date, once, and leaves ties for a person", () => {
  const bank = [
    { id: "b1", date: "2026-11-02", amount: 100n },
    { id: "b2", date: "2026-11-10", amount: 100n },
    { id: "b3", date: "2026-11-05", amount: -50n },
    { id: "b4", date: "2026-11-20", amount: 999n },
  ];
  const book = [
    { id: "k1", date: "2026-11-01", amount: 100n },
    { id: "k2", date: "2026-11-11", amount: 100n },
    { id: "k3", date: "2026-11-04", amount: -50n },
    { id: "k4", date: "2026-11-06", amount: -50n },
  ];
  const m = autoMatch(bank, book);
  assert.deepEqual(m.map((x) => `${x.bankId}-${x.bookId}`).sort(), ["b1-k1", "b2-k2"]);
});

test("the same line twice in one file gets different keys", () => {
  const l = { date: "2026-11-02", amount: 100n, description: "UPI", ref: "", balance: null };
  assert.notEqual(lineKey(l, 0), lineKey(l, 1));
});
