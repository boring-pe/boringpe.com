// Encrypted backup file format, shared by the portal (writing) and scripts/restore-backup.mjs (reading).
//   "BPBAK1" | salt (16) | iv (12) | tag (16) | AES-256-GCM( gzip( JSON ) )
// The key is scrypt(passphrase, salt). Only node built-ins, so tests load it directly.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("BPBAK1");
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type BackupDoc = { format: 1; created_at: string; tables: Record<string, unknown[]> };

export function encryptBackup(doc: BackupDoc, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(doc)))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(file: Buffer, passphrase: string): BackupDoc {
  if (!file.subarray(0, 6).equals(MAGIC)) throw new Error("Not a Boring Portal backup.");
  const salt = file.subarray(6, 22), iv = file.subarray(22, 34), tag = file.subarray(34, 50);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return JSON.parse(gunzipSync(Buffer.concat([decipher.update(file.subarray(50)), decipher.final()])).toString("utf8"));
  } catch {
    throw new Error("Wrong passphrase, or the file is damaged.");
  }
}

/** A passphrase strong enough to protect everything: at least 12 characters and not all one kind. */
export function passphraseProblem(p: string): string | null {
  if (p.length < 12) return "Use at least 12 characters.";
  if (/^(.)\1+$/.test(p) || /^\d+$/.test(p)) return "Use a mix of words, letters or symbols.";
  return null;
}
