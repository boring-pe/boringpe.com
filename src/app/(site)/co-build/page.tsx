import { getSiteContent } from "@/lib/content";
import { CoBuildIllustration } from "../_components/illustrations";
import { ContactBand, PageHero, Questions, Rail, SeeAlso, Steps, TwoLists } from "../_components/page-shell";
import { pageMeta } from "../_components/meta";
import { seeAlso } from "../_components/see-also";

// The opening line and the founders text are editable from the portal (Super Admin > Site content).
export const revalidate = 60;
export const generateMetadata = () => pageMeta("Co-Build", "/co-build", "coBuildBody");

export default async function Page() {
  const c = await getSiteContent("boringpe");
  return (
    <div data-page="co-build">
      <PageHero art={<CoBuildIllustration className="w-full h-auto" />} title="Co-Build" lead={c.coBuildBody} body={c.foundersBody} />
      <Rail title="Who it is for" intro="Founders and owners of businesses that already work.">
        <TwoLists
          left={{
            title: "You bring",
            items: [
              "A business with customers and a track record",
              "Your knowledge of the market and the people in it",
              "The wish to grow without doing everything alone",
            ],
          }}
          right={{
            title: "Boring PE brings",
            items: [
              "Capital, on terms that keep you invested",
              "Finance, HR, legal and strategy support through Boring Stack",
              "Operating discipline and systems, from day one",
              "A partner for the long term",
            ],
          }}
        />
      </Rail>
      <Rail title="How it works" intro="Every Co-Build starts with a private conversation.">
        <Steps
          items={[
            { title: "A confidential conversation", body: "You tell us about the business and what you want for it. Nothing is shared without your agreement." },
            { title: "Understand the business together", body: "We look at the numbers, the people and the market with you, so both sides know what the partnership would build on." },
            { title: "Agree the partnership", body: "We set out who owns what, who does what and how decisions are made, in writing." },
            { title: "Plug into the Boring Stack", body: "From day one the business runs on Boring Stack's finance, HR, legal and strategy support." },
            { title: "Grow it together", body: "We work alongside you on the plan, review progress regularly and keep reinvesting in what works." },
          ]}
        />
      </Rail>
      <Rail title="Questions founders ask">
        <Questions
          items={[
            { q: "Do I have to sell my business?", a: "No. Co-Build is a partnership. You keep a real stake in what you built." },
            { q: "How is this different from private equity?", a: "Co-Build is meant as a better alternative to traditional private equity and to going it alone: it respects your legacy, keeps your skin in the game and gives the business institutional support from the start." },
            { q: "Is the first conversation confidential?", a: "Yes. What you share stays with us unless you agree otherwise." },
            { q: "How do I start?", a: `Write to ${c.contactEmail}. Tell us a little about the business and we will set up a time to talk.` },
          ]}
        />
      </Rail>
      <ContactBand title={c.foundersTitle} body="Tell us about your business. The first conversation is confidential and commits you to nothing." label={c.ctaLabel} email={c.contactEmail} />
      <SeeAlso here="co-build" items={seeAlso(c, "/co-build")} />
    </div>
  );
}
