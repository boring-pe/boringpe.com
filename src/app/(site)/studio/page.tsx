import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, SeeAlso } from "../_components/page-shell";
import { firstSentence, seeAlso } from "../_components/see-also";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: "Studio · Boring PE", description: firstSentence(c.enableBody), alternates: { canonical: "/studio" } };
}

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="studio">
      <PageHero eyebrow="Enables Boring PE" title="Studio" body={c.enableBody} Icon={Sparkles} />
      <ContactBand title={c.foundersTitle} body={c.foundersBody} label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso items={seeAlso(c, "/studio")} />
    </div>
  );
}
