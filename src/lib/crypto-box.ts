import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Seals small JSON secrets with AES-256-GCM. The key comes from INTEGRATIONS_KEY, or AUTH_SECRET when
 * that is not set. Changing the key makes stored secrets unreadable; they then need entering again.
 */
function key(): Buffer {
  const material = process.env.INTEGRATIONS_KEY || process.env.AUTH_SECRET;
  if (!material) throw new Error("Set INTEGRATIONS_KEY (or AUTH_SECRET) to store integration secrets.");
  return createHash("sha256").update(`boring-portal/integrations/v1:${material}`).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function unseal<T = Record<string, string>>(sealed: string | null): T | null {
  if (!sealed?.startsWith("v1.")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
