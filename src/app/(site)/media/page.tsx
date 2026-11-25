import { getSiteContent } from "@/lib/content";
import { MediaIllustration } from "../_components/illustrations";
import { PageHero, Rail, SeeAlso } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Media", "/media", "mediaBody");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="media">
      <PageHero art={<MediaIllustration className="w-full h-auto" />} title="Media" lead={c.mediaBody} />
      <Rail title="Announcements">
        <p className="text-slate-400 leading-relaxed max-w-2xl">Nothing has been announced yet. New announcements will appear here first.</p>
      </Rail>
      <Rail title="Press">
        <p className="text-slate-400 leading-relaxed max-w-2xl">
          For press questions, write to{" "}
          <a href={`mailto:${c.contactEmail}`} className="text-blue-400 hover:text-blue-300 underline underline-offset-4">{c.contactEmail}</a>.
        </p>
      </Rail>
      <SeeAlso here="media" items={seeAlso(c, "/media")} />
    </div>
  );
}
