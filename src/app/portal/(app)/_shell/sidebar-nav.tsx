"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Pin } from "lucide-react";
import type { SectionId } from "@/lib/rbac";
import { togglePin } from "./prefs-actions";
import { GROUP_HUE, NAV_ICONS } from "./nav-icons";
import { IntentLink, Pending } from "./nav-link";
import { useRail } from "./rail";
import { activeHref, FOLD_COOKIE } from "@/lib/nav-calc";

export type NavBadge = { n: number; tone: "late" | "waiting"; label: string };
export type NavEntry = { id: SectionId; href: string; label: string; badge?: NavBadge };
export type NavGroup = { id: string; label: string; items: NavEntry[] };

const FOLD_MS = 180;

function saveFolds(folded: Set<string>) {
  try {
    document.cookie = `${FOLD_COOKIE}=${encodeURIComponent([...folded].join(","))}; path=/portal; max-age=31536000; samesite=lax`;
  } catch {
    // A browser that refuses cookies still folds; it just forgets on the next visit.
  }
}

/** Eases a group open and shut. Shut groups are inert, so their links leave the tab order. */
function Fold({ open, children, id }: { open: boolean; children: React.ReactNode; id: string }) {
  return (
    <div
      id={id}
      inert={!open}
      style={{ transitionDuration: `${FOLD_MS}ms` }}
      className={`grid transition-[grid-template-rows] ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="min-h-0 space-y-0.5 overflow-hidden">{children}</div>
    </div>
  );
}

const badgeColor = (b: NavBadge) => (b.tone === "late" ? "var(--p-late)" : "var(--a-500)");

function Badge({ b }: { b: NavBadge }) {
  return (
    <span className="rail-hide ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular-nums" style={{ background: badgeColor(b) }} title={b.label} data-nav-badge={b.n}>
      {b.n > 99 ? "99+" : b.n}
    </span>
  );
}

/**
 * The menu: the page you are on is lit, each group has its own colour and folds away (remembered
 * on this device), counts that need you sit beside their page, and in the icon rail only icons show.
 */
export function SidebarNav({ groups, pinned, initialFolded }: { groups: NavGroup[]; pinned: NavEntry[]; initialFolded: string[] }) {
  const path = usePathname();
  const rail = useRail();
  const [folded, setFolded] = useState(() => new Set(initialFolded));
  const allHrefs = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.href)), [groups]);
  const current = activeHref(path, allHrefs);
  const currentGroup = groups.find((g) => g.items.some((i) => i.href === current))?.id;
  const pinnedIds = new Set(pinned.map((p) => p.id));

  // Opening a page inside a folded group unfolds it, so the lit row is never hidden. Done while
  // rendering (React's pattern for following a changed value), not in an effect.
  const [seenGroup, setSeenGroup] = useState<string | undefined>(undefined);
  if (currentGroup !== seenGroup) {
    setSeenGroup(currentGroup);
    if (currentGroup && folded.has(currentGroup)) {
      const next = new Set(folded);
      next.delete(currentGroup);
      setFolded(next);
    }
  }

  const toggle = (id: string) => {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFolded(next);
    saveFolds(next);
  };

  const row = (item: NavEntry, hue: string, where: string) => {
    const Icon = NAV_ICONS[item.id];
    const on = item.href === current && where !== "pinned";
    const isPinned = pinnedIds.has(item.id);
    return (
      <div key={`${where}-${item.id}`} className="group/row relative flex items-center">
        <IntentLink
          href={item.href}
          aria-current={on ? "page" : undefined}
          title={item.label}
          data-nav={item.id}
          className={`rail-center relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
            on ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
          }`}
        >
          {on ? <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-500" /> : null}
          <span className="nav-tint relative grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ "--hue": hue } as React.CSSProperties}>
            <Pending className="h-4 w-4"><Icon aria-hidden className="h-4 w-4" /></Pending>
            {/* In the icon rail the count becomes a dot on the icon's corner. */}
            {item.badge ? <span aria-hidden className="rail-only absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--p-surface)]" style={{ background: badgeColor(item.badge) }} /> : null}
          </span>
          <span className="rail-hide truncate">{item.label}</span>
          {item.badge ? <Badge b={item.badge} /> : null}
          {item.badge ? <span className="sr-only">, {item.badge.label}</span> : null}
        </IntentLink>
        <form action={togglePin.bind(null, item.id)} className="rail-hide">
          <button
            aria-label={`${isPinned ? "Unpin" : "Pin"} ${item.label}`}
            className={`rounded-md p-1.5 text-slate-500 transition hover:text-blue-400 focus:opacity-100 ${isPinned ? "opacity-70" : "opacity-0 group-hover/row:opacity-100"}`}
          >
            <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
          </button>
        </form>
      </div>
    );
  };

  const heading = (id: string, label: string, open: boolean, count: number) => (
    <button
      type="button"
      onClick={() => toggle(id)}
      aria-expanded={open}
      aria-controls={`nav-${id}`}
      data-nav-group={id}
      className="rail-hide group/h flex w-full items-center gap-2 rounded-md px-2 pb-1 pt-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: GROUP_HUE[id] ?? GROUP_HUE.pinned }} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!open && count ? <span className="rounded-full bg-slate-800 px-1.5 text-[11px] normal-case tracking-normal text-slate-400">{count}</span> : null}
      <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} />
    </button>
  );

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Portal">
      {pinned.length ? (
        <div>
          {heading("pinned", "Pinned", !folded.has("pinned"), pinned.length)}
          <div aria-hidden className="rail-only mx-2 mb-2 border-t border-slate-800" />
          <Fold open={rail || !folded.has("pinned")} id="nav-pinned">{pinned.map((i) => row(i, GROUP_HUE.pinned, "pinned"))}</Fold>
        </div>
      ) : null}
      {groups.map((g) => {
        const open = !folded.has(g.id);
        const waiting = g.items.reduce((n, i) => n + (i.badge?.n ?? 0), 0);
        return (
          <div key={g.id}>
            {heading(g.id, g.label, open, waiting)}
            <div aria-hidden className="rail-only mx-2 mb-2 border-t border-slate-800" />
            <Fold open={rail || open} id={`nav-${g.id}`}>{g.items.map((i) => row(i, GROUP_HUE[g.id] ?? GROUP_HUE.pinned, "nav"))}</Fold>
          </div>
        );
      })}
    </nav>
  );
}
