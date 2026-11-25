import React from 'react';
import { getSiteContent } from '@/lib/content';
import Link from 'next/link';
import { Building2, HeartHandshake, ArrowRight, ShieldCheck } from 'lucide-react';
import { Philosophy } from './_components/philosophy';

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;


export default async function Home() {
  const c = await getSiteContent('boringpe');
  return (
    <div data-page="home">
      
      {/* --- HERO SECTION --- */}
      <section id="top" className="scroll-mt-24 pt-32 pb-20 md:pt-48 md:pb-32 px-6 border-b border-slate-800">
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
          <div className="flex items-center justify-center">
            <Link href="/studio" className="px-8 py-4 bg-white text-slate-950 font-semibold rounded-md hover:bg-slate-200 transition-colors">
              Explore Our Boring Studio
            </Link>
          </div>
        </div>
      </section>

      <Philosophy />

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
              { id: "build", n: "1", name: "Build", body: c.buildBody, Icon: Building2 },
              { id: "co-build", n: "2", name: "Co-Build", body: c.coBuildBody, Icon: HeartHandshake },
              { id: "own", n: "3", name: "Own", body: c.ownBody, Icon: ShieldCheck },
            ].map(({ id, n, name, body, Icon }) => (
              <Link key={name} id={id} href={`/${id}`} className="group scroll-mt-28 p-8 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-600 transition-colors">
                <Icon className="w-10 h-10 text-blue-500 mb-6" />
                <div className="text-xs font-semibold text-blue-400 mb-1">Part of Boring PE · {n}</div>
                <h3 className="text-xl font-bold text-white mb-3">{name}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-blue-400 group-hover:text-blue-300">Read more <ArrowRight className="w-4 h-4" /></span>
              </Link>
            ))}
          </div>

          <Link id="studio" href="/studio" className="group block scroll-mt-28 mt-6 p-8 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-600 transition-colors">
            <div className="text-xs font-semibold text-slate-500 mb-1">Separate from the three</div>
            <h3 className="text-xl font-bold text-white mb-3">Studio</h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">{c.enableBody}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-blue-400 group-hover:text-blue-300">Read more <ArrowRight className="w-4 h-4" /></span>
          </Link>
        </div>
      </section>

      <section className="py-16 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid gap-6 md:grid-cols-3">
          {[
            { href: "/impact-marrow", eyebrow: "Beside Boring PE", name: "Impact Marrow", body: c.impactTagline },
            { href: "/media", eyebrow: "Notes", name: "Media", body: c.mediaBody },
            { href: "/about", eyebrow: "The firm", name: "About Us", body: c.aboutBody },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="group p-8 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-slate-600 transition-colors">
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">{x.eyebrow}</p>
              <h3 className="text-xl font-bold text-white mb-3">{x.name}</h3>
              <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">{x.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-blue-400 group-hover:text-blue-300">Read more <ArrowRight className="w-4 h-4" /></span>
            </Link>
          ))}
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

    </div>
  );
}
