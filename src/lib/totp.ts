// Time-based one-time passwords (RFC 6238, as used by Google Authenticator, Microsoft Authenticator,
// 1Password and others) and recovery codes. Only node:crypto, so tests load it directly.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

/** The code for one 30-second step. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

export const step = (ms: number) => Math.floor(ms / 1000 / 30);

/**
 * Checks a code against the current step and one either side (clock drift). Returns the step it
 * matched, so the caller can refuse the same code twice; null when it does not match.
 */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastStep: number | null = null): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const secret = base32Decode(secretB32);
  const now = step(nowMs);
  for (const s of [now, now - 1, now + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    const want = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(want, Buffer.from(c))) return s;
  }
  return null;
}

export function otpauthUrl(secretB32: string, account: string, issuer = "Boring PE") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Ten single-use recovery codes like 7KQ2-M9XD, and their hashes for storage. */
export function recoveryCodes(n = 10) {
  const codes = Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecovery) };
}
export const hashRecovery = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
