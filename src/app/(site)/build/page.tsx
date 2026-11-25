import { getSiteContent } from "@/lib/content";
import { BuildIllustration } from "../_components/illustrations";
import { ContactBand, PageHero, Points, Rail, SeeAlso, Steps } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Build", "/build", "buildBody");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="build">
      <PageHero
        art={<BuildIllustration className="w-full h-auto" />}
        title="Build"
        lead={c.buildBody}
        body="Build is where Boring PE starts businesses of its own: companies that do necessary work well, earn from the start and keep earning."
      />
      <Rail title="What we build" intro="The backbone of the economy, not the next trend.">
        <Points
          items={[
            { title: "Essential work", body: "Services and operations that other businesses and households rely on every day, whatever the market is doing." },
            { title: "Real problems", body: "Each business starts from a need people already pay to have met, not from an idea looking for a market." },
            { title: "Cash flow first", body: "A business is designed to earn from its early days, so its growth is paid for by its own customers." },
            { title: "Built to last", body: "Models, people and systems chosen for decades of steady work rather than a quick exit." },
          ]}
        />
      </Rail>
      <Rail title="How a Build business comes together" intro="The same sequence each time, so every business starts on solid ground.">
        <Steps
          items={[
            { title: "Find a lasting need", body: "We look for work that is needed in every economic cycle and is underserved or poorly run today." },
            { title: "Design the business model", body: "We work out how the business earns, what it costs to run and how it grows before anything is spent." },
            { title: "Set it up on the Boring Stack", body: "Finance, HR, legal, strategy and systems come from Boring Stack, so the new team can focus on customers from the first day." },
            { title: "Run it for steady growth", body: "We put people in place, measure what matters and reinvest cash flow where it compounds." },
          ]}
        />
      </Rail>
      <ContactBand title="Want to build with us?" body="If you run an operation or know a market that fits, we would like to hear from you." label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso here="build" items={seeAlso(c, "/build")} />
    </div>
  );
}
