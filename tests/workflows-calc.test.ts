import { test } from "node:test";
import assert from "node:assert/strict";
import { dealSteps, isStuck, pathOf, progress, sequence, spendSteps, type DealFacts } from "../src/lib/workflows-calc.ts";

const base: DealFacts = {
  id: "d1", pillar: "enable", stage: "sourcing", pendingStage: null, partyId: "p1", kyc: "none", kycCaseId: null,
  invoicesIssued: 0, invoiceDrafts: 0, outstanding: 0n, receipts: 0, receiptsMatched: 0,
  holdingId: null, invested: false, investMatched: false, ventureId: null, venturePeriods: 0,
};
const states = (f: Partial<DealFacts>) => dealSteps({ ...base, ...f }).map((s) => `${s.id}:${s.state}`).join(" ");

test("each pillar goes its own way after closing", () => {
  assert.equal(pathOf("enable"), "cash");
  assert.equal(pathOf("own"), "holding");
  assert.equal(pathOf("co_build"), "holding");
  assert.equal(pathOf("build"), "venture");
});

test("deal to cash: close, KYC, invoice, paid, bank", () => {
  assert.equal(states({}), "win:current kyc:todo invoice:todo paid:todo bank:todo");
  assert.equal(states({ stage: "closed", kyc: "open" }), "win:done kyc:current invoice:todo paid:todo bank:todo");
  assert.equal(states({ stage: "closed", kyc: "verified", invoicesIssued: 1, outstanding: 5000n }), "win:done kyc:done invoice:done paid:current bank:todo");
  assert.equal(states({ stage: "closed", kyc: "verified", invoicesIssued: 1, receipts: 2, receiptsMatched: 1 }), "win:done kyc:done invoice:done paid:done bank:current");
  assert.equal(states({ stage: "closed", kyc: "verified", invoicesIssued: 1, receipts: 2, receiptsMatched: 2 }), "win:done kyc:done invoice:done paid:done bank:done");
});

test("work done out of order stays done, and the first gap is what is next", () => {
  assert.equal(states({ stage: "closed", invoicesIssued: 1, outstanding: 100n }), "win:done kyc:current invoice:done paid:todo bank:todo");
});

test("a passed deal or a rejected KYC stops the rest", () => {
  assert.equal(states({ stage: "passed" }), "win:stopped kyc:stopped invoice:stopped paid:stopped bank:stopped");
  assert.equal(states({ stage: "closed", kyc: "rejected" }), "win:done kyc:stopped invoice:stopped paid:stopped bank:stopped");
});

test("the next action is a real link: raise an invoice for this deal, or record its holding", () => {
  const inv = dealSteps({ ...base, stage: "closed", kyc: "verified" }).find((s) => s.id === "invoice")!;
  assert.equal(inv.action?.href, "/portal/invoices?view=new&deal=d1");
  const hold = dealSteps({ ...base, pillar: "own", stage: "closed", kyc: "verified" }).find((s) => s.id === "holding")!;
  assert.equal(hold.state, "current");
  assert.match(hold.action!.href, /^\/portal\/portfolio\?deal=d1/);
  const noParty = dealSteps({ ...base, partyId: null }).find((s) => s.id === "kyc")!;
  assert.match(noParty.detail, /Link a contact/);
});

test("deal to holding and deal to venture", () => {
  assert.equal(states({ pillar: "co_build", stage: "closed", kyc: "verified", holdingId: "h", invested: true }), "win:done kyc:done holding:done invest:done bank:current");
  assert.equal(states({ pillar: "build", stage: "closed", kyc: "verified", ventureId: "v" }), "win:done kyc:done venture:done period:current");
});

test("progress counts what is done", () => {
  assert.deepEqual(progress(sequence([{ id: "a", label: "", detail: "" }, { id: "b", label: "", detail: "" }], [true, false])), { done: 1, total: 2, stopped: false });
});

test("a payment goes request, approval, books, bank; a rejected one stops", () => {
  const s = (f: Parameters<typeof spendSteps>[0]) => spendSteps(f).map((x) => x.state).join(" ");
  assert.equal(s({ direction: "out", status: "awaiting_approval", posted: false, matched: false, ageDays: 0 }), "done current todo todo");
  assert.equal(s({ direction: "out", status: "approved", posted: true, matched: false, ageDays: 3 }), "done done done current");
  assert.equal(s({ direction: "out", status: "rejected", posted: false, matched: false, ageDays: 3 }), "done stopped stopped stopped");
  assert.equal(s({ direction: "in", status: "recorded", posted: true, matched: true, ageDays: 3 }), "done done done");
});

test("posted money missing from the bank for a week is stuck", () => {
  assert.ok(isStuck({ direction: "out", status: "approved", posted: true, matched: false, ageDays: 7 }));
  assert.ok(!isStuck({ direction: "out", status: "approved", posted: true, matched: false, ageDays: 6 }));
  assert.ok(!isStuck({ direction: "out", status: "approved", posted: true, matched: true, ageDays: 30 }));
  assert.ok(!isStuck({ direction: "out", status: "awaiting_approval", posted: false, matched: false, ageDays: 30 }));
});
