"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { SearchButton } from "./_shell/controls";

/**
 * The portal shell. Carries the person's theme, accent and density for the design system. On phones
 * the sidebar is a drawer that closes when a link in it is tapped or the backdrop is; from tablet
 * width up it stays beside the content. Clicking a notice dismisses it.
 */
export function PortalFrame({ sidebar, headerEnd, prefs, children }: {
  sidebar: React.ReactNode; headerEnd: React.ReactNode; prefs: { theme: string; accent: string; density: string }; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

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
      <aside
        id="portal-nav"
        onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
        className={`print:hidden fixed inset-y-0 left-0 z-40 flex w-[18rem] max-w-[85vw] transform flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-300 md:sticky md:top-0 md:h-screen md:w-[16rem] md:shrink-0 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebar}
      </aside>
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
