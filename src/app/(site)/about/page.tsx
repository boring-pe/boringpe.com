import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, Points, Rail, SeeAlso } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("About Us", "/about", "aboutBody");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="about">
      <PageHero here="about" title="About Us" lead={c.aboutBody} body={c.intro} />
      <Rail title="What we believe" intro="Fundamentals over hype. Enduring value over short-term trends.">
        <div className="space-y-5 max-w-2xl text-slate-300 leading-relaxed">
          <p>Successful enterprises are not built through ideas alone. They need the right combination of business model, capital, people, capabilities, systems and long-term execution.</p>
          <p>While others chase the next disruptive trend, we focus on the backbone of the economy: opportunities that solve real problems, serve enduring needs and create compounding economic value.</p>
        </div>
      </Rail>
      <Rail title="What we look for" intro="In every business we build, co-build or own.">
        <Points
          items={[
            { title: "Profitable", body: "Sustainable economic returns with proven cash flow." },
            { title: "Resilient", body: "Built to adapt and thrive in changing markets." },
            { title: "Scalable", body: "Systems designed for operational expansion." },
            { title: "Sustainable", body: "Long-term relevance and community value." },
          ]}
        />
      </Rail>
      <Rail title="Who is behind it">
        <p className="text-slate-300 leading-relaxed max-w-2xl">
          Boring PE is owned by{" "}
          <a href="https://rahulmane.com" className="text-blue-400 hover:text-blue-300 underline underline-offset-4">Rahul Mane</a>.
        </p>
      </Rail>
      <ContactBand title={c.foundersTitle} body={c.foundersBody} label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso items={seeAlso(c, "/about")} />
    </div>
  );
}
