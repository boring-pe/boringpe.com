// Calendar adapters for Google Calendar and Microsoft Graph, normalised. `fetch` is passed in for tests.

export type Fetch = typeof fetch;
export type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location: string; joinUrl: string | null; webUrl: string | null; attendees: string[] };
export type NewEvent = { title: string; description: string; startLocal: string; endLocal: string; attendees: string[]; online: boolean };

const TZ_IANA = "Asia/Kolkata";
const TZ_WINDOWS = "India Standard Time";

async function call(f: Fetch, url: string, token: string, init: RequestInit = {}) {
  const res = await f(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** "2026-11-25T15:00" in India time → the same instant in ISO UTC. */
export function istToIso(local: string): string {
  return new Date(`${local.length === 16 ? `${local}:00` : local}+05:30`).toISOString();
}

export const google = {
  async list(f: Fetch, token: string, fromIso: string, toIso: string): Promise<CalEvent[]> {
    const q = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: "true", orderBy: "startTime", maxResults: "100" });
    const r = (await call(f, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, token)) as {
      items?: { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; hangoutLink?: string; htmlLink?: string; attendees?: { email: string }[]; status?: string }[];
    };
    return (r.items ?? []).filter((e) => e.status !== "cancelled").map((e) => ({
      id: e.id, title: e.summary ?? "(no title)", start: e.start.dateTime ?? `${e.start.date}T00:00:00+05:30`, end: e.end.dateTime ?? `${e.end.date}T00:00:00+05:30`,
      allDay: !e.start.dateTime, location: e.location ?? "", joinUrl: e.hangoutLink ?? null, webUrl: e.htmlLink ?? null, attendees: (e.attendees ?? []).map((a) => a.email),
    }));
  },
  async create(f: Fetch, token: string, e: NewEvent): Promise<{ id: string; webUrl: string | null; joinUrl: string | null }> {
    const body = {
      summary: e.title, description: e.description,
      start: { dateTime: `${e.startLocal}:00`.slice(0, 19), timeZone: TZ_IANA }, end: { dateTime: `${e.endLocal}:00`.slice(0, 19), timeZone: TZ_IANA },
      attendees: e.attendees.map((email) => ({ email })),
      ...(e.online ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
    };
    const r = (await call(f, `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all${e.online ? "&conferenceDataVersion=1" : ""}`, token, {
      method: "POST", body: JSON.stringify(body),
    })) as { id: string; htmlLink?: string; hangoutLink?: string };
    return { id: r.id, webUrl: r.htmlLink ?? null, joinUrl: r.hangoutLink ?? null };
  },
};

export const microsoft = {
  async list(f: Fetch, token: string, fromIso: string, toIso: string): Promise<CalEvent[]> {
    const q = new URLSearchParams({ startDateTime: fromIso, endDateTime: toIso, $top: "100", $orderby: "start/dateTime", $select: "id,subject,start,end,isAllDay,location,onlineMeeting,webLink,attendees,isCancelled" });
    const r = (await call(f, `https://graph.microsoft.com/v1.0/me/calendarView?${q}`, token, { headers: { Prefer: 'outlook.timezone="UTC"' } })) as {
      value: { id: string; subject?: string; start: { dateTime: string }; end: { dateTime: string }; isAllDay?: boolean; location?: { displayName?: string }; onlineMeeting?: { joinUrl?: string } | null; webLink?: string; attendees?: { emailAddress?: { address?: string } }[]; isCancelled?: boolean }[];
    };
    const utc = (s: string) => (/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s.slice(0, 19)}Z`);
    return r.value.filter((e) => !e.isCancelled).map((e) => ({
      id: e.id, title: e.subject ?? "(no title)", start: utc(e.start.dateTime), end: utc(e.end.dateTime), allDay: Boolean(e.isAllDay),
      location: e.location?.displayName ?? "", joinUrl: e.onlineMeeting?.joinUrl ?? null, webUrl: e.webLink ?? null,
      attendees: (e.attendees ?? []).map((a) => a.emailAddress?.address ?? "").filter(Boolean),
    }));
  },
  async create(f: Fetch, token: string, e: NewEvent): Promise<{ id: string; webUrl: string | null; joinUrl: string | null }> {
    const body = {
      subject: e.title, body: { contentType: "Text", content: e.description },
      start: { dateTime: `${e.startLocal}:00`.slice(0, 19), timeZone: TZ_WINDOWS }, end: { dateTime: `${e.endLocal}:00`.slice(0, 19), timeZone: TZ_WINDOWS },
      attendees: e.attendees.map((address) => ({ emailAddress: { address }, type: "required" })),
      ...(e.online ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
    };
    const r = (await call(f, "https://graph.microsoft.com/v1.0/me/events", token, { method: "POST", body: JSON.stringify(body) })) as {
      id: string; webLink?: string; onlineMeeting?: { joinUrl?: string } | null;
    };
    return { id: r.id, webUrl: r.webLink ?? null, joinUrl: r.onlineMeeting?.joinUrl ?? null };
  },
};

export const CAL_ADAPTERS = { google, microsoft } as const;
