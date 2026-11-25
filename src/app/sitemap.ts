import type { MetadataRoute } from "next";

const PAGES = ["", "/build", "/co-build", "/own", "/stack", "/impact-marrow", "/media", "/about", "/connect"];

/** The public pages of boringpe.com, for search engines. The portal is never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `https://boringpe.com${p}`, changeFrequency: "monthly", priority: p ? 0.7 : 1 }));
}
