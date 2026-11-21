"use client";

import { useTransition } from "react";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { setTheme } from "./prefs-actions";

export const openPalette = () => window.dispatchEvent(new CustomEvent("portal:palette"));

export function SearchButton({ wide }: { wide?: boolean }) {
  return (
    <button
      type="button" onClick={openPalette} aria-label="Search and jump (Ctrl K)" data-search
      className={`flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-left text-sm text-slate-500 transition hover:border-slate-700 hover:text-slate-300 ${wide ? "" : "max-md:border-transparent max-md:bg-transparent max-md:px-2"}`}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className={`truncate ${wide ? "" : "max-md:sr-only"}`}>Search or jump to…</span>
      <kbd className="ml-auto hidden rounded border border-slate-700 px-1.5 font-sans text-[11px] text-slate-500 md:inline">Ctrl K</kbd>
    </button>
  );
}

const NEXT: Record<string, string> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<string, string> = { system: "Theme follows this device", light: "Light theme", dark: "Dark theme" };

/** Cycles device → light → dark; the page changes at once, the choice is saved in the background. */
export function ThemeToggle({ theme }: { theme: string }) {
  const [, start] = useTransition();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      type="button" aria-label={`${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]].toLowerCase()}`} title={LABEL[theme]} data-theme-toggle={theme}
      onClick={() => {
        const next = NEXT[theme];
        document.querySelector<HTMLElement>(".portal")?.setAttribute("data-theme", next);
        start(() => setTheme(next));
      }}
      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800/60 hover:text-white"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
