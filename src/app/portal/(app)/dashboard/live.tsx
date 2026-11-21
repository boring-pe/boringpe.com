"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the dashboard's figures every minute while the tab is visible. */
export function LiveRefresh({ every = 60_000 }: { every?: number }) {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    };
    const id = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [router, every]);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-500" data-live>
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" /></span>
      Live · {at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
    </span>
  );
}
