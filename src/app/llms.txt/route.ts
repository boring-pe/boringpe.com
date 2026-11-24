import { getSiteContent } from "@/lib/content";
import { buildLlmsTxt } from "@/lib/llms-calc";

const PERSONAL_HOSTS = ["rahulmane.com", "www.rahulmane.com"];

/** A guide to boringpe.com for AI assistants, in the llms.txt format, from the site's live wording. */
export async function GET(request: Request) {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (PERSONAL_HOSTS.includes(host)) return new Response("Not found", { status: 404 });
  const body = buildLlmsTxt(await getSiteContent("boringpe"));
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
