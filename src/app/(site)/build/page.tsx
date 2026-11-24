import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, SeeAlso } from "../_components/page-shell";
import { firstSentence, seeAlso } from "../_components/see-also";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: "Build · Boring PE", description: firstSentence(c.buildBody), alternates: { canonical: "/build" } };
}

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="build">
      <PageHero eyebrow="Part of Boring PE · 1" title="Build" body={c.buildBody} Icon={Building2} />
      <ContactBand title={c.foundersTitle} body={c.foundersBody} label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso items={seeAlso(c, "/build")} />
    </div>
  );
}
