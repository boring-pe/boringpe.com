import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  LayoutDashboard,
  Building2,
  Target,
  FolderKanban,
  HeartHandshake,
  ShieldCheck,
  UserCircle,
  LogOut,
  Crown,
  FileText,
  ClipboardCheck,
  Lock,
  Wallet,
  ListChecks,
} from "lucide-react";
import { requireUser } from "@/lib/dal";
import { GROUPS, ROLE_META, allowedSections, type SectionId } from "@/lib/rbac";
import { signOutAction } from "./sign-out";

export const metadata: Metadata = {
  title: "Boring Portal",
  robots: { index: false, follow: false },
};

const ICONS: Record<SectionId, React.ElementType> = {
  console: Crown,
  content: FileText,
  approvals: ClipboardCheck,
  personal: Lock,
  dashboard: LayoutDashboard,
  portfolio: Building2,
  deals: Target,
  money: Wallet,
  tasks: ListChecks,
  vault: FolderKanban,
  marrow: HeartHandshake,
  access: ShieldCheck,
};

const link =
  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const meta = ROLE_META[user.role];
  // Until a temporary password is replaced, the only open page is Account.
  const items = user.must_change_password ? [] : allowedSections(user.role);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-20 flex items-center gap-2 px-6 border-b border-slate-800">
          <Building2 className="w-7 h-7 text-blue-500" />
          <div>
            <div className="text-sm font-bold text-white">BORING PE</div>
            <div className="text-xs text-slate-500">Boring Portal</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {GROUPS.map((group) => {
            const inGroup = items.filter((item) => item.group === group.id);
            if (inGroup.length === 0) return null;
            return (
              <div key={group.id} className="space-y-1">
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  {group.label}
                </div>
                {inGroup.map((item) => {
                  const Icon = ICONS[item.id];
                  return (
                    <Link key={item.href} href={item.href} className={link}>
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link href="/portal/account" className={link}>
            <UserCircle className="w-4 h-4" />
            Account
          </Link>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
              {meta.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name ?? user.email}</div>
              <div className="text-xs text-slate-500">{meta.label}</div>
            </div>
          </div>
          <form action={signOutAction} className="px-1">
            <button type="submit" className={`${link} w-full`}>
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-semibold text-white">Enterprise Command</h1>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <a href="https://boringpe.com" className="text-sm text-slate-400 hover:text-white">
            boringpe.com
          </a>
        </header>

        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
