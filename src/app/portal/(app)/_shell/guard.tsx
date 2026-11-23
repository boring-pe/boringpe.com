"use client";

import { useEffect, useRef, useState } from "react";
import { idleSignOut } from "../sign-out";

const KEY = "portal-last-activity";
const read = () => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
};
const write = (t: number) => {
  try { localStorage.setItem(KEY, String(t)); } catch { /* private window */ }
};

/**
 * Two guards on every portal page:
 * - a faint watermark with the viewer's email and the date, on screen and in print, so a
 *   screenshot or printout that leaks can be traced back;
 * - sign-out after a stretch without activity in any portal tab, with a minute's warning.
 */
export function PortalGuard({ email, idleMinutes, today }: { email: string; idleMinutes: number; today: string }) {
  const [warn, setWarn] = useState(false);
  const last = useRef(0);
  const gone = useRef(false);

  useEffect(() => {
    const limit = idleMinutes * 60_000;
    last.current = Date.now();
    write(last.current);
    let stamp = 0;
    const active = () => {
      last.current = Date.now();
      if (last.current - stamp > 15_000) { stamp = last.current; write(last.current); }
      setWarn(false);
    };
    const events = ["pointerdown", "keydown", "scroll", "pointermove", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    const timer = window.setInterval(() => {
      // Activity in another portal tab counts too.
      const latest = Math.max(last.current, read());
      const idle = Date.now() - latest;
      if (idle >= limit && !gone.current) {
        gone.current = true;
        void idleSignOut();
      } else {
        setWarn(idle >= limit - 60_000);
      }
    }, 5_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, active));
      window.clearInterval(timer);
    };
  }, [idleMinutes]);

  const label = `${email} · ${today}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200'><text x='20' y='120' transform='rotate(-24 180 100)' font-family='Inter,system-ui,sans-serif' font-size='13' fill='%2394a3b8'>${label.replace(/[<>&'"]/g, "")}</text></svg>`;

  return (
    <>
      <div
        aria-hidden
        data-watermark={label}
        className="pointer-events-none fixed inset-0 z-[70] select-none opacity-[0.07] print:opacity-25"
        style={{ backgroundImage: `url("data:image/svg+xml;utf8,${svg.replace(/#/g, "%23")}")`, backgroundRepeat: "repeat" }}
      />
      {warn ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-lg border border-amber-500/40 bg-slate-900 px-4 py-2 text-sm text-amber-200 shadow-lg print:hidden">
          You will be signed out in a minute for inactivity. Move the mouse or press a key to stay.
        </div>
      ) : null}
    </>
  );
}
