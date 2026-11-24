import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Here = "build" | "co-build" | "own" | "studio" | "impact-marrow" | "about" | "media";

/**
 * Where a page sits in Boring PE: the three activities side by side, Studio underneath enabling
 * them, Impact Marrow beside the firm. The current page is lit; every box links to its page.
 */
export function StructureMap({ here }: { here: Here }) {
  const box = (key: Here, label: string, note?: string, extra = "") => {
    const on = here === key || (here === "about" && key !== "impact-marrow");
    return (
      <Link
        href={`/${key}`}
        aria-current={here === key ? "page" : undefined}
        className={`block min-w-0 rounded-md border px-2.5 py-2.5 transition-colors ${extra} ${
          on ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
        }`}
      >
        <span className="block whitespace-nowrap text-sm font-medium">{label}</span>
        {note ? <span className="mt-0.5 block text-[11px] leading-snug opacity-80">{note}</span> : null}
      </Link>
    );
  };
  return (
    <figure className="w-full max-w-md" aria-label="Where this sits in Boring PE" data-structure-map>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 rounded-lg border border-slate-800 p-3">
          <Link href="/about" className={`mb-3 block text-sm ${here === "about" ? "text-white" : "text-slate-300 hover:text-white"}`}>Boring PE</Link>
          <div className="grid grid-cols-3 gap-2">
            {box("build", "Build")}
            {box("co-build", "Co-Build")}
            {box("own", "Own")}
          </div>
          <div aria-hidden className="mx-6 h-3 border-x border-dashed border-slate-700" />
          {box("studio", "Studio", "finance, HR, legal, strategy and systems for all three")}
        </div>
        <div className="sm:w-32 sm:shrink-0 sm:self-stretch">
          {box("impact-marrow", "Impact Marrow", "beside the firm", "sm:h-full")}
        </div>
      </div>
      <figcaption className="mt-2 text-[11px] text-slate-500">Where this sits in Boring PE</figcaption>
    </figure>
  );
}

/** A page's opening: the title and its text on the left, the map of Boring PE on the right. */
export function PageHero({ title, lead, body, here }: { title: string; lead: string; body?: string; here: Here }) {
  return (
    <section className="pt-32 pb-14 md:pt-40 md:pb-20 px-6 border-b border-slate-800">
      <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">
        <div className="max-w-2xl">
          <h1 className="text-5xl md:text-6xl text-white mb-6">{title}</h1>
          <p className="text-xl md:text-2xl text-slate-200 leading-snug mb-5">{lead}</p>
          {body
            ? body.split(/\n\s*\n/).map((para, i) => (
                <p key={i} className="text-base md:text-lg text-slate-400 leading-relaxed mb-4 whitespace-pre-line">{para}</p>
              ))
            : null}
        </div>
        <StructureMap here={here} />
      </div>
    </section>
  );
}

/** One section of a page: its heading in the left rail, its content on the right, ruled off like a report. */
export function Rail({ title, intro, children, id }: { title: string; intro?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="px-6 border-b border-slate-800">
      <div className="max-w-6xl mx-auto grid gap-6 py-14 md:py-20 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 className="text-2xl md:text-3xl text-white">{title}</h2>
          {intro ? <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-xs">{intro}</p> : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/** Plain statements, each a short heading and a line of text, in two columns on wide screens. */
export function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
      {items.map((x) => (
        <div key={x.title} className="border-t border-slate-800 pt-4">
          <dt className="text-white font-medium">{x.title}</dt>
          <dd className="mt-1.5 text-slate-400 leading-relaxed">{x.body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A real sequence, in order. Numbered because the order matters. */
export function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="relative space-y-8 border-l border-slate-800 pl-8">
      {items.map((x, i) => (
        <li key={x.title} className="relative">
          <span aria-hidden className="absolute -left-[2.6rem] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-xs tabular-nums text-slate-300">{i + 1}</span>
          <h3 className="text-white font-medium">{x.title}</h3>
          <p className="mt-1.5 text-slate-400 leading-relaxed max-w-2xl">{x.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Two lists side by side, for a before-and-after or a give-and-get. */
export function TwoLists({ left, right }: { left: { title: string; items: string[] }; right: { title: string; items: string[] } }) {
  const list = (l: { title: string; items: string[] }, accent: boolean) => (
    <div className={`rounded-lg border p-6 ${accent ? "border-blue-500/40 bg-blue-500/5" : "border-slate-800"}`}>
      <h3 className="text-white font-medium mb-4">{l.title}</h3>
      <ul className="space-y-3">
        {l.items.map((it) => (
          <li key={it} className="flex gap-3 text-slate-300 leading-relaxed">
            <span aria-hidden className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent ? "bg-blue-400" : "bg-slate-500"}`} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
  return <div className="grid gap-4 md:grid-cols-2">{list(left, false)}{list(right, true)}</div>;
}

/** Questions people ask, each opening on click. */
export function Questions({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-slate-800 border-y border-slate-800">
      {items.map((x) => (
        <details key={x.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-white [&::-webkit-details-marker]:hidden">
            <span className="font-medium">{x.q}</span>
            <span aria-hidden className="mt-0.5 text-slate-500 transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-slate-400 leading-relaxed">{x.a}</p>
        </details>
      ))}
    </div>
  );
}

/** The closing invitation to get in touch. */
export function ContactBand({ title, body, label, email }: { title: string; body: string; label: string; email: string }) {
  return (
    <section className="px-6 border-b border-slate-800 bg-slate-900/40">
      <div className="max-w-6xl mx-auto grid gap-8 py-16 md:py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl text-white mb-4">{title}</h2>
          <p className="text-slate-400 leading-relaxed">{body}</p>
        </div>
        <div>
          <a href={`mailto:${email}`} className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-md transition-colors">
            {label}
          </a>
          <p className="mt-2 text-xs text-slate-500">or write to {email}</p>
        </div>
      </div>
    </section>
  );
}

/** Links to the other parts of the firm, at the foot of each page. */
export function SeeAlso({ items }: { items: { href: string; label: string; note: string }[] }) {
  return (
    <nav aria-label="More from Boring PE" className="px-6">
      <div className="max-w-6xl mx-auto grid divide-y divide-slate-800 py-6 md:grid-cols-3 md:divide-x md:divide-y-0">
        {items.map((x) => (
          <Link key={x.href} href={x.href} className="group block py-6 md:px-6 md:first:pl-0">
            <span className="flex items-center gap-2 text-white site-serif text-lg">{x.label}<ArrowRight aria-hidden className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" /></span>
            <span className="mt-1 block text-sm text-slate-400">{x.note}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
