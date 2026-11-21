import assert from "node:assert/strict";
import { test } from "node:test";
import { ageingBucket, invoiceNumber, invoiceTotals, lineAmount, parseQty, validGstin } from "../src/lib/invoice-calc.ts";

test("GSTIN format and check character", () => {
  assert.equal(validGstin("27AAPFU0939F1ZV"), true);
  assert.equal(validGstin("27aapfu0939f1zv"), true);
  assert.equal(validGstin("27AAPFU0939F1ZW"), false, "wrong check character");
  assert.equal(validGstin("99AAPFU0939F1ZV"), false, "unknown state");
  assert.equal(validGstin("27AAPFU0939F1Z"), false);
});

test("quantities and line amounts", () => {
  assert.equal(parseQty("2.5"), 2500n);
  assert.equal(parseQty(""), 1000n);
  assert.equal(parseQty("0"), null);
  assert.equal(lineAmount(2500n, 1_000_00n), 2_500_00n);
  assert.equal(lineAmount(1333n, 1n), 1n); // 1.333 paise rounds to 1
});

test("within a state: CGST and SGST halves; across states: IGST", () => {
  const lines = [{ qtyMilli: 1000n, rate: 1_00_000_00n, gstBps: 1800 }, { qtyMilli: 2000n, rate: 333n, gstBps: 500 }];
  const intra = invoiceTotals(lines, true);
  assert.equal(intra.subtotal, 1_00_006_66n);
  assert.equal(intra.tax, 18_000_00n + 33n);
  assert.equal(intra.cgst + intra.sgst, intra.tax);
  assert.equal(intra.cgst - intra.sgst, 1n, "the odd paisa goes to CGST");
  const inter = invoiceTotals(lines, false);
  assert.equal(inter.igst, inter.tax);
  assert.equal(inter.cgst + inter.sgst, 0n);
  assert.equal(inter.total, inter.subtotal + inter.tax);
});

test("invoice numbers follow the financial year", () => {
  assert.equal(invoiceNumber("INV", "2026-11-21", 7), "INV/2026-27/0007");
  assert.equal(invoiceNumber("BP", "2027-02-01", 12), "BP/2026-27/0012");
  assert.equal(invoiceNumber("BP", "2027-04-01", 1), "BP/2027-28/0001");
});

test("ageing buckets", () => {
  assert.equal(ageingBucket("2026-11-30", "2026-11-21"), 0);
  assert.equal(ageingBucket("2026-11-01", "2026-11-21"), 1);
  assert.equal(ageingBucket("2026-09-01", "2026-11-21"), 3);
  assert.equal(ageingBucket("2026-01-01", "2026-11-21"), 4);
});
