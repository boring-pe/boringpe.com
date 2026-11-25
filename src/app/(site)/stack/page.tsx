import { getSiteContent } from "@/lib/content";
import { StackIllustration } from "../_components/illustrations";
import { ContactBand, PageHero, Points, Rail, SeeAlso, Steps, TwoLists } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Boring Stack", "/stack", "enableBody");

const ADVISORY_LINK = "/connect?topic=Founder%20advisory";

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="stack">
      <PageHero
        art={<StackIllustration className="w-full h-auto" />}
        title="Boring Stack"
        lead={c.enableBody}
        body="The Boring Stack is part of Boring PE itself, not a separate company. It runs the shared work every business needs, and it is where Rahul Mane shares what he has learned with founders outside the firm."
      />
      <Rail title="What the Stack provides" intro="Institutional-grade support, shared across every Boring PE business.">
        <Points
          items={[
            { title: "Finance", body: "Books, invoicing, payments, reporting and cash planning, kept to one standard across every business." },
            { title: "People", body: "Hiring, onboarding, payroll and policies, so teams are set up properly from the first hire." },
            { title: "Legal", body: "Agreements, compliance and company records, handled carefully and kept in one place." },
            { title: "Strategy", body: "Plans, numbers and regular reviews that keep each business pointed at durable growth." },
            { title: "Systems", body: "The Boring PE portal and the tools behind it: one place for records, reports and approvals." },
            { title: "Founder advisory", body: "Rahul Mane's consulting, mentoring and enablement strategy, open to founders outside Boring PE." },
          ]}
        />
      </Rail>
      <Rail title="Who the Stack serves" intro="Every part of Boring PE runs on it.">
        <TwoLists
          left={{ title: "Inside Boring PE", items: ["Build: businesses Boring PE starts", "Co-Build: businesses grown with founders", "Own: stakes Boring PE holds"] }}
          right={{ title: "Outside Boring PE", items: ["Founders who want Rahul Mane's advice, mentoring or an enablement strategy", "Chambers, incubators and founder groups looking for talks and workshops"] }}
        />
      </Rail>

      <Rail id="advisory" title="Founder advisory" intro="Rahul Mane shares his expertise with founders: consulting, mentoring, advice and enablement strategy.">
        <div className="space-y-12">
          <div>
            <h3 className="text-white font-medium mb-5">What Rahul advises on</h3>
            <Points
              items={[
                { title: "Business model and economics", body: "How the business earns, what it costs to run, and where its cash flow will come from." },
                { title: "The operating stack", body: "Setting up finance, people, legal and systems so the business runs on more than the founder's memory." },
                { title: "Growing steadily", body: "Choosing where to grow, what to measure and what to say no to, so growth pays for itself." },
                { title: "Partners and capital readiness", body: "Getting the numbers, structure and story ready before taking on a partner or raising money." },
                { title: "Founder decisions", body: "Hiring, delegating, pricing and the hard calls that come with running a business." },
              ]}
            />
          </div>
          <div>
            <h3 className="text-white font-medium mb-5">Ways to work with Rahul</h3>
            <Points
              items={[
                { title: "Advisory call", body: "One focused session on a specific question, with clear next steps at the end." },
                { title: "Mentoring", body: "A regular monthly session over an agreed period, with notes and follow-ups between sessions." },
                { title: "Enablement strategy", body: "A fixed-scope engagement: a review of the business and a written plan for its finance, people, systems and growth." },
                { title: "Talks and workshops", body: "Sessions for chambers, incubators and founder groups on building durable businesses." },
              ]}
            />
            <p className="mt-6 text-sm text-slate-400">Pricing is on request and depends on the format and scope.</p>
          </div>
          <div>
            <h3 className="text-white font-medium mb-5">How it works</h3>
            <Steps
              items={[
                { title: "Request a conversation", body: "Pick a time and tell us briefly about your business and what you want help with." },
                { title: "A short introductory call", body: "We check the fit and suggest the format that suits your question." },
                { title: "Agree the scope", body: "Format, sessions, timing and fee are agreed in writing before any work starts." },
                { title: "Work together", body: "Sessions, notes and follow-ups, with progress reviewed as you go." },
              ]}
            />
          </div>
          <div className="rounded-lg border border-slate-800 p-6 text-sm text-slate-400 leading-relaxed" data-advisory-terms>
            <h3 className="text-white font-medium mb-2">Good to know</h3>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>What you share stays confidential.</li>
              <li>Advice covers business strategy and operations. It is not investment advice on securities, and it does not replace a lawyer&apos;s or chartered accountant&apos;s formal opinion.</li>
              <li>Advisory is independent of Boring PE&apos;s investing. If a Co-Build or investment ever makes sense later, it is raised openly and only goes ahead with your agreement.</li>
            </ul>
          </div>
        </div>
      </Rail>

      <ContactBand
        title="Talk to Rahul about your business"
        body="Choose a time for a first conversation about advisory, mentoring or an enablement strategy."
        label="Request a conversation"
        email={c.contactEmail}
        href={ADVISORY_LINK}
      />
      <SeeAlso here="stack" items={seeAlso(c, "/stack")} />
    </div>
  );
}
