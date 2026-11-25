"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** What to call the page being opened: the link's own name, short. */
function linkName(a: HTMLAnchorElement): string {
  const raw = a.getAttribute("title") || a.getAttribute("aria-label") || a.textContent || "";
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length > 40 ? `${name.slice(0, 39)}…` : name || "the page";
}

/**
 * A slim bar across the top while the next page loads, and the page itself dims with "Opening
 * Tasks…" so a click never looks ignored. It starts when an internal link is followed or a form is
 * sent, and finishes when the new page is in place. Server redirects are untouched: nothing here
 * streams a placeholder before a page decides who may see it.
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
        if (!a || me.defaultPrevented || me.metaKey || me.ctrlKey || me.shiftKey || a.target === "_blank" || !a.href.startsWith(location.origin) || a.hasAttribute("download")) return;
        const to = new URL(a.href);
        // Same page, or only a jump within it: nothing loads.
        if (to.pathname === location.pathname && to.search === location.search) return;
        const main = document.querySelector("main");
        if (main) main.dataset.navigating = linkName(a);
      } else if ((e.target as HTMLElement).closest?.("[data-quick], [data-no-progress]")) {
        // Forms that answer in place (the quick-add panel) never change the page.
        return;
      }
      setState("busy");
    };
    document.addEventListener("click", start);
    document.addEventListener("submit", start);
    return () => { document.removeEventListener("click", start); document.removeEventListener("submit", start); };
  }, []);

  // The page changed: finish the bar and lift the dimming.
  useEffect(() => {
    delete document.querySelector("main")?.dataset.navigating;
    const t = setTimeout(() => setState((s) => (s === "busy" ? "done" : s)), 0);
    const u = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 400);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [pathname, search]);

  // Never leave the page dimmed: a navigation that goes nowhere (offline, blocked) clears itself.
  useEffect(() => {
    if (state !== "busy") return;
    const id = setTimeout(() => { delete document.querySelector("main")?.dataset.navigating; setState("idle"); }, 8000);
    return () => clearTimeout(id);
  }, [state]);

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
