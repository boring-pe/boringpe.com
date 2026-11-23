import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getSiteContent } from "@/lib/content";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("rahulmane");
  return {
    title: c.name,
    description: c.tagline,
  };
}

export default async function RahulManePage() {
  const c = await getSiteContent("rahulmane");
  const paragraphs = c.bio.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-6 py-24 selection:bg-blue-900 selection:text-white">
      <div className="max-w-2xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">{c.tagline}</p>
        <h1 className="mt-4 text-5xl md:text-6xl font-bold tracking-tight text-white">{c.name}</h1>

        {paragraphs.length > 0 ? (
          <section className="mt-10 space-y-4 text-lg leading-relaxed text-slate-300" aria-label="About">
            {paragraphs.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </section>
        ) : null}

        {c.commerceNote ? (
          <p className="mt-10 border-l-2 border-blue-500 pl-4 text-slate-400">{c.commerceNote}</p>
        ) : null}

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <a
            href="https://boringpe.com"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Boring PE <ArrowRight className="w-4 h-4" />
          </a>
          {c.contactEmail ? (
            <a
              href={`mailto:${c.contactEmail}`}
              className="rounded-md border border-slate-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
            >
              Get in touch
            </a>
          ) : null}
        </div>
        <p className="mt-16 text-xs text-slate-600">© {new Date().getFullYear()} Rahul Mane. All rights reserved. Content on this site may not be copied, republished or used to train AI models without permission.</p>
      </div>
    </main>
  );
}
