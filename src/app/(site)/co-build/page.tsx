import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, SeeAlso } from "../_components/page-shell";
import { firstSentence, seeAlso } from "../_components/see-also";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: "Co-Build · Boring PE", description: firstSentence(c.coBuildBody), alternates: { canonical: "/co-build" } };
}

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="co-build">
      <PageHero eyebrow="Part of Boring PE · 2" title="Co-Build" body={c.coBuildBody} Icon={HeartHandshake} />
      <ContactBand title={c.foundersTitle} body={c.foundersBody} label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso items={seeAlso(c, "/co-build")} />
    </div>
  );
}
