import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateTemporaryPassword,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from "../src/lib/password.ts";

test("a password verifies against its own hash and nothing else", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.ok(hash.startsWith("scrypt$"));
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("correct horse battery stapl", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("hashes are salted", async () => {
  assert.notEqual(await hashPassword("same password here"), await hashPassword("same password here"));
});

test("missing or malformed hashes never verify", async () => {
  assert.equal(await verifyPassword("x", null), false);
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "plaintext"), false);
  assert.equal(await verifyPassword("x", "scrypt$1$2$3"), false);
});

test("password policy", () => {
  assert.ok(passwordProblem("short"));
  assert.ok(passwordProblem("aaaaaaaaaaaaaaaa"));
  assert.ok(passwordProblem("someone@example.com", "someone@example.com"));
  assert.equal(passwordProblem("a long enough passphrase"), null);
});

test("temporary passwords are random, long and unambiguous", () => {
  const a = generateTemporaryPassword();
  const b = generateTemporaryPassword();
  assert.equal(a.length, 16);
  assert.notEqual(a, b);
  assert.ok(!/[0OIl1]/.test(a + b));
});
