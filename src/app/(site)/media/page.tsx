import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, SeeAlso } from "../_components/page-shell";
import { firstSentence, seeAlso } from "../_components/see-also";

// Wording is editable from the portal (Super Admin > Site content); changes show within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: "Media · Boring PE", description: firstSentence(c.mediaBody), alternates: { canonical: "/media" } };
}

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="media">
      <PageHero eyebrow="Notes" title="Media" body={c.mediaBody} Icon={Newspaper} />
      <SeeAlso items={seeAlso(c, "/media")} />
    </div>
  );
}
