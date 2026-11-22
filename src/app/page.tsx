import React from 'react';
import { getSiteContent } from '@/lib/content';
import { Building2, HeartHandshake, ArrowRight, ShieldCheck, TrendingUp, Users } from 'lucide-react';

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export default async function Home() {
  const c = await getSiteContent('boringpe');
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-blue-900 selection:text-white">
      
      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-8 h-8 text-blue-500" />
            <span className="text-xl font-bold tracking-tight text-white">BORING PE</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#framework" className="hover:text-white transition-colors">The Framework</a>
            <a href="#founders" className="hover:text-white transition-colors">For Founders</a>
            <a href="#about" className="hover:text-white transition-colors">About Us</a>
          </div>
          <a 
            href="https://portal.boringpe.com" 
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-all flex items-center gap-2"
          >
            Portal Login <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-32 pb-20 md:pt-48 md:pb-32 px-6 border-b border-slate-800">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-400 text-xs font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {c.badge}
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 leading-tight">
            {c.headlineLead} <span className="text-blue-500">{c.headlineAccent}</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            {c.intro}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#framework" className="px-8 py-4 bg-white text-slate-950 font-semibold rounded-md hover:bg-slate-200 transition-colors w-full sm:w-auto">
              Explore Our Framework
            </a>
            <a href="#founders" className="px-8 py-4 bg-slate-900 border border-slate-700 text-white font-semibold rounded-md hover:bg-slate-800 transition-colors w-full sm:w-auto">
              Partner With Us
            </a>
          </div>
        </div>
      </section>

      {/* --- PHILOSOPHY --- */}
      <section className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Fundamentals Over Hype.<br/>Enduring Value Over Short-Term Trends.</h2>
            <p className="text-slate-400 leading-relaxed mb-6">
              We believe that successful enterprises are not built through ideas alone. They require the right combination of business models, capital, people, capabilities, systems, and long-term execution.
            </p>
            <p className="text-slate-400 leading-relaxed">
              While others chase the next disruptive trend, we focus on the backbone of the economy. We identify opportunities that solve real problems, serve enduring needs, and create compounding economic value.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg">
              <TrendingUp className="w-8 h-8 text-blue-500 mb-4" />
              <h3 className="font-semibold text-white mb-2">Profitable</h3>
              <p className="text-sm text-slate-400">Sustainable economic returns with proven cash flow.</p>
            </div>
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg mt-8">
              <ShieldCheck className="w-8 h-8 text-blue-500 mb-4" />
              <h3 className="font-semibold text-white mb-2">Resilient</h3>
              <p className="text-sm text-slate-400">Built to adapt and thrive in changing markets.</p>
            </div>
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg">
              <Users className="w-8 h-8 text-blue-500 mb-4" />
              <h3 className="font-semibold text-white mb-2">Scalable</h3>
              <p className="text-sm text-slate-400">Systems designed for operational expansion.</p>
            </div>
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg mt-8">
              <HeartHandshake className="w-8 h-8 text-blue-500 mb-4" />
              <h3 className="font-semibold text-white mb-2">Sustainable</h3>
              <p className="text-sm text-slate-400">Long-term relevance and community value.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- THE FRAMEWORK --- */}
      <section id="framework" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">Boring PE</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Build, Co-Build and Own</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Three separate activities of Boring PE. They are not Business Studio, and they are not mixed with each other.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: '1', name: 'Build', body: c.buildBody, Icon: Building2 },
              { n: '2', name: 'Co-Build', body: c.coBuildBody, Icon: HeartHandshake },
              { n: '3', name: 'Own', body: c.ownBody, Icon: ShieldCheck },
            ].map(({ n, name, body, Icon }) => (
              <div key={name} className="p-8 bg-slate-900 border border-slate-800 rounded-xl">
                <Icon className="w-10 h-10 text-blue-500 mb-6" />
                <div className="text-xs font-semibold text-blue-400 mb-1">Part of Boring PE · {n}</div>
                <h3 className="text-xl font-bold text-white mb-3">{name}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 p-8 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div className="text-xs font-semibold text-slate-500 mb-1">Separate from the three</div>
            <h3 className="text-xl font-bold text-white mb-3">Enable · Business House</h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">{c.enableBody}</p>
          </div>
        </div>
      </section>

      {/* --- FOR FOUNDERS --- */}
      <section id="founders" className="py-24 px-6 bg-blue-950/20 border-y border-slate-800">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">{c.foundersTitle}</h2>
          <p className="text-slate-400 text-lg mb-12 max-w-3xl mx-auto">
            {c.foundersBody}
          </p>
          <a 
            href={`mailto:${c.contactEmail}`} 
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-all"
          >
            {c.ctaLabel} <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-16 px-6 bg-slate-950 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-6 h-6 text-blue-500" />
              <span className="text-lg font-bold text-white">BORING PE</span>
            </div>
            <p className="text-slate-500 text-sm max-w-sm mb-6">
              {c.footerTagline}
            </p>
            <p className="text-slate-600 text-xs">© {new Date().getFullYear()} Boring PE Venture. All Rights Reserved.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Enterprise</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="#framework" className="hover:text-white transition-colors">The Framework</a></li>
              <li><a href="#founders" className="hover:text-white transition-colors">For Founders</a></li>
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Internal</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="https://portal.boringpe.com" className="hover:text-white transition-colors">Boring Portal Login</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
      </footer>

    </div>
  );
}
