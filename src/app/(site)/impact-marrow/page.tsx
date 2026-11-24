import type { Metadata } from "next";
import { HandHeart } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, SeeAlso } from "../_components/page-shell";
import { firstSentence, seeAlso } from "../_components/see-also";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: "Impact Marrow · Boring PE", description: firstSentence(c.impactBody), alternates: { canonical: "/impact-marrow" } };
}

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="impact-marrow">
      <PageHero eyebrow="Beside Boring PE" title="Impact Marrow" body={c.impactBody} Icon={HandHeart} />
      <SeeAlso items={seeAlso(c, "/impact-marrow")} />
    </div>
  );
}
