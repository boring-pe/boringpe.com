import { createHmac } from "node:crypto";
import { getSql } from "./db";
import { LIMITS, retryAfter, windowStart, type Bucket } from "./security-calc";
import { audit } from "./users";

/** A keyed hash of the bucket and key, so the table never holds an address or an email. */
function hashKey(bucket: Bucket, key: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET || "development-only").update(`${bucket}:${key.toLowerCase()}`).digest("hex").slice(0, 40);
}

export type Verdict = { ok: boolean; hits: number; limit: number; retryAfter: number };

/** Counts one hit. Not ok once the window's limit is passed; the first hit over it is logged. */
export async function hit(bucket: Bucket, key: string, label?: string): Promise<Verdict> {
  const { limit, window } = LIMITS[bucket];
  const now = Date.now();
  const sql = await getSql();
  const [row] = await sql.query<{ hits: number }>(
    `insert into rate_limits (bucket, key, window_start, hits, blocked) values ($1, $2, $3, 1, 0)
     on conflict (bucket, key, window_start) do update
       set hits = rate_limits.hits + 1,
           blocked = rate_limits.blocked + case when rate_limits.hits + 1 > $4 then 1 else 0 end
     returning hits`,
    [bucket, hashKey(bucket, key), new Date(windowStart(now, window)), limit],
  );
  const hits = Number(row.hits);
  if (hits === limit + 1) {
    await audit({ actorId: null, actorEmail: null, action: "rate_limited", detail: `${bucket}${label ? `: ${label}` : ""}` });
  }
  // Now and then, clear windows older than a day.
  if (Math.random() < 0.02) await sql.query(`delete from rate_limits where window_start < now() - interval '1 day'`);
  return { ok: hits <= limit, hits, limit, retryAfter: retryAfter(now, window) };
}

/** Whether the key has already used up this window, without counting a hit. */
export async function exhausted(bucket: Bucket, key: string): Promise<boolean> {
  const { limit, window } = LIMITS[bucket];
  const sql = await getSql();
  const [row] = await sql.query<{ hits: number }>(
    `select hits from rate_limits where bucket = $1 and key = $2 and window_start = $3`,
    [bucket, hashKey(bucket, key), new Date(windowStart(Date.now(), window))],
  );
  return !!row && Number(row.hits) >= limit;
}

/** A 429 response with Retry-After. */
export function tooMany(v: Verdict, json = true): Response {
  const body = json ? JSON.stringify({ error: "rate_limited", message: `Too many requests. Try again in ${v.retryAfter} seconds.` }) : "Too many requests. Try again later.";
  return new Response(body, {
    status: 429,
    headers: { "Content-Type": json ? "application/json" : "text/plain; charset=utf-8", "Retry-After": String(v.retryAfter), "Cache-Control": "no-store" },
  });
}

/** Requests blocked in the last day, by bucket. */
export async function blockedLastDay(): Promise<{ bucket: string; blocked: number; keys: number }[]> {
  const sql = await getSql();
  const rows = await sql.query<{ bucket: string; blocked: string; keys: string }>(
    `select bucket, sum(blocked)::text as blocked, count(distinct key) filter (where blocked > 0)::text as keys
       from rate_limits where window_start > now() - interval '1 day' group by bucket having sum(blocked) > 0 order by 2 desc`,
  );
  return rows.map((r) => ({ bucket: r.bucket, blocked: Number(r.blocked), keys: Number(r.keys) }));
}
