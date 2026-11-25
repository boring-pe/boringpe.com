"use client";

import { useRef, useState } from "react";

export type Tab = { id: string; label: string; count?: number; content: React.ReactNode };

/** Several short lists in one card. Arrow keys move between tabs. */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [current, setCurrent] = useState(tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    setCurrent(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-slate-800 px-3">
        {tabs.map((t, i) => {
          const on = t.id === current;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setCurrent(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") move(i + 1);
                else if (e.key === "ArrowLeft") move(i - 1);
              }}
              data-tab={t.id}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm transition-colors ${
                on ? "border-blue-500 font-medium text-white" : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
              {t.count ? <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-300">{t.count}</span> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== current} className="p-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
