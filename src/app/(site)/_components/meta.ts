import type { Metadata } from "next";
import { getSiteContent } from "@/lib/content";
import { firstSentence } from "./see-also";

/** Title, description and canonical address for a public page, from the site's own wording. */
export async function pageMeta(title: string, path: string, bodyKey: string): Promise<Metadata> {
  const c = await getSiteContent("boringpe");
  return { title: `${title} · Boring PE`, description: firstSentence(c[bodyKey] ?? ""), alternates: { canonical: path } };
}
