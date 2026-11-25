"use server";

import { getSql } from "@/lib/db";

const TOPICS = ["Build", "Co-Build", "Own", "Boring Stack", "Founder advisory", "Impact Marrow", "Something else"] as const;
const TIMES = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

export type ConnectState = { ok: true } | { ok: false; error: string };

export async function submitConnect(_: ConnectState | null, formData: FormData): Promise<ConnectState> {
  if (String(formData.get("website") ?? "").trim() !== "") return { ok: true };

  const name = String(formData.get("name") ?? "").trim();
  const organisation = String(formData.get("organisation") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const topic = String(formData.get("topic") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const whatsapp = formData.get("whatsapp") === "on";

  if (name.length < 2 || name.length > 120) return { ok: false, error: "Enter your name." };
  if (organisation.length < 2 || organisation.length > 200) return { ok: false, error: "Enter your organisation's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: "Enter a valid email." };
  if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) return { ok: false, error: "Enter a phone number." };
  if (!TOPICS.includes(topic as (typeof TOPICS)[number])) return { ok: false, error: "Choose what you want to talk about." };
  if (note.length > 500) return { ok: false, error: "Keep the note under 500 characters." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIMES.includes(time)) return { ok: false, error: "Pick a date and time." };

  const slot = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(slot.getTime()) || slot.getTime() < Date.now() + 60 * 60 * 1000) {
    return { ok: false, error: "That time has already passed. Pick another." };
  }
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(slot);
  if (weekday === "Sat" || weekday === "Sun") return { ok: false, error: "Pick a weekday." };

  const sql = await getSql();
  await sql.query(
    `insert into connect_requests (name, organisation, email, phone, topic, note, slot_at, whatsapp)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [name, organisation, email, phone, topic, note, slot.toISOString(), whatsapp],
  );
  return { ok: true };
}
