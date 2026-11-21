import { headers } from "next/headers";

/** The portal's public address: AUTH_URL when set, otherwise the address this request came in on. */
export async function baseUrl() {
  const fromEnv = process.env.AUTH_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}
