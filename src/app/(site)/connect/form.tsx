"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitConnect, type ConnectState } from "./actions";

const TIMES = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
const TOPICS = ["Build", "Co-Build", "Own", "Studio", "Impact Marrow", "Something else"];

function weekdays(count: number) {
  const days: { iso: string; weekday: string; day: string }[] = [];
  const cursor = new Date();
  for (let i = 0; days.length < count && i < 30; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(cursor);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(cursor);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(cursor);
    days.push({ iso, weekday, day });
  }
  return days;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
      {pending ? "Sending…" : "Connect with Us"}
    </button>
  );
}

export function ConnectForm() {
  const days = useMemo(() => weekdays(8), []);
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState(days[0]?.iso ?? "");
  const [time, setTime] = useState("");
  const [state, setState] = useState<ConnectState | null>(null);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8">
        <h2 className="text-2xl font-bold text-white">Your time is requested</h2>
        <p className="mt-3 text-slate-400">Boring PE will confirm this conversation. You do not need to do anything else.</p>
      </div>
    );
  }

  return (
    <form
      action={async (data) => setState(await submitConnect(state, data))}
      className="rounded-xl border border-slate-800 bg-slate-900 p-6 sm:p-8"
    >
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />

      {step === 1 ? (
        <div>
          <p className="text-sm font-semibold text-white">1. Pick a date and time</p>
          <p className="mt-1 text-xs text-slate-500">Times in IST, weekdays only.</p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {days.map((day) => (
              <button
                key={day.iso}
                type="button"
                onClick={() => setDate(day.iso)}
                className={`rounded-md border px-2 py-2 text-left ${date === day.iso ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-800 text-slate-300 hover:border-slate-600"}`}
              >
                <span className="block text-[11px] uppercase tracking-wide text-slate-500">{day.weekday}</span>
                <span className="text-sm font-medium">{day.day}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {TIMES.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setTime(slot)}
                className={`rounded-md border px-2 py-2 text-sm ${time === slot ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-800 text-slate-300 hover:border-slate-600"}`}
              >
                {slot}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!date || !time}
            onClick={() => setStep(2)}
            className="mt-6 h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">2. Your details</p>
            <button type="button" onClick={() => setStep(1)} className="text-xs text-blue-400 hover:text-blue-300">
              {date} · {time} IST
            </button>
          </div>
          <Field label="Your name" name="name" autoComplete="name" placeholder="Enter your name" />
          <Field label="Organisation name" name="organisation" autoComplete="organization" placeholder="Enter your organisation's name" />
          <Field label="Email address" name="email" type="email" autoComplete="email" placeholder="name@company.com" />
          <Field label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="+91" />
          <label className="block text-sm">
            <span className="text-slate-300">What do you want to talk about?</span>
            <select name="topic" required defaultValue="Co-Build" className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
              {TOPICS.map((topic) => (
                <option key={topic}>{topic}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Anything we should know</span>
            <textarea name="note" rows={3} maxLength={500} placeholder="Optional" className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="whatsapp" defaultChecked className="accent-blue-500" />
            WhatsApp is fine for the confirmation
          </label>
          {state && !state.ok ? <p className="text-sm text-red-400">{state.error}</p> : null}
          <SubmitButton />
        </div>
      )}
    </form>
  );
}

function Field({ label, name, type = "text", autoComplete, placeholder }: { label: string; name: string; type?: string; autoComplete: string; placeholder: string }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-300">{label}</span>
      <input required name={name} type={type} autoComplete={autoComplete} placeholder={placeholder} className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600" />
    </label>
  );
}
