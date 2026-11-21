import { randomUUID } from "node:crypto";
import { getSql } from "./db";
import { CAL_ADAPTERS, istToIso, type CalEvent, type NewEvent } from "./calendar-providers";
import { connection, type MailAccount } from "./mail";
import { testMode } from "./test-mode";

export type LinkType = "deal" | "venture" | "party" | "employee";
export const isLinkType = (v: unknown): v is LinkType => v === "deal" || v === "venture" || v === "party" || v === "employee";
export type AgendaItem = CalEvent & { accountId: string; accountEmail: string; link: { type: string; id: string; name: string | null } | null };

/** A person's own calendars: the Google and Microsoft mailboxes they connected (calendars are never shared). */
export async function calendarsFor(userId: string) {
  const sql = await getSql();
  return sql.query<MailAccount>(
    `select a.id, a.user_id, u.email as owner_email, a.provider, a.email, a.shared, a.status, a.last_error
       from mail_accounts a join users u on u.id = a.user_id
      where a.user_id = $1 and a.provider in ('google', 'microsoft'${testMode() ? ", 'mock'" : ""}) order by a.email`,
    [userId],
  );
}

const g = globalThis as typeof globalThis & { __mockCal?: Map<string, CalEvent[]> };
const mockCal = (): Map<string, CalEvent[]> => (g.__mockCal ??= new Map());

/** The next `days` days across this person's calendars, with any record each meeting is linked to. */
export async function agenda(userId: string, days = 14) {
  const accounts = await calendarsFor(userId);
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const fromIso = from.toISOString();
  const toIso = new Date(from.getTime() + days * 86_400_000).toISOString();
  const errors: { email: string; message: string }[] = [];
  const lists = await Promise.all(accounts.map(async (a) => {
    try {
      let events: CalEvent[];
      if (a.provider === "mock") events = (mockCal().get(a.id) ?? []).filter((e) => e.start >= fromIso && e.start < toIso);
      else {
        const { conn } = await connection(a.id);
        events = await CAL_ADAPTERS[a.provider as "google" | "microsoft"].list(fetch, conn.token, fromIso, toIso);
      }
      return events.map((e) => ({ ...e, accountId: a.id, accountEmail: a.email }));
    } catch (err) {
      errors.push({ email: a.email, message: (err as Error).message });
      return [];
    }
  }));
  const items = lists.flat().sort((x, y) => x.start.localeCompare(y.start));
  const sql = await getSql();
  const links = items.length
    ? await sql.query<{ mail_account_id: string; event_id: string; link_type: string | null; link_id: string | null; name: string | null }>(
        `select m.mail_account_id, m.event_id, m.link_type, m.link_id,
                coalesce(d.name, v.name, p.name, e.name) as name
           from meeting_links m
           left join deals d on m.link_type = 'deal' and d.id = m.link_id
           left join ventures v on m.link_type = 'venture' and v.id = m.link_id
           left join parties p on m.link_type = 'party' and p.id = m.link_id
           left join employees e on m.link_type = 'employee' and e.id = m.link_id
          where m.mail_account_id = any($1::text[])`,
        [accounts.map((a) => a.id)],
      )
    : [];
  return {
    accounts, errors,
    items: items.map((i): AgendaItem => {
      const l = links.find((x) => x.mail_account_id === i.accountId && x.event_id === i.id);
      return { ...i, link: l?.link_type && l.link_id ? { type: l.link_type, id: l.link_id, name: l.name } : null };
    }),
  };
}

/** Creates a meeting in one of this person's calendars, inviting the attendees, optionally linked to a record. */
export async function createMeeting(userId: string, accountId: string, e: NewEvent, link: { type: LinkType; id: string } | null) {
  const accounts = await calendarsFor(userId);
  const a = accounts.find((x) => x.id === accountId);
  if (!a) throw new Error("That calendar is not yours.");
  let made: { id: string; webUrl: string | null; joinUrl: string | null };
  if (a.provider === "mock") {
    made = { id: `mock-ev-${randomUUID()}`, webUrl: null, joinUrl: e.online ? "https://meet.example/test" : null };
    const list = mockCal().get(a.id) ?? [];
    list.push({ id: made.id, title: e.title, start: istToIso(e.startLocal), end: istToIso(e.endLocal), allDay: false, location: "", joinUrl: made.joinUrl, webUrl: null, attendees: e.attendees });
    mockCal().set(a.id, list);
  } else {
    const { conn } = await connection(a.id);
    made = await CAL_ADAPTERS[a.provider as "google" | "microsoft"].create(fetch, conn.token, e);
  }
  const sql = await getSql();
  await sql.query(
    `insert into meeting_links (mail_account_id, event_id, title, starts_at, join_url, link_type, link_id, created_by)
     values ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8) on conflict (mail_account_id, event_id) do nothing`,
    [a.id, made.id, e.title, istToIso(e.startLocal), made.joinUrl, link?.type ?? null, link?.id ?? null, userId],
  );
  return made;
}

/** Meetings anyone on the team linked to a record. */
export async function meetingsFor(type: LinkType, id: string) {
  const sql = await getSql();
  return sql.query<{ title: string; starts_at: string; join_url: string | null; owner: string }>(
    `select m.title, m.starts_at::text, m.join_url, u.email as owner from meeting_links m join users u on u.id = m.created_by
      where m.link_type = $1 and m.link_id = $2 order by m.starts_at desc limit 50`,
    [type, id],
  );
}

export async function linkTargets() {
  const sql = await getSql();
  return sql.query<{ type: LinkType; id: string; name: string }>(
    `select 'deal'::text as type, id, name from deals union all select 'venture', id, name from ventures
     union all select 'party', id, name from parties where entity_id is null union all select 'employee', id, name from employees where status = 'active'
     order by 1, 3`,
  );
}
