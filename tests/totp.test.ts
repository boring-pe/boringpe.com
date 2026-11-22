import assert from "node:assert/strict";
import { test } from "node:test";
import { base32Decode, base32Encode, hashRecovery, hotp, otpauthUrl, recoveryCodes, verifyTotp } from "../src/lib/totp.ts";

const RFC_SECRET = Buffer.from("12345678901234567890");

test("RFC 6238 test vectors (SHA-1, 8 digits)", () => {
  assert.equal(hotp(RFC_SECRET, Math.floor(59 / 30), 8), "94287082");
  assert.equal(hotp(RFC_SECRET, Math.floor(1111111109 / 30), 8), "07081804");
  assert.equal(hotp(RFC_SECRET, Math.floor(1234567890 / 30), 8), "89005924");
});

test("base32 round trip", () => {
  assert.equal(base32Encode(RFC_SECRET), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"), RFC_SECRET);
});

test("codes are accepted for the current step and one either side, never twice", () => {
  const secret = base32Encode(RFC_SECRET);
  const now = 1_800_000_000_000;
  const s = Math.floor(now / 30000);
  const code = hotp(RFC_SECRET, s);
  assert.equal(verifyTotp(secret, code, now), s);
  assert.equal(verifyTotp(secret, hotp(RFC_SECRET, s - 1), now), s - 1, "30 seconds of clock drift is fine");
  assert.equal(verifyTotp(secret, hotp(RFC_SECRET, s - 3), now), null, "an old code is not");
  assert.equal(verifyTotp(secret, code, now, s), null, "a used code cannot be replayed");
  assert.equal(verifyTotp(secret, "12345", now), null);
});

test("recovery codes and the authenticator link", () => {
  const { codes, hashes } = recoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0], /^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  assert.equal(hashRecovery(codes[0].toLowerCase().replace("-", " ")), hashes[0], "typed loosely still matches");
  assert.match(otpauthUrl("ABC", "r@boringpe.com"), /^otpauth:\/\/totp\/Boring%20PE%3Ar%40boringpe\.com\?secret=ABC&issuer=Boring%20PE/);
});
