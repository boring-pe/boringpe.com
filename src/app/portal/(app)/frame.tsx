"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * The portal shell. On phones the sidebar is a drawer behind a menu button that closes when a
 * link in it is tapped or the backdrop is; from tablet width up it stays beside the content.
 */
export function PortalFrame({ sidebar, headerEnd, title, subtitle, children }: {
  sidebar: React.ReactNode; headerEnd: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 md:flex">
      {open ? <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/60 md:hidden" /> : null}
      <aside
        id="portal-nav"
        onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
        className={`print:hidden fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] transform bg-slate-900 border-r border-slate-800 flex flex-col transition-transform md:static md:w-64 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 md:h-20 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="portal-nav"
              onClick={() => setOpen((o) => !o)} className="rounded-md p-2 text-slate-300 hover:bg-slate-800 md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-white md:text-lg">{title}</h1>
              <p className="truncate text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">{headerEnd}</div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
