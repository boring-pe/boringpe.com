"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Keyboard, PanelRight, Plus, X } from "lucide-react";
import { openQuick } from "./quick-add";
import type { QuickKind } from "./quick-actions";

export type NavItem = { href: string; label: string; group: string };
export type NewItem = { href: string; label: string; note: string; quick?: QuickKind };

/** "Workspace › Group › Page" above every page, so you always know where you are. */
export function Crumbs({ items, workspace }: { items: NavItem[]; workspace: string }) {
  const path = usePathname();
  const hit = [...items].sort((a, b) => b.href.length - a.href.length).find((i) => path === i.href || path.startsWith(`${i.href}/`));
  if (!hit) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500 print:hidden" data-crumbs>
      <span>{workspace}</span>
      {hit.group ? <><ChevronRight className="h-3 w-3" /><span>{hit.group}</span></> : null}
      <ChevronRight className="h-3 w-3" />
      <Link href={hit.href} className="text-slate-300 hover:text-white">{hit.label}</Link>
    </nav>
  );
}

const OPEN_NEW = "portal:new";

/** "+ New": one place to start anything this person can create. */
export function NewMenu({ items }: { items: NewItem[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const open = () => { if (ref.current) ref.current.open = true; };
    const close = (e: MouseEvent) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    window.addEventListener(OPEN_NEW, open);
    document.addEventListener("click", close);
    return () => { window.removeEventListener(OPEN_NEW, open); document.removeEventListener("click", close); };
  }, []);
  if (!items.length) return null;
  return (
    <details ref={ref} className="relative" data-new-menu>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 [&::-webkit-details-marker]:hidden" aria-label="Create new">
        <Plus className="h-4 w-4" /><span className="hidden sm:inline">New</span>
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-xl">
        {items.map((i) => i.quick ? (
          // A link to the page, so it still works before scripts load; with them it opens the panel instead.
          <Link
            key={i.href + i.label}
            href={i.href}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              if (ref.current) ref.current.open = false;
              openQuick(i.quick!);
            }}
            className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-800/60"
            data-new-item={i.label}
            data-quick-open={i.quick}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white">{i.label}</span>
              <span className="block text-xs text-slate-500">{i.note}</span>
            </span>
            <PanelRight aria-label="Opens here, without leaving the page" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          </Link>
        ) : (
          <Link key={i.href + i.label} href={i.href} onClick={() => { if (ref.current) ref.current.open = false; }} className="block rounded-lg px-3 py-2 hover:bg-slate-800/60" data-new-item={i.label}>
            <span className="block text-sm text-white">{i.label}</span>
            <span className="block text-xs text-slate-500">{i.note}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

const GO: [string, string, string][] = [
  ["d", "/portal/dashboard", "Dashboard"],
  ["a", "/portal/assistant", "Assistant"],
  ["s", "/portal/intelligence", "Insights"],
  ["b", "/portal/books", "Books"],
  ["i", "/portal/invoices", "Invoices"],
  ["m", "/portal/money", "Money"],
  ["t", "/portal/tasks", "Tasks"],
  ["v", "/portal/vault", "Vault"],
  ["k", "/portal/kyc", "KYC"],
  ["g", "/portal/guides", "Guides"],
];

/** Keyboard shortcuts: g then a letter to go somewhere, n for New, ? for this list. */
export function Shortcuts({ allowed }: { allowed: string[] }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pending = useRef<number | null>(null);
  const go = GO.filter(([, href]) => allowed.includes(href));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      if (e.key === "Escape") { setHelp(false); return; }
      if (e.key === "?") { e.preventDefault(); setHelp((h) => !h); return; }
      if (pending.current !== null) {
        window.clearTimeout(pending.current);
        pending.current = null;
        const hit = go.find(([k]) => k === e.key.toLowerCase());
        if (hit) { e.preventDefault(); router.push(hit[1]); }
        return;
      }
      if (e.key === "g") { pending.current = window.setTimeout(() => { pending.current = null; }, 1200); return; }
      if (e.key === "n") { e.preventDefault(); window.dispatchEvent(new Event(OPEN_NEW)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router]);
  if (!help) return null;
  const row = (keys: string, what: string) => (
    <li key={keys} className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-slate-300">{what}</span>
      <kbd className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-slate-300">{keys}</kbd>
    </li>
  );
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setHelp(false)} data-shortcuts>
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Keyboard className="h-4 w-4" />Keyboard shortcuts</h2>
          <button type="button" aria-label="Close" onClick={() => setHelp(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <ul className="mt-3 divide-y divide-slate-800 text-sm">
          {row("Ctrl K", "Search and jump anywhere")}
          {row("N", "Create something new")}
          {row("[", "Fold the sidebar to icons, or open it again")}
          {go.map(([k, , label]) => row(`G ${k.toUpperCase()}`, `Go to ${label}`))}
          {row("?", "Show or hide this list")}
        </ul>
      </div>
    </div>
  );
}
