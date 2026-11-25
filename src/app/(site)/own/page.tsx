import { getSiteContent } from "@/lib/content";
import { OwnIllustration } from "../_components/illustrations";
import { ContactBand, PageHero, Points, Rail, SeeAlso, Steps } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Own", "/own", "ownBody");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="own">
      <PageHero
        art={<OwnIllustration className="w-full h-auto" />}
        title="Own"
        lead={c.ownBody}
        body="Own is how Boring PE holds stakes in good businesses it did not start: buying in, keeping the business steady and letting it compound."
      />
      <Rail title="What we look for" intro="Four qualities, the same ones we build for.">
        <Points
          items={[
            { title: "Profitable", body: "Sustainable economic returns with proven cash flow." },
            { title: "Resilient", body: "Built to adapt and keep working when markets change." },
            { title: "Scalable", body: "Systems that let the business grow without breaking." },
            { title: "Sustainable", body: "Long-term relevance to customers and the community." },
          ]}
        />
      </Rail>
      <Rail title="After we own a stake" intro="Ownership is the start of the work, not the end.">
        <Steps
          items={[
            { title: "Keep what works", body: "We learn how the business runs before changing anything, and protect its customers and people." },
            { title: "Add Studio where it helps", body: "Finance, HR, legal and strategy support from Boring Studio take load off the team." },
            { title: "Hold for the long term", body: "We measure progress in years and reinvest cash flow where it compounds." },
          ]}
        />
      </Rail>
      <ContactBand title="Thinking about the future of your business?" body="If you own a business like this and are thinking about what comes next, we would like to talk." label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso here="own" items={seeAlso(c, "/own")} />
    </div>
  );
}
