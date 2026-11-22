"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, FileText, Search, Zap } from "lucide-react";

export type PaletteItem = { kind: "page" | "action" | "record"; label: string; href: string; hint: string };

/** Ctrl/⌘+K: jump to any page, run a quick action, or find a record by name or number. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openFresh = () => { setQ(""); setRecords([]); setActive(0); setOpen(true); };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => { if (!o) { setQ(""); setRecords([]); setActive(0); } return !o; });
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("portal:palette", openFresh);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("portal:palette", openFresh); };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/portal/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((j: { results: PaletteItem[] }) => setRecords(j.results.map((r) => ({ ...r, kind: "record" as const }))))
        .catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const local = items.filter((i) => !term || i.label.toLowerCase().includes(term) || i.hint.toLowerCase().includes(term));
    return [...local.slice(0, term ? 12 : 30), ...(term.length >= 2 ? records : [])];
  }, [items, records, q]);

  if (!open) return null;
  const go = (i: PaletteItem | undefined) => {
    if (!i) return;
    setOpen(false);
    // Switching workspace is a full page load so every part of the portal picks it up.
    if (i.href.startsWith("/portal/workspace/")) window.location.assign(i.href);
    else router.push(i.href);
  };
  const Icon = { page: ArrowRight, action: Zap, record: FileText };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Search and jump" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" data-palette>
        <div className="flex items-center gap-3 border-b border-slate-800 px-4">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            ref={input} autoFocus value={q} placeholder="Search pages, actions, invoices, deals, people…" aria-label="Search"
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(shown[active]); }
            }}
            className="h-14 w-full bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-slate-700 px-1.5 text-[11px] text-slate-500">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {shown.length === 0 ? <li className="px-3 py-6 text-center text-sm text-slate-500">Nothing found.</li> : shown.map((i, n) => {
            const I = Icon[i.kind];
            return (
              <li key={`${i.kind}:${i.href}:${i.label}`} role="option" aria-selected={n === active}>
                <button type="button" onMouseEnter={() => setActive(n)} onClick={() => go(i)} data-palette-item={i.label}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${n === active ? "bg-blue-600 text-white" : "text-slate-300"}`}>
                  <I className="h-4 w-4 shrink-0 opacity-70" />
                  <span className="truncate">{i.label}</span>
                  <span className={`ml-auto shrink-0 text-xs ${n === active ? "text-white/80" : "text-slate-500"}`}>{i.hint}</span>
                  {n === active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
