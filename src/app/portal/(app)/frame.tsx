"use client";

import { useEffect, useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { SearchButton } from "./_shell/controls";
import { RailContext } from "./_shell/rail";
import { RAIL_COOKIE } from "@/lib/nav-calc";

/**
 * The portal shell. Carries the person's theme, accent and density for the design system. On phones
 * the sidebar is a drawer that closes when a link in it is tapped or the backdrop is; from tablet
 * width up it stays beside the content. Clicking a notice dismisses it.
 */
export function PortalFrame({ sidebar, headerEnd, prefs, initialRail = false, children }: {
  sidebar: React.ReactNode; headerEnd: React.ReactNode; prefs: { theme: string; accent: string; density: string }; initialRail?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // From tablet width up the sidebar can fold to an icon rail; the choice is kept on this device.
  const [rail, setRail] = useState(initialRail);
  const toggleRail = () => setRail((r) => {
    const next = !r;
    try { document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/portal; max-age=31536000; samesite=lax`; } catch { /* still folds, just not remembered */ }
    return next;
  });

  // "[" folds and unfolds the sidebar, outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      toggleRail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const dismiss = (e: MouseEvent) => {
      const toast = (e.target as HTMLElement).closest?.('main [role="status"]:not([data-persist])');
      if (toast) toast.classList.add("is-dismissed");
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, []);

  return (
    <div className="portal min-h-screen text-slate-300 md:flex" data-theme={prefs.theme} data-accent={prefs.accent} data-density={prefs.density} style={{ background: "var(--p-bg)" }}>
      {open ? <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] md:hidden" /> : null}
      <RailContext.Provider value={rail}>
      <aside
        id="portal-nav"
        data-rail={rail ? "true" : "false"}
        onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
        className={`print:hidden fixed inset-y-0 left-0 z-40 flex w-[18rem] max-w-[85vw] transform flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-300 md:sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 md:transition-[width] ${rail ? "md:w-[4.75rem]" : "md:w-[16rem]"} ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebar}
        <div className="hidden border-t border-slate-800 p-2 md:block">
          <button
            type="button"
            onClick={toggleRail}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            title={`${rail ? "Expand" : "Collapse"} sidebar ( [ )`}
            data-rail-toggle
            className="rail-center flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-white"
          >
            {rail ? <PanelLeftOpen aria-hidden className="h-4 w-4 shrink-0" /> : <PanelLeftClose aria-hidden className="h-4 w-4 shrink-0" />}
            <span className="rail-hide">Collapse sidebar</span>
          </button>
        </div>
      </aside>
      </RailContext.Provider>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-800 px-4 backdrop-blur md:h-20 md:px-8" style={{ background: "color-mix(in oklab, var(--p-bg) 82%, transparent)" }}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="portal-nav"
              onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800/60 md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1 md:max-w-md"><SearchButton /></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">{headerEnd}</div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
