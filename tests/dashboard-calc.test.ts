import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, bucketKeys, bucketSpan, parsePeriod, pctChange, periodRange, rangeLabel, todayIST } from "../src/lib/dashboard-calc.ts";

test("periods default to the financial year and refuse anything unknown", () => {
  assert.equal(parsePeriod(undefined), "fy");
  assert.equal(parsePeriod("'; drop table"), "fy");
  assert.equal(parsePeriod("12m"), "12m");
});

test("months add without running past a short month", () => {
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2024-03-31", -1), "2024-02-29");
  assert.equal(addMonths("2026-01-15", -12), "2025-01-15");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
});

test("this financial year runs from 1 April to today, against the same days last year", () => {
  const r = periodRange("fy", "2026-11-25");
  assert.deepEqual([r.from, r.to, r.prevFrom, r.prevTo, r.bucket], ["2026-04-01", "2026-11-25", "2025-04-01", "2025-11-25", "month"]);
  const jan = periodRange("fy", "2027-01-10");
  assert.equal(jan.from, "2026-04-01");
});

test("a month so far is compared with the same days of the month before, by day", () => {
  const r = periodRange("month", "2026-03-31");
  assert.deepEqual([r.from, r.to, r.prevFrom, r.prevTo, r.bucket], ["2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28", "day"]);
  const mid = periodRange("month", "2026-11-25");
  assert.deepEqual([mid.prevFrom, mid.prevTo], ["2026-10-01", "2026-10-25"]);
});

test("last month and last financial year are whole, against the one before", () => {
  const m = periodRange("last_month", "2026-03-10");
  assert.deepEqual([m.from, m.to, m.prevFrom, m.prevTo], ["2026-02-01", "2026-02-28", "2026-01-01", "2026-01-31"]);
  const y = periodRange("last_fy", "2026-11-25");
  assert.deepEqual([y.from, y.to, y.prevFrom, y.prevTo], ["2025-04-01", "2026-03-31", "2024-04-01", "2025-03-31"]);
});

test("financial quarters start in April, July, October and January", () => {
  assert.equal(periodRange("quarter", "2026-05-20").from, "2026-04-01");
  assert.equal(periodRange("quarter", "2026-09-30").from, "2026-07-01");
  assert.equal(periodRange("quarter", "2026-11-25").from, "2026-10-01");
  const q4 = periodRange("quarter", "2027-02-14");
  assert.deepEqual([q4.from, q4.prevFrom, q4.prevTo], ["2027-01-01", "2026-10-01", "2026-11-14"]);
});

test("the last 12 months are whole months ending with this one", () => {
  const r = periodRange("12m", "2026-11-25");
  assert.deepEqual([r.from, r.to, r.prevFrom, r.prevTo], ["2025-12-01", "2026-11-30", "2024-12-01", "2025-11-30"]);
  assert.equal(bucketKeys(r.from, r.to, "month").length, 12);
});

test("buckets cover the range by day or month, and a month's span stays inside it", () => {
  assert.deepEqual(bucketKeys("2026-04-01", "2026-06-10", "month"), ["2026-04", "2026-05", "2026-06"]);
  assert.equal(bucketKeys("2026-02-01", "2026-02-28", "day").length, 28);
  assert.deepEqual(bucketSpan("2026-06", "2026-04-01", "2026-06-10"), ["2026-06-01", "2026-06-10"]);
  assert.deepEqual(bucketSpan("2026-06-03", "2026-06-01", "2026-06-30"), ["2026-06-03", "2026-06-03"]);
});

test("change is measured against the earlier figure, and is null with nothing to compare", () => {
  assert.equal(pctChange(150n, 100n), 50);
  assert.equal(pctChange(50n, 100n), -50);
  assert.equal(pctChange(100n, 0n), null);
  assert.equal(pctChange(-50n, -100n), 50, "a smaller loss is an improvement");
});

test("today is India's date, and ranges read in Indian order", () => {
  assert.equal(todayIST(new Date("2026-11-25T20:00:00Z")), "2026-11-26");
  assert.equal(rangeLabel("2026-04-01", "2026-11-25"), "1 Apr – 25 Nov 2026");
  assert.equal(rangeLabel("2025-12-01", "2026-11-30"), "1 Dec 2025 – 30 Nov 2026");
});
