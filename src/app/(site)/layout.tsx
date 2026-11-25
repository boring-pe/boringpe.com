import Link from "next/link";
import { Building2 } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { SiteNav } from "./_components/site-nav";
import { SITE_PAGES } from "./_components/pages";

/** The frame every public page shares: the menu at the top and the footer at the bottom. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const c = await getSiteContent("boringpe");
  return (
    <div className="site min-h-screen bg-slate-950 text-slate-50 selection:bg-blue-900 selection:text-white flex flex-col">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <footer className="py-16 px-6 bg-slate-950 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-6 h-6 text-blue-500" />
              <span className="text-lg font-bold text-white">BORING PE</span>
            </div>
            <p className="text-justify text-slate-500 text-sm max-w-sm mb-6">{c.footerTagline}</p>
            <p className="text-justify text-slate-600 text-xs">
              © {new Date().getFullYear()} Boring PE Venture. All Rights Reserved. Content may not be copied, republished or used to train AI models without permission.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Pages</h4>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-400">
              {SITE_PAGES.map(({ href, label }) => (
                <li key={href}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Internal</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="https://portal.boringpe.com" className="hover:text-white transition-colors">Portal Login</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
