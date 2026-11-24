"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Building2 } from "lucide-react";
import { SITE_PAGES } from "./pages";

/** The site menu: a row on wide screens, a drop-down on narrow ones. The current page is marked. */
export function SiteNav() {
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  // Close the drop-down after moving to another page.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  const link = (href: string) =>
    `transition-colors ${path === href ? "text-white" : "text-slate-300 hover:text-white"}`;

  return (
    <nav aria-label="Site" className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <Building2 className="w-8 h-8 text-blue-500" />
          <span className="text-xl font-bold tracking-tight text-white">BORING PE</span>
        </Link>
        <div className="hidden xl:flex items-center gap-5 ml-10 text-sm font-medium">
          {SITE_PAGES.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={link(href)}>
              {label}
            </Link>
          ))}
        </div>
        <details ref={menu} className="relative xl:hidden ml-auto">
          <summary className="cursor-pointer list-none rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 [&::-webkit-details-marker]:hidden">
            Menu
          </summary>
          <div className="absolute right-0 top-12 z-50 w-52 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-xl">
            {SITE_PAGES.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm hover:bg-slate-800 ${path === href ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </nav>
  );
}
