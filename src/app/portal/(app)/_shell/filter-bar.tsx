"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { rowMatches } from "@/lib/nav-calc";

export type FilterChip = { id: string; label: string };

const readParams = (key: string) => {
  try { return new URLSearchParams(window.location.search).get(key); } catch { return null; }
};

/**
 * One search-and-filter bar for a list, the same on every list page:
 *
 *   [Search ……]  All · Open · Overdue · Done            3 of 12
 *
 * Filters the rows already on the page as you type, with no trip to the server, and keeps the
 * search and the chip in the address (`q`, `f`) so a filtered list can be shared or reloaded.
 * Rows are the list's `[data-row]` children; chips match the words in each row's `data-tags`.
 */
export function FilterBar({ list, chips, placeholder, noun }: { list: string; chips: FilterChip[]; placeholder: string; noun: [string, string] }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ shown: number; total: number; byChip: Record<string, number> } | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const ready = useRef(false);

  // Start from the address, so a shared link opens filtered.
  const chipIds = chips.map((c) => c.id).join(" ");
  useEffect(() => {
    const fromUrl = readParams("q") ?? "";
    const f = readParams("f");
    // One-off sync from the address on mount: the address is outside React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ(fromUrl);
    setChip(f && chipIds.split(" ").includes(f) ? f : null);
    ready.current = true;
  }, [chipIds]);

  // Hide what does not match, count what does, and do it again whenever the list changes.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-filter-list="${list}"]`);
    if (!root) return;
    const apply = () => {
      const rows = [...root.querySelectorAll<HTMLElement>("[data-row]")];
      const byChip: Record<string, number> = {};
      let shown = 0;
      for (const r of rows) {
        const tags = (r.dataset.tags ?? "").split(/\s+/).filter(Boolean);
        for (const t of tags) byChip[t] = (byChip[t] ?? 0) + (rowMatches(r.textContent ?? "", tags, q, null) ? 1 : 0);
        const ok = rowMatches(r.textContent ?? "", tags, q, chip);
        r.hidden = !ok;
        if (ok) shown += 1;
      }
      root.toggleAttribute("data-filtered", Boolean(q || chip));
      setCounts({ shown, total: rows.length, byChip });
    };
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [list, q, chip]);

  // Keep the address in step, quietly (no navigation, no server round trip).
  useEffect(() => {
    if (!ready.current) return;
    const id = setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
        if (chip) url.searchParams.set("f", chip); else url.searchParams.delete("f");
        if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
      } catch { /* the filter still works; only the address is not updated */ }
    }, 250);
    return () => clearTimeout(id);
  }, [q, chip]);

  // "/" jumps to the search box, as on most list tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      e.preventDefault();
      box.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clear = () => { setQ(""); setChip(null); box.current?.focus(); };
  const on = Boolean(q || chip);
  const chipBtn = (id: string | null, text: string, n?: number) => {
    const active = chip === id;
    return (
      <button
        key={id ?? "all"}
        type="button"
        aria-pressed={active}
        onClick={() => setChip(active && id ? null : id)}
        data-filter-chip={id ?? "all"}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
          active ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"
        }`}
      >
        {text}
        {n !== undefined ? <span className="tabular-nums text-slate-500">{n}</span> : null}
      </button>
    );
  };

  return (
    <div className="space-y-2 border-b border-slate-800 px-4 py-3 sm:px-6" data-filter-bar={list}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search {noun[1]}</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={box}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }}
            placeholder={placeholder}
            className="w-full rounded-md border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-8 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            data-filter-search
          />
          <kbd aria-hidden className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-slate-700 px-1 font-mono text-[11px] text-slate-500 sm:block">/</kbd>
        </label>
        <div role="group" aria-label={`Filter ${noun[1]}`} className="flex max-w-full gap-1.5 overflow-x-auto">
          {chipBtn(null, "All")}
          {chips.map((c) => chipBtn(c.id, c.label, counts?.byChip[c.id] ?? 0))}
        </div>
        {counts ? (
          <span className="ml-auto text-xs tabular-nums text-slate-500" aria-live="polite" data-filter-count>
            {on ? `${counts.shown} of ${counts.total} ${counts.total === 1 ? noun[0] : noun[1]}` : `${counts.total} ${counts.total === 1 ? noun[0] : noun[1]}`}
          </span>
        ) : null}
      </div>
      {on && counts && counts.shown === 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400" data-filter-empty>
          Nothing matches{q ? <> &ldquo;{q}&rdquo;</> : null}{chip ? <> in {chips.find((c) => c.id === chip)?.label.toLowerCase()}</> : null}.
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"><X aria-hidden className="h-3.5 w-3.5" />Clear filters</button>
        </p>
      ) : on ? (
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white" data-filter-clear><X aria-hidden className="h-3.5 w-3.5" />Clear filters</button>
      ) : null}
    </div>
  );
}
