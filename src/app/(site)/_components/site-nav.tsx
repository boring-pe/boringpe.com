"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, Menu, X } from "lucide-react";
import { SITE_PAGES } from "./pages";

/**
 * The site menu. From laptop width up, every page is a link in the bar with "Connect with Us" on the
 * right; on smaller screens a button opens a full-width panel that closes on a choice, a tap
 * outside or Escape.
 */
export function SiteNav() {
  const path = usePathname();
  // The page the menu was opened on: moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((cur) => ((typeof v === "function" ? v(cur === path) : v) ? path : null));
  const bar = useRef<HTMLElement>(null);
  // Close on Escape or a tap outside.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const tap = (e: PointerEvent) => bar.current && !bar.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", tap);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", tap);
    };
  });

  const here = (href: string) => path === href;

  return (
    <nav ref={bar} aria-label="Site" className="fixed top-0 inset-x-0 z-50 bg-slate-950/85 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-6 h-16 lg:h-20 flex items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Boring PE, home">
          <Building2 aria-hidden className="w-7 h-7 text-blue-500" />
          <span className="text-lg font-bold tracking-tight text-white">BORING PE</span>
        </Link>

        <ul data-bar className="hidden lg:flex flex-1 items-center justify-center gap-1 text-sm">
          {SITE_PAGES.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={here(href) ? "page" : undefined}
                className={`block whitespace-nowrap rounded-md px-3 py-2 transition-colors ${
                  here(href) ? "bg-slate-800/80 text-white" : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                }`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/connect"
          className="hidden lg:inline-flex shrink-0 items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Connect with Us
        </Link>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="site-menu"
          className="ml-auto lg:hidden inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200"
        >
          {open ? <X aria-hidden className="w-4 h-4" /> : <Menu aria-hidden className="w-4 h-4" />}
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <div id="site-menu" hidden={!open} className="lg:hidden border-t border-slate-800 bg-slate-950">
        <ul className="max-w-7xl mx-auto px-4 py-3 grid gap-1 sm:grid-cols-2">
          {SITE_PAGES.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={here(href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-3 text-base ${here(href) ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white"}`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="max-w-7xl mx-auto px-7 pb-5">
          <Link href="/connect" onClick={() => setOpen(false)} className="flex justify-center rounded-md bg-blue-600 px-4 py-3 text-base font-medium text-white hover:bg-blue-500">
            Connect with Us
          </Link>
        </div>
      </div>
    </nav>
  );
}
