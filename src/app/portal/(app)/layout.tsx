import React, { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Bell, LogOut, UserCircle } from "lucide-react";
import { needsAccountFirst, requireUser } from "@/lib/dal";
import { unreadCount } from "@/lib/notify";
import { getSettings } from "@/lib/assistant";
import { getPrefs } from "@/lib/prefs";
import { GROUPS, ROLE_META, allowedSections, type SectionId } from "@/lib/rbac";
import { WorkspaceSwitcher } from "./_shell/workspace-switcher";
import { Crumbs, NewMenu, Shortcuts, type NewItem } from "./_shell/ux";
import { sectionInView, workspaceLabel } from "@/lib/workspace-calc";
import { workspaceContext } from "@/lib/workspaces";
import { CommandPalette, type PaletteItem } from "./_shell/palette";
import { NavProgress } from "./_shell/progress";
import { SearchButton, ThemeToggle } from "./_shell/controls";
import { PortalFrame } from "./frame";
import { signOutAction } from "./sign-out";
import { PortalGuard } from "./_shell/guard";
import { IDLE_MINUTES } from "@/lib/security-calc";
import { navBadges } from "@/lib/nav-badges";
import { FOLD_COOKIE, parseFolds, RAIL_COOKIE } from "@/lib/nav-calc";
import { QuickAddHost } from "./_shell/quick-add";
import type { QuickKind } from "./_shell/quick-actions";
import { SidebarNav, type NavEntry, type NavGroup } from "./_shell/sidebar-nav";

export const metadata: Metadata = {
  title: "Boring Portal",
  robots: { index: false, follow: false },
};


const link =
  "rail-center group/link flex flex-1 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-white";

/** Quick actions offered in the command palette, each only to people who can use the page it opens. */
/** What "+ New" offers, each shown only to people who can open that page. */
const NEW_ITEMS: { section: SectionId; label: string; href: string; note: string; quick?: QuickKind }[] = [
  { section: "invoices", label: "Invoice", href: "/portal/invoices?view=new", note: "Bill a customer, with GST" },
  { section: "money", label: "Money in or out", href: "/portal/money", note: "Record a receipt or ask to pay", quick: "money" },
  { section: "books", label: "Journal entry", href: "/portal/books?view=journal", note: "Post to the books" },
  { section: "tasks", label: "Task", href: "/portal/tasks", note: "Something to do, with a due date", quick: "task" },
  { section: "deals", label: "Deal", href: "/portal/deals", note: "Add to the pipeline", quick: "deal" },
  { section: "calendar", label: "Meeting", href: "/portal/calendar", note: "Schedule and invite" },
  { section: "vault", label: "File or folder", href: "/portal/vault", note: "Upload to the drive" },
  { section: "kyc", label: "KYC case", href: "/portal/kyc?view=new", note: "Verify a person or company" },
  { section: "secrets", label: "Password", href: "/portal/secrets", note: "Seal a login in the vault" },
  { section: "access", label: "Invite someone", href: "/portal/access", note: "Give a seat and a role" },
  { section: "assistant", label: "Ask the assistant", href: "/portal/assistant", note: "Or let her do it for you" },
];

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
  { section: "assistant", label: "Ask the assistant", href: "/portal/assistant", hint: "Assistant" },
  { section: "intelligence", label: "What needs attention", href: "/portal/intelligence", hint: "Insights" },
  { section: "reports", label: "Open MIS reports", href: "/portal/reports", hint: "Reports" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const meta = ROLE_META[user.role];
  // Until a temporary password is replaced, the only open page is Account.
  const [unread, prefs, ws, assistant, badges, jar] = await Promise.all([unreadCount(user.id), getPrefs(user.id), workspaceContext(), getSettings(), navBadges(user), cookies()]);
  const initialRail = jar.get(RAIL_COOKIE)?.value === "1";
  const initialFolded = parseFolds(jar.get(FOLD_COOKIE)?.value, ["pinned", ...GROUPS.map((g) => g.id)]);
  const assistantName = assistant.name;
  // The menu follows the workspace on view: Personal has no ventures or payroll, Impact Marrow no deal pipeline.
  const accountFirst = await needsAccountFirst(user);
  const items = accountFirst ? [] : allowedSections(user.role).filter((i) => sectionInView(i.id, ws.view));
  const pinned = prefs.pinned.map((id) => items.find((i) => i.id === id)).filter((i): i is (typeof items)[number] => Boolean(i));
  const initials = (user.name ?? user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || meta.initials;

  const entry = (i: (typeof items)[number]): NavEntry => ({ id: i.id, href: i.href, label: i.label, ...(badges[i.id] ? { badge: badges[i.id] } : {}) });
  const navGroups: NavGroup[] = GROUPS.map((g) => ({ id: g.id, label: g.label, items: items.filter((i) => i.group === g.id).map(entry) })).filter((g) => g.items.length);

  const sidebar = (
    <>
      <div className="rail-center flex h-16 items-center gap-3 border-b border-slate-800 px-5 md:h-20">
        <WorkspaceSwitcher view={ws.view} views={accountFirst ? [ws.view] : ws.views} />
      </div>
      <div className="px-3 pt-4 md:hidden">
        <SearchButton wide />
      </div>
      <SidebarNav groups={navGroups} pinned={pinned.map(entry)} initialFolded={initialFolded} />
      <div className="space-y-1 border-t border-slate-800 p-3">
        <Link href="/portal/notifications" className={link} title="Notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <span className="relative shrink-0"><Bell className="h-4 w-4 text-slate-500" />{unread ? <span aria-hidden className="rail-only absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-600" /> : null}</span>
          <span className="rail-hide">Notifications</span>{unread ? <span className="rail-hide ml-auto rounded-full bg-blue-600 px-2 text-xs text-white">{unread}</span> : null}
        </Link>
        <Link href="/portal/account" className={link} title="Account and appearance" aria-label="Account and appearance">
          <UserCircle className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="rail-hide">Account and appearance</span>
        </Link>
        <div className="rail-center flex items-center gap-3 px-3 py-2" title={`${user.name ?? user.email} · ${meta.label}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{initials}</div>
          <div className="rail-hide min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user.name ?? user.email}</div>
            <div className="text-xs text-slate-500">{meta.label}</div>
          </div>
        </div>
        <form action={signOutAction} className="px-1">
          <button type="submit" className={`${link} w-full`} title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="rail-hide">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );

  const has = (id: string) => items.some((i) => i.id === id);
  const newItems: NewItem[] = NEW_ITEMS.filter((n) => has(n.section)).map(({ href, label, note, quick }) => ({ href, label, note, ...(quick ? { quick } : {}) }));
  const quickKinds = NEW_ITEMS.filter((n) => n.quick && has(n.section)).map((n) => n.quick!);
  const groupLabel = (g: string) => GROUPS.find((x) => x.id === g)?.label ?? "";

  const headerEnd = (
    <>
      <NewMenu items={newItems} />
      {items.some((i) => i.id === "assistant") ? (
        <Link href="/portal/assistant" className="hidden items-center gap-2 rounded-full border border-slate-700 py-1 pl-1 pr-3 text-sm text-slate-300 transition hover:border-blue-500 hover:text-white sm:flex" data-ask>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-400 text-[11px] font-bold text-white">{assistantName.slice(0, 1).toUpperCase()}</span>
          Ask {assistantName}
        </Link>
      ) : null}
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
    ...(accountFirst ? [] : ws.views.filter((v) => v !== ws.view)).map((v) => ({
      kind: "action" as const, label: `Switch to ${workspaceLabel(v)}`, href: `/portal/workspace/${v}`, hint: "Workspace",
    })),
    { kind: "page", label: "Notifications", href: "/portal/notifications", hint: "Go to" },
    { kind: "page", label: "Account and appearance", href: "/portal/account", hint: "Go to" },
    ...ACTIONS.filter((a) => items.some((i) => i.id === a.section)).map((a) => ({ kind: "action" as const, label: a.label, href: a.href, hint: a.hint })),
  ];

  return (
    <PortalFrame sidebar={sidebar} headerEnd={headerEnd} prefs={{ theme: prefs.theme, accent: prefs.accent, density: prefs.density }} initialRail={initialRail}>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Crumbs items={items.map((i) => ({ href: i.href, label: i.label, group: groupLabel(i.group) }))} workspace={workspaceLabel(ws.view)} />
      {children}
      <Shortcuts allowed={items.map((i) => i.href)} />
      <CommandPalette items={palette} />
      <QuickAddHost allowed={quickKinds} />
      <PortalGuard email={user.email} idleMinutes={IDLE_MINUTES} today={new Date().toISOString().slice(0, 10)} />
    </PortalFrame>
  );
}
