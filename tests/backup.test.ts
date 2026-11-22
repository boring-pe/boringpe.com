import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptBackup, encryptBackup, passphraseProblem } from "../src/lib/backup-format.ts";

test("a backup opens only with its passphrase", () => {
  const doc = { format: 1 as const, created_at: "2026-11-22T00:00:00Z", tables: { users: [{ id: "u1", email: "a@b.c" }] } };
  const file = encryptBackup(doc, "correct horse battery");
  assert.ok(!file.toString("latin1").includes("a@b.c"), "nothing readable inside");
  assert.deepEqual(decryptBackup(file, "correct horse battery"), doc);
  assert.throws(() => decryptBackup(file, "wrong passphrase!!"), /Wrong passphrase/);
  const tampered = Buffer.from(file);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered, "correct horse battery"), /damaged/);
});

test("passphrases must be strong", () => {
  assert.ok(passphraseProblem("short"));
  assert.ok(passphraseProblem("111111111111"));
  assert.equal(passphraseProblem("monsoon ledger 2026"), null);
});
