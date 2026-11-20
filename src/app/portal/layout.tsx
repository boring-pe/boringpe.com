import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  LayoutDashboard,
  Building2,
  Target,
  FolderKanban,
  HeartHandshake,
  ShieldCheck,
  LogOut,
  Bell,
} from "lucide-react";
import { setPortalRole } from "./access/actions";
import {
  ROLE_META,
  allowedSections,
  parseRole,
  type SectionId,
} from "@/lib/rbac";

const ICONS: Record<SectionId, React.ElementType> = {
  dashboard: LayoutDashboard,
  portfolio: Building2,
  deals: Target,
  vault: FolderKanban,
  marrow: HeartHandshake,
  access: ShieldCheck,
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const role = parseRole(jar.get("bp_preview")?.value);
  const meta = ROLE_META[role];
  const items = allowedSections(role);

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

        <nav className="flex-1 px-3 py-6 space-y-1">
          {items.map((item) => {
            const Icon = ICONS[item.id];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
              {meta.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">Boring PE LLP</div>
              <div className="text-xs text-slate-500">{meta.label}</div>
            </div>
          </div>
          {role !== "superadmin" && (
            <form action={setPortalRole} className="px-3 pb-2">
              <input type="hidden" name="role" value="superadmin" />
              <button type="submit" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                Return to Super Admin
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-semibold text-white">Enterprise Command</h1>
            <p className="text-xs text-slate-500">
              {role === "superadmin"
                ? "Real-time portfolio intelligence"
                : `Viewing as ${meta.label}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-md hover:bg-slate-800 transition-colors">
              <Bell className="w-5 h-5 text-slate-400" />
            </button>
            <a
              href="https://boringpe.com"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <LogOut className="w-4 h-4" /> Exit Portal
            </a>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
