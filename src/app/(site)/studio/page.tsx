import { getSiteContent } from "@/lib/content";
import { ContactBand, PageHero, Points, Rail, SeeAlso, TwoLists } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Studio", "/studio", "enableBody");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="studio">
      <PageHero
        here="studio"
        title="Boring Studio"
        lead={c.enableBody}
        body="Studio is part of Boring PE itself, not a separate company. It runs the shared work every business needs, so each team can spend its time on customers."
      />
      <Rail title="What Studio provides" intro="Institutional-grade support, shared across every business.">
        <Points
          items={[
            { title: "Finance", body: "Books, invoicing, payments, reporting and cash planning, kept to one standard across every business." },
            { title: "People", body: "Hiring, onboarding, payroll and policies, so teams are set up properly from the first hire." },
            { title: "Legal", body: "Agreements, compliance and company records, handled carefully and kept in one place." },
            { title: "Strategy", body: "Plans, numbers and regular reviews that keep each business pointed at durable growth." },
            { title: "Systems", body: "The Boring PE portal and the tools behind it: one place for records, reports and approvals." },
          ]}
        />
      </Rail>
      <Rail title="Who Studio serves" intro="Every part of Boring PE runs on it.">
        <TwoLists
          left={{ title: "The three activities", items: ["Build: businesses Boring PE starts", "Co-Build: businesses grown with founders", "Own: stakes Boring PE holds"] }}
          right={{ title: "What they get", items: ["Support from the first day, not after the first crisis", "One standard for numbers, people and paperwork", "More time for customers and the work itself"] }}
        />
      </Rail>
      <ContactBand title={c.foundersTitle} body="Co-Build partners plug into Studio from the first day." label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso items={seeAlso(c, "/studio")} />
    </div>
  );
}
