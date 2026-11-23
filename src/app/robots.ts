import type { MetadataRoute } from "next";
import { TRAINING_CRAWLERS } from "@/lib/security-calc";

/** Search engines may read the public site; AI-training crawlers and site copiers may not. The portal is never crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: TRAINING_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/portal", "/api"] },
    ],
  };
}
