import { getSiteContent } from "@/lib/content";
import { AdvisoryIllustration } from "../_components/illustrations";
import { ContactBand, PageHero, Points, Rail, SeeAlso, Steps } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line is editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Boring Stack: Rahul Mane", "/stack", "stackBody");

const ADVISORY_LINK = "/connect?topic=Founder%20advisory";

export default async function Page() {
  const [c, r] = await Promise.all([getSiteContent("boringpe"), getSiteContent("rahulmane")]);
  const bio = (r.bio ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div data-page="stack">
      <PageHero art={<AdvisoryIllustration className="w-full h-auto" />} title="Boring Stack" lead={c.stackBody} />
      <Rail title={r.name || "Rahul Mane"} intro={r.tagline}>
        <div className="space-y-4 max-w-2xl text-slate-300 leading-relaxed" data-about-rahul>
          {bio.map((p, k) => <p key={k}>{p}</p>)}
          <p>
            <a href="https://rahulmane.com" className="text-blue-400 hover:text-blue-300 underline underline-offset-4">More at rahulmane.com</a>
          </p>
        </div>
      </Rail>

      <Rail id="advisory" title="Work with Rahul" intro="Consulting, mentoring, advice and enablement strategy for founders.">
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
