import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canVerify, caseStatus, checkAadhaar, checkCin, checkGstin, checkIfsc, checkPan, checkUdyam, maskAccount, nameScore, panFits,
  reKycDate, requiredChecks, riskOf, verhoeffOk,
} from "../src/lib/kyc-calc.ts";

test("PAN: format and holder type", () => {
  assert.deepEqual(checkPan("abcpe1234f"), { ok: true, value: "ABCPE1234F", holder: "Individual" });
  assert.equal(checkPan("ABCXE1234F").ok, false, "X is not a holder type");
  assert.equal(checkPan("ABCP1234F").ok, false);
  assert.ok(panFits("AAACB1234C", "entity") && !panFits("AAACB1234C", "person"));
});

test("Aadhaar: Verhoeff check digit, and only the last four digits survive", () => {
  assert.ok(verhoeffOk("2363"), "a known Verhoeff example");
  const good = checkAadhaar("4999 9999 9990");
  const fixed = [...Array(10).keys()].map((d) => `49999999999${d}`).find((n) => verhoeffOk(n))!;
  assert.equal(checkAadhaar(fixed).ok, true);
  assert.equal(checkAadhaar(fixed).masked, `XXXX XXXX ${fixed.slice(-4)}`);
  assert.equal(good.masked.startsWith("XXXX XXXX"), true);
  assert.equal(checkAadhaar("123456789012").ok, false, "cannot start with 1");
});

test("GSTIN checksum, and the PAN inside it", () => {
  // Build a valid one by trying every check character.
  const base = "27AAPFU0939F1Z";
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const good = [...chars].map((c) => base + c).filter((g) => checkGstin(g).ok);
  assert.equal(good.length, 1, "exactly one check character fits");
  assert.equal(checkGstin(good[0]).pan, "AAPFU0939F");
  assert.equal(checkGstin("99AAPFU0939F1Z5").ok, false, "unknown state code");
});

test("CIN, LLPIN, IFSC, Udyam and account masking", () => {
  assert.deepEqual(checkCin("U72900MH2020PTC123456"), { ok: true, value: "U72900MH2020PTC123456", kind: "company", listed: false, year: 2020 });
  assert.equal(checkCin("aab-1234").kind, "llp");
  assert.equal(checkCin("U72900MH20PTC1").ok, false);
  assert.ok(checkIfsc("hdfc0001234").ok && !checkIfsc("HDFC1001234").ok);
  assert.ok(checkUdyam("UDYAM-MH-26-0012345").ok);
  assert.equal(maskAccount("50100123456789"), "XXXXXXXX6789");
});

test("what a case needs, and where it stands", () => {
  assert.deepEqual(requiredChecks("person"), ["pan", "aadhaar"]);
  assert.deepEqual(requiredChecks("entity", { gstRegistered: true }), ["pan", "cin", "gstin", "owners"]);
  const req = requiredChecks("person");
  assert.equal(caseStatus("requested", req, []), "requested");
  assert.equal(caseStatus("requested", req, [{ kind: "pan", status: "pass" }]), "in_progress");
  assert.equal(caseStatus("in_progress", req, [{ kind: "pan", status: "pass" }, { kind: "aadhaar", status: "review" }]), "review");
  assert.equal(caseStatus("verified", req, []), "verified", "a decision stands");
  assert.deepEqual(canVerify(req, [{ kind: "pan", status: "pass" }]), { ok: false, missing: ["aadhaar"] });
  assert.equal(canVerify(req, [{ kind: "pan", status: "pass" }, { kind: "aadhaar", status: "pass" }, { kind: "bank", status: "fail" }]).ok, false, "any failed check blocks");
});

test("risk and re-KYC dates", () => {
  assert.equal(riskOf({}), "low");
  assert.equal(riskOf({ foreign: true }), "medium");
  assert.equal(riskOf({ foreign: true, cashHeavy: true }), "high");
  assert.equal(riskOf({ pep: true }), "high");
  assert.equal(reKycDate("2026-11-22", "high"), "2028-11-22");
  assert.equal(reKycDate("2026-11-22", "low"), "2036-11-22");
});

test("name matching tolerates initials, case and titles", () => {
  assert.equal(nameScore("Rahul S Mane", "RAHUL SURESH MANE"), 100);
  assert.equal(nameScore("Mr. Rahul Mane", "Rahul Mane"), 100);
  assert.equal(nameScore("Acme Foods Pvt Ltd", "ACME FOODS PRIVATE LIMITED"), 100);
  assert.ok(nameScore("Rahul Mane", "Rohan Mehta") < 50);
});
