import React, { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3, Bell, BookOpen, Building2, CalendarDays, ClipboardCheck, Crown, FileText, FolderKanban, HeartHandshake,
  Inbox as InboxIcon, LayoutDashboard, Landmark, ListChecks, Lock, LogOut, MessageCircle, Package, Pin, Plug, Receipt,
  Rocket, ShieldCheck, Sparkles, Target, Crosshair, UserCircle, Users, Wallet,
} from "lucide-react";
import { requireUser } from "@/lib/dal";
import { unreadCount } from "@/lib/notify";
import { getPrefs } from "@/lib/prefs";
import { GROUPS, ROLE_META, allowedSections, type SectionId } from "@/lib/rbac";
import { togglePin } from "./_shell/prefs-actions";
import { CommandPalette, type PaletteItem } from "./_shell/palette";
import { NavProgress } from "./_shell/progress";
import { SearchButton, ThemeToggle } from "./_shell/controls";
import { PortalFrame } from "./frame";
import { signOutAction } from "./sign-out";

export const metadata: Metadata = {
  title: "Boring Portal",
  robots: { index: false, follow: false },
};

const ICONS: Record<SectionId, React.ElementType> = {
  console: Crown, integrations: Plug, content: FileText, approvals: ClipboardCheck, reports: BarChart3, personal: Lock,
  dashboard: LayoutDashboard, intelligence: Sparkles, inbox: InboxIcon, calendar: CalendarDays, whatsapp: MessageCircle, portfolio: Building2,
  ventures: Rocket, deals: Target, money: Wallet, books: BookOpen, invoices: Receipt, bank: Landmark, assets: Package,
  budgets: Crosshair, tasks: ListChecks, people: Users, vault: FolderKanban, marrow: HeartHandshake, access: ShieldCheck,
};

const link =
  "group/link flex flex-1 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white";

/** Quick actions offered in the command palette, each only to people who can use the page it opens. */
const ACTIONS: { section: SectionId; label: string; href: string; hint: string }[] = [
  { section: "invoices", label: "New invoice", href: "/portal/invoices?view=new", hint: "Invoices" },
  { section: "books", label: "Post a journal entry", href: "/portal/books?view=journal", hint: "Books" },
  { section: "money", label: "Record money in or a payment", href: "/portal/money", hint: "Money" },
  { section: "inbox", label: "Compose an email", href: "/portal/inbox?view=compose", hint: "Inbox" },
  { section: "calendar", label: "Schedule a meeting", href: "/portal/calendar", hint: "Calendar" },
  { section: "whatsapp", label: "Start a WhatsApp conversation", href: "/portal/whatsapp?start=1", hint: "WhatsApp" },
  { section: "tasks", label: "Add a task", href: "/portal/tasks", hint: "Tasks" },
  { section: "people", label: "Prepare payroll", href: "/portal/people?view=payroll", hint: "People" },
  { section: "bank", label: "Import a bank statement", href: "/portal/bank", hint: "Bank" },
  { section: "intelligence", label: "What needs attention", href: "/portal/intelligence", hint: "Insights" },
  { section: "reports", label: "Open MIS reports", href: "/portal/reports", hint: "Reports" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const meta = ROLE_META[user.role];
  // Until a temporary password is replaced, the only open page is Account.
  const items = user.must_change_password ? [] : allowedSections(user.role);
  const [unread, prefs] = await Promise.all([unreadCount(user.id), getPrefs(user.id)]);
  const pinned = prefs.pinned.map((id) => items.find((i) => i.id === id)).filter((i): i is (typeof items)[number] => Boolean(i));
  const initials = (user.name ?? user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || meta.initials;

  const navItem = (item: (typeof items)[number], isPinned: boolean) => {
    const Icon = ICONS[item.id];
    return (
      <div key={`${isPinned ? "pin" : "nav"}-${item.id}`} className="group flex items-center">
        <Link href={item.href} className={link}>
          <Icon className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover/link:text-blue-400" />
          <span className="truncate">{item.label}</span>
        </Link>
        <form action={togglePin.bind(null, item.id)}>
          <button
            aria-label={`${prefs.pinned.includes(item.id) ? "Unpin" : "Pin"} ${item.label}`}
            className={`rounded-md p-1.5 text-slate-500 transition hover:text-blue-400 focus:opacity-100 ${prefs.pinned.includes(item.id) ? "opacity-70" : "opacity-0 group-hover:opacity-100"}`}
          >
            <Pin className={`h-3.5 w-3.5 ${prefs.pinned.includes(item.id) ? "fill-current" : ""}`} />
          </button>
        </form>
      </div>
    );
  };

  const sidebar = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5 md:h-20">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-serif text-lg font-semibold text-white shadow-sm">B</div>
        <div className="leading-tight">
          <div className="font-serif text-base font-semibold tracking-tight text-white">Boring PE</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Portal</div>
        </div>
      </div>
      <div className="px-3 pt-4 md:hidden">
        <SearchButton wide />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Portal">
        {pinned.length ? (
          <div className="space-y-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Pinned</div>
            {pinned.map((i) => navItem(i, true))}
          </div>
        ) : null}
        {GROUPS.map((group) => {
          const inGroup = items.filter((item) => item.group === group.id);
          if (inGroup.length === 0) return null;
          return (
            <div key={group.id} className="space-y-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{group.label}</div>
              {inGroup.map((i) => navItem(i, false))}
            </div>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-slate-800 p-3">
        <Link href="/portal/notifications" className={link}>
          <Bell className="h-4 w-4 text-slate-500" />
          Notifications{unread ? <span className="ml-auto rounded-full bg-blue-600 px-2 text-xs text-white">{unread}</span> : null}
        </Link>
        <Link href="/portal/account" className={link}>
          <UserCircle className="h-4 w-4 text-slate-500" />
          Account and appearance
        </Link>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.name ?? user.email}</div>
            <div className="text-xs text-slate-500">{meta.label}</div>
          </div>
        </div>
        <form action={signOutAction} className="px-1">
          <button type="submit" className={`${link} w-full`}>
            <LogOut className="h-4 w-4 text-slate-500" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );

  const headerEnd = (
    <>
      <ThemeToggle theme={prefs.theme} />
      <Link href="/portal/notifications" aria-label={unread ? `${unread} unread notifications` : "Notifications"} className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-800/60 hover:text-white" data-bell>
        <Bell className="h-5 w-5" />
        {unread ? <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-blue-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">{unread > 99 ? "99+" : unread}</span> : null}
      </Link>
      <Link href="/portal/account" aria-label="Account" className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{initials}</Link>
    </>
  );

  const palette: PaletteItem[] = [
    ...items.map((i) => ({ kind: "page" as const, label: i.label, href: i.href, hint: "Go to" })),
    { kind: "page", label: "Notifications", href: "/portal/notifications", hint: "Go to" },
    { kind: "page", label: "Account and appearance", href: "/portal/account", hint: "Go to" },
    ...ACTIONS.filter((a) => items.some((i) => i.id === a.section)).map((a) => ({ kind: "action" as const, label: a.label, href: a.href, hint: a.hint })),
  ];

  return (
    <PortalFrame sidebar={sidebar} headerEnd={headerEnd} prefs={{ theme: prefs.theme, accent: prefs.accent, density: prefs.density }}>
      <Suspense fallback={null}><NavProgress /></Suspense>
      {children}
      <CommandPalette items={palette} />
    </PortalFrame>
  );
}
