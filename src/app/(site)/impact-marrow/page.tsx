import { getSiteContent } from "@/lib/content";
import { ImpactIllustration } from "../_components/illustrations";
import { PageHero, Points, Rail, SeeAlso } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Impact Marrow", "/impact-marrow", "impactTagline");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="impact-marrow">
      <PageHero art={<ImpactIllustration className="w-full h-auto" />} title="Impact Marrow" lead={c.impactTagline} body={c.impactBody} />
      <Rail title="How it is set up" intro="Beside the firm, with its own purpose.">
        <Points
          items={[
            { title: "Funded by Rahul Mane", body: "Rahul Mane contributes to Impact Marrow personally." },
            { title: "Funded by Boring PE", body: "Boring PE contributes through Impact Marrow's own fund." },
            { title: "Separate from the business", body: "Impact Marrow is not Build, Co-Build, Own or the Boring Stack, and it is not run for profit." },
            { title: "Social and economic", body: "Its work aims at lasting social and economic value in the communities it serves." },
          ]}
        />
      </Rail>
      <SeeAlso here="impact-marrow" items={seeAlso(c, "/impact-marrow")} />
    </div>
  );
}
