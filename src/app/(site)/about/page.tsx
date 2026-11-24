import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, SeeAlso } from "../_components/page-shell";
import { Philosophy } from "../_components/philosophy";
import { firstSentence, seeAlso } from "../_components/see-also";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: "About Us · Boring PE", description: firstSentence(c.aboutBody), alternates: { canonical: "/about" } };
}

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="about">
      <PageHero eyebrow="The firm" title="About Us" body={c.aboutBody} Icon={Building2} />
      <Philosophy />
      <ContactBand title={c.foundersTitle} body={c.foundersBody} label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso items={seeAlso(c, "/about")} />
    </div>
  );
}
