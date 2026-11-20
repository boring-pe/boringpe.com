import React from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, Building2, Target, FolderKanban, 
  HeartHandshake, LogOut, Settings, Bell
} from 'lucide-react';

const navItems = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/portfolio', label: 'Portfolio (SPVs)', icon: Building2 },
  { href: '/portal/deals', label: 'Deal Pipeline', icon: Target },
  { href: '/portal/vault', label: 'BIDU Vault', icon: FolderKanban },
  { href: '/portal/marrow', label: 'Impact Marrow', icon: HeartHandshake },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="h-20 flex items-center gap-2 px-6 border-b border-slate-800">
          <Building2 className="w-7 h-7 text-blue-500" />
          <div>
            <div className="text-sm font-bold text-white">BORING PE</div>
            <div className="text-xs text-slate-500">Boring Portal</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
              BP
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Boring PE LLP</div>
              <div className="text-xs text-slate-500">Admin</div>
            </div>
            <Settings className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-semibold text-white">Enterprise Command</h1>
            <p className="text-xs text-slate-500">Real-time portfolio intelligence</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-md hover:bg-slate-800 transition-colors">
              <Bell className="w-5 h-5 text-slate-400" />
            </button>
            <a href="https://boringpe.com" className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" /> Exit Portal
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
