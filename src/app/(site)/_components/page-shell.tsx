import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** A page's opening: a small label, the title and its text. A blank line in the text starts a new paragraph. */
export function PageHero({ eyebrow, title, body, Icon }: { eyebrow: string; title: string; body: string; Icon?: React.ElementType }) {
  return (
    <section className="pt-36 pb-16 md:pt-44 md:pb-20 px-6 border-b border-slate-800">
      <div className="max-w-3xl mx-auto">
        {Icon ? <Icon className="w-10 h-10 text-blue-500 mb-6" /> : null}
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-blue-400 mb-3">{eyebrow}</p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">{title}</h1>
        {body.split(/\n\s*\n/).map((para, i) => (
          <p key={i} className="text-lg text-slate-400 leading-relaxed mb-4 whitespace-pre-line">{para}</p>
        ))}
      </div>
    </section>
  );
}

/** The closing invitation to get in touch. */
export function ContactBand({ title, body, label, email }: { title: string; body: string; label: string; email: string }) {
  return (
    <section className="py-20 px-6 bg-blue-950/20 border-b border-slate-800">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-white mb-4">{title}</h2>
        <p className="text-slate-400 mb-8">{body}</p>
        <a href={`mailto:${email}`} className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-all">
          {label} <ArrowRight className="w-5 h-5" />
        </a>
      </div>
    </section>
  );
}

/** Links to the other parts of the firm, at the foot of each page. */
export function SeeAlso({ items }: { items: { href: string; label: string; note: string }[] }) {
  return (
    <section className="py-16 px-6">
      <div className="max-w-5xl mx-auto grid gap-4 md:grid-cols-3">
        {items.map((x) => (
          <Link key={x.href} href={x.href} className="group p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-600 transition-colors">
            <div className="flex items-center justify-between text-white font-semibold">{x.label}<ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400" /></div>
            <p className="mt-2 text-sm text-slate-400">{x.note}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
