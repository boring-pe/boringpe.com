import assert from "node:assert/strict";
import { test } from "node:test";
import { barPercent, consolidate, csvCell, fillMonths, monthsBetween } from "../src/lib/mis-calc.ts";
import { MAX_DOC_BYTES, mimeFor, safeFileName } from "../src/lib/vault-fields.ts";

test("file types come from the extension; unknown types are refused", () => {
  assert.equal(mimeFor("Term Sheet.PDF"), "application/pdf");
  assert.equal(mimeFor("model.xlsx")?.includes("spreadsheet"), true);
  for (const bad of ["evil.html", "x.svg", "run.exe", "noext"]) assert.equal(mimeFor(bad), null, bad);
  assert.equal(MAX_DOC_BYTES, 4194304);
});

test("download names are made safe", () => {
  assert.equal(safeFileName("../../etc/passwd"), "passwd");
  assert.equal(safeFileName('a"b;c.pdf'), "a_b_c.pdf");
  assert.equal(safeFileName("..."), "file");
});

test("consolidation removes fees between our own entities", () => {
  const c = consolidate(
    [
      { income: 5_000_00n, expense: 1_000_00n, cash: 10n, assets: 100n, liabilities: 40n }, // Boring PE: fee income
      { income: 1_00_000_00n, expense: 85_000_00n, cash: 20n, assets: 200n, liabilities: 60n }, // SPV: fee expense inside
    ],
    5_000_00n,
  );
  assert.equal(c.income, 1_00_000_00n);
  assert.equal(c.expense, 81_000_00n);
  assert.equal(c.net, 19_000_00n);
  assert.equal(c.cash, 30n);
});

test("months and gaps", () => {
  assert.deepEqual(monthsBetween("2026-11-15", "2027-02-01"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  const filled = fillMonths(["2026-11", "2026-12"], [{ month: "2026-12", v: 5 }], (month) => ({ month, v: 0 }));
  assert.deepEqual(filled.map((r) => r.v), [0, 5]);
});

test("bars and CSV cells", () => {
  assert.equal(barPercent(50n, 100n), 50);
  assert.equal(barPercent(1n, 1000n), 2);
  assert.equal(barPercent(0n, 100n), 0);
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("-1500.50"), "-1500.50");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});
