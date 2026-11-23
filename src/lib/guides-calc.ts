// Pure: the everyday workflows, step by step, and how far along each one is. No imports.

export type Facts = Record<string, number | boolean>;
export type Step = { title: string; why: string; href: string; section: string; done?: (f: Facts) => boolean };
export type Guide = { id: string; title: string; summary: string; steps: Step[]; ownerOnly?: boolean };

const n = (f: Facts, k: string) => Number(f[k] ?? 0);

export const GUIDES: Guide[] = [
  {
    id: "setup", title: "Set up the portal", ownerOnly: true,
    summary: "Secure it, connect the tools, bring in the team and keep a backup.",
    steps: [
      { title: "Turn on two-step sign-in for yourself", why: "Your account can open everything.", href: "/portal/account?enroll=1", section: "personal", done: (f) => Boolean(f.myTwoStep) },
      { title: "Add INTEGRATIONS_KEY in Vercel", why: "Seals saved keys and passwords with their own key.", href: "/portal/console", section: "console", done: (f) => Boolean(f.integrationsKey) },
      { title: "Connect an AI service for the assistant", why: "Claude, OpenAI, Gemini or your own.", href: "/portal/integrations", section: "integrations", done: (f) => n(f, "aiServices") > 0 },
      { title: "Connect email sending (Resend)", why: "Invoices, KYC links and notices go out by email.", href: "/portal/integrations", section: "integrations", done: (f) => Boolean(f.resend) },
      { title: "Connect your mailbox and calendar", why: "One inbox and agenda inside the portal.", href: "/portal/inbox?view=accounts", section: "inbox", done: (f) => n(f, "mailboxes") > 0 },
      { title: "Invite the team", why: "Each person gets a role and their workspaces.", href: "/portal/access", section: "access", done: (f) => n(f, "seats") > 1 },
      { title: "Require two-step sign-in for Admins", why: "Admins can post to the books.", href: "/portal/access", section: "access", done: (f) => Boolean(f.adminsTwoStep) },
      { title: "Take the first encrypted backup", why: "Keep the passphrase apart from the file.", href: "/portal/console", section: "console", done: (f) => n(f, "backups") > 0 },
    ],
  },
  {
    id: "bill", title: "Bill a customer and get paid",
    summary: "From a contact to cash in the bank, with GST and the books kept in step.",
    steps: [
      { title: "Add the customer as a contact", why: "With GSTIN and state for the right tax.", href: "/portal/deals", section: "deals", done: (f) => n(f, "parties") > 0 },
      { title: "Draft the invoice", why: "Lines, HSN/SAC and GST worked out for you.", href: "/portal/invoices?view=new", section: "invoices", done: (f) => n(f, "invoices") > 0 },
      { title: "Issue it", why: "It gets its number and posts to the books.", href: "/portal/invoices", section: "invoices", done: (f) => n(f, "issued") > 0 },
      { title: "Send a payment link or chase it", why: "Razorpay link, or a reminder from the assistant.", href: "/portal/invoices?view=receivables", section: "invoices", done: (f) => n(f, "paymentLinks") > 0 || n(f, "received") > 0 },
      { title: "Record the receipt", why: "TDS and bank charges handled.", href: "/portal/invoices?view=receivables", section: "invoices", done: (f) => n(f, "received") > 0 },
      { title: "Match it in the bank statement", why: "So the books agree with the bank.", href: "/portal/bank", section: "bank", done: (f) => n(f, "matched") > 0 },
    ],
  },
  {
    id: "close", title: "Close the month",
    summary: "Bank, payroll, ventures and assets settled, then the numbers read.",
    steps: [
      { title: "Import the bank statement", why: "CSV from your bank.", href: "/portal/bank", section: "bank", done: (f) => n(f, "bankImports") > 0 },
      { title: "Match or post every line", why: "Nothing left unexplained.", href: "/portal/bank", section: "bank", done: (f) => n(f, "bankImports") > 0 && n(f, "unmatched") === 0 },
      { title: "Run and post payroll", why: "PF, ESI, PT and TDS worked out.", href: "/portal/people?view=payroll", section: "people", done: (f) => n(f, "payRuns") > 0 },
      { title: "Close each venture's month", why: "Operator shares and the Business House fee post.", href: "/portal/ventures", section: "ventures", done: (f) => n(f, "venturePeriods") > 0 },
      { title: "Run depreciation", why: "Fixed assets written down for the month.", href: "/portal/assets", section: "assets", done: (f) => n(f, "depreciation") > 0 },
      { title: "Read the MIS and insights", why: "Runway, budgets, overdue and anything unusual.", href: "/portal/intelligence", section: "intelligence" },
      { title: "Take a backup", why: "A copy of the closed month, sealed.", href: "/portal/console", section: "console", done: (f) => n(f, "backups") > 0 },
    ],
  },
  {
    id: "person", title: "Bring on a person",
    summary: "Seat, identity, employee record and first pay.",
    steps: [
      { title: "Invite them with a role and workspaces", why: "They only see what their role allows.", href: "/portal/access", section: "access", done: (f) => n(f, "seats") > 1 },
      { title: "Verify them with KYC", why: "PAN and Aadhaar through DigiLocker.", href: "/portal/kyc?view=new", section: "kyc", done: (f) => n(f, "kycVerified") > 0 },
      { title: "Add their employee record", why: "Salary structure, PAN, bank account.", href: "/portal/people", section: "people", done: (f) => n(f, "employees") > 0 },
      { title: "Share their documents", why: "Offer letter and policies in the vault.", href: "/portal/vault", section: "vault", done: (f) => n(f, "documents") > 0 },
      { title: "Include them in the next pay run", why: "Prorated for the days they joined.", href: "/portal/people?view=payroll", section: "people", done: (f) => n(f, "payRuns") > 0 },
    ],
  },
  {
    id: "invest", title: "Invest in a company",
    summary: "From a lead in the pipeline to a holding with its papers.",
    steps: [
      { title: "Add it to the deal pipeline", why: "Track it from first call to close.", href: "/portal/deals", section: "deals", done: (f) => n(f, "deals") > 0 },
      { title: "Verify the company and its owners", why: "KYC with Entity Locker and beneficial owners.", href: "/portal/kyc?view=new", section: "kyc", done: (f) => n(f, "kycCases") > 0 },
      { title: "Record the investment", why: "Cost, instrument and the cap table.", href: "/portal/portfolio", section: "portfolio", done: (f) => n(f, "holdings") > 0 },
      { title: "File the agreements", why: "Shareholders' agreement and filings in the vault.", href: "/portal/vault", section: "vault", done: (f) => n(f, "documents") > 0 },
      { title: "Value it and watch it", why: "Valuations feed the portfolio and MIS.", href: "/portal/portfolio", section: "portfolio", done: (f) => n(f, "valuations") > 0 },
    ],
  },
  {
    id: "venture", title: "Run a venture",
    summary: "A venture under Build, Co-Build or Own, with its operator, budget and monthly close.",
    steps: [
      { title: "Create the venture and its books", why: "An SPV only when equity is shared.", href: "/portal/ventures", section: "ventures", done: (f) => n(f, "ventures") > 0 },
      { title: "Add the operator and their share", why: "Paid from revenue or profit.", href: "/portal/ventures", section: "ventures", done: (f) => n(f, "operators") > 0 },
      { title: "Set the budget", why: "Insights warn when it drifts.", href: "/portal/budgets", section: "budgets", done: (f) => n(f, "budgets") > 0 },
      { title: "Close each month", why: "Revenue, costs, operator share and fee posted.", href: "/portal/ventures", section: "ventures", done: (f) => n(f, "venturePeriods") > 0 },
      { title: "Review the insights", why: "Falling revenue and losses are flagged.", href: "/portal/intelligence", section: "intelligence" },
    ],
  },
];

/** Steps this person can act on (their role opens the page), with done or not. */
export function progress(guide: Guide, facts: Facts, canOpen: (section: string) => boolean) {
  const steps = guide.steps.filter((s) => canOpen(s.section)).map((s) => ({ ...s, isDone: s.done ? s.done(facts) : null }));
  const counted = steps.filter((s) => s.isDone !== null);
  const done = counted.filter((s) => s.isDone).length;
  const next = steps.find((s) => s.isDone === false) ?? null;
  return { steps, done, total: counted.length, next, complete: counted.length > 0 && done === counted.length };
}
