import Link from "next/link";
import { VERTICALS } from "@/lib/ops-fields";

/** Chips to show one vertical's records, keeping the rest of the address. */
export function VerticalFilter({ base, current, extra = "" }: { base: string; current: string | null; extra?: string }) {
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-blue-500 bg-blue-500/10 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`;
  const href = (v: string) => `${base}?${[extra, v ? `vertical=${v}` : ""].filter(Boolean).join("&")}`.replace(/\?$/, "");
  return (
    <nav aria-label="Vertical" className="flex flex-wrap gap-2" data-vertical-filter>
      <Link href={href("")} className={chip(!current)}>All verticals</Link>
      {VERTICALS.map((v) => <Link key={v.id} href={href(v.id)} className={chip(current === v.id)}>{v.label}</Link>)}
    </nav>
  );
}
