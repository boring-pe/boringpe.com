"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A slim bar across the top while the next page loads. It starts when an internal link is followed
 * or a form is sent, and finishes when the new page is in place.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    const start = (e: Event) => {
      if (e.type === "click") {
        const me = e as MouseEvent;
        const a = (me.target as HTMLElement).closest?.("a");
        if (!a || me.metaKey || me.ctrlKey || me.shiftKey || a.target === "_blank" || !a.href.startsWith(location.origin) || a.href === location.href) return;
      }
      setState("busy");
    };
    document.addEventListener("click", start);
    document.addEventListener("submit", start);
    return () => { document.removeEventListener("click", start); document.removeEventListener("submit", start); };
  }, []);

  // The page changed: finish the bar.
  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s === "busy" ? "done" : s)), 0);
    const u = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 400);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5">
      <div
        className="h-full bg-blue-500 transition-[width,opacity] ease-out"
        style={{
          width: state === "idle" ? "0%" : state === "busy" ? "80%" : "100%",
          opacity: state === "idle" ? 0 : 1,
          transitionDuration: state === "busy" ? "8s" : "300ms",
        }}
      />
    </div>
  );
}
