// Pure workflow maths: which step of a deal or a payment is done, which is next, and what to do
// about it. No imports, so the test runner can load it directly. Nothing here is stored: every
// step is read from the records themselves, so a workflow can never disagree with the books.

export type StepState = "done" | "current" | "todo" | "stopped";
export type Step = { id: string; label: string; state: StepState; detail: string; action?: { label: string; href: string } };

/** Where a closed deal goes next. Boring Stack (enable) bills fees; Own and Co-Build hold a stake; Build runs a venture. */
export type DealPath = "cash" | "holding" | "venture";
export const pathOf = (pillar: string): DealPath => (pillar === "enable" ? "cash" : pillar === "build" ? "venture" : "holding");
export const PATH_LABEL: Record<DealPath, string> = { cash: "Deal to cash", holding: "Deal to holding", venture: "Deal to venture" };

export type KycState = "none" | "open" | "verified" | "rejected";

export type DealFacts = {
  id: string;
  pillar: string;
  stage: string;
  pendingStage: string | null;
  partyId: string | null;
  kyc: KycState;
  kycCaseId: string | null;
  /** Issued (not draft, not cancelled) invoices, and drafts. */
  invoicesIssued: number;
  invoiceDrafts: number;
  /** Still owed on issued invoices, in paise. */
  outstanding: bigint;
  /** Money received against those invoices, and how much of it the bank statement confirms. */
  receipts: number;
  receiptsMatched: number;
  holdingId: string | null;
  invested: boolean;
  investMatched: boolean;
  ventureId: string | null;
  venturePeriods: number;
};

/**
 * Marks the first unfinished step as current and the rest as to do, keeping any later step that
 * is already done as done (work does not always happen in order).
 */
export function sequence(steps: Omit<Step, "state">[], done: boolean[], stopped = false): Step[] {
  const first = done.findIndex((d) => !d);
  return steps.map((s, i) => ({
    ...s,
    state: done[i] ? "done" : stopped && i >= first ? "stopped" : i === first ? "current" : "todo",
  }));
}

const inr = (paise: bigint) => `₹${(Number(paise) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** The steps from a deal to money in the bank, a recorded holding, or a running venture. */
export function dealSteps(f: DealFacts): Step[] {
  const path = pathOf(f.pillar);
  const closed = f.stage === "closed";
  const passed = f.stage === "passed";
  const win: Omit<Step, "state"> = {
    id: "win",
    label: "Close the deal",
    detail: closed ? "Closed." : passed ? "Passed: this deal stopped here." : f.pendingStage ? `Waiting for approval to move to ${f.pendingStage === "closed" ? "Closed" : "Closing"}.` : "Move it to Closed when the terms are agreed.",
  };
  const kyc: Omit<Step, "state"> = f.partyId
    ? {
        id: "kyc",
        label: "Verify the contact (KYC)",
        detail: { none: "No KYC case yet.", open: "KYC is in progress.", verified: "Verified.", rejected: "KYC was rejected: resolve it before money moves." }[f.kyc],
        action: f.kycCaseId ? { label: "Open the KYC case", href: `/portal/kyc?c=${f.kycCaseId}` } : { label: "Start KYC", href: `#start-kyc` },
      }
    : { id: "kyc", label: "Verify the contact (KYC)", detail: "Link a contact to this deal first.", action: { label: "Link a contact", href: "#contact" } };

  if (path === "cash") {
    const paid = f.invoicesIssued > 0 && f.outstanding === 0n;
    const steps = [
      win,
      kyc,
      {
        id: "invoice",
        label: "Raise the invoice",
        detail: f.invoicesIssued ? `${f.invoicesIssued} issued.` : f.invoiceDrafts ? "A draft is waiting to be issued." : "No invoice yet.",
        action: f.invoicesIssued ? { label: "See the invoices", href: "#invoices" } : f.invoiceDrafts ? { label: "Issue the draft", href: "#invoices" } : { label: "Raise an invoice", href: `/portal/invoices?view=new&deal=${f.id}` },
      },
      {
        id: "paid",
        label: "Get paid",
        detail: !f.invoicesIssued ? "After the invoice is issued." : paid ? "Paid in full." : `${inr(f.outstanding)} still owed.`,
        action: f.invoicesIssued && !paid ? { label: "Record a receipt", href: `#invoices` } : undefined,
      },
      {
        id: "bank",
        label: "Match it to the bank",
        detail: !f.receipts ? "After money comes in." : f.receiptsMatched >= f.receipts ? "Every receipt is on the bank statement." : `${f.receipts - f.receiptsMatched} of ${f.receipts} receipts not yet matched.`,
        action: f.receipts && f.receiptsMatched < f.receipts ? { label: "Reconcile the bank", href: "/portal/bank" } : undefined,
      },
    ];
    return sequence(steps, [closed, f.kyc === "verified", f.invoicesIssued > 0, paid, f.receipts > 0 && f.receiptsMatched >= f.receipts], passed || f.kyc === "rejected");
  }

  if (path === "holding") {
    const steps = [
      win,
      kyc,
      {
        id: "holding",
        label: "Record the holding",
        detail: f.holdingId ? "Recorded in Portfolio." : "Not in Portfolio yet.",
        action: f.holdingId ? { label: "Open the holding", href: `/portal/portfolio?h=${f.holdingId}` } : { label: "Record the holding", href: `/portal/portfolio?deal=${f.id}#add-holding` },
      },
      {
        id: "invest",
        label: "Invest",
        detail: !f.holdingId ? "After the holding is recorded." : f.invested ? "Investment recorded and posted to the books." : "No investment recorded yet.",
        action: f.holdingId && !f.invested ? { label: "Record the investment", href: `/portal/portfolio?h=${f.holdingId}` } : undefined,
      },
      {
        id: "bank",
        label: "Match it to the bank",
        detail: !f.invested ? "After the money goes out." : f.investMatched ? "On the bank statement." : "The payment is not matched to the bank yet.",
        action: f.invested && !f.investMatched ? { label: "Reconcile the bank", href: "/portal/bank" } : undefined,
      },
    ];
    return sequence(steps, [closed, f.kyc === "verified", Boolean(f.holdingId), f.invested, f.invested && f.investMatched], passed || f.kyc === "rejected");
  }

  const steps = [
    win,
    kyc,
    {
      id: "venture",
      label: "Set up the venture",
      detail: f.ventureId ? "Set up in Ventures." : "Not set up yet.",
      action: f.ventureId ? { label: "Open the venture", href: `/portal/ventures?v=${f.ventureId}` } : { label: "Set up the venture", href: `/portal/ventures?deal=${f.id}#add-venture` },
    },
    {
      id: "period",
      label: "Book the first period",
      detail: !f.ventureId ? "After the venture is set up." : f.venturePeriods ? `${f.venturePeriods} period${f.venturePeriods === 1 ? "" : "s"} booked.` : "No revenue or costs booked yet.",
      action: f.ventureId && !f.venturePeriods ? { label: "Book a period", href: `/portal/ventures?v=${f.ventureId}` } : undefined,
    },
  ];
  return sequence(steps, [closed, f.kyc === "verified", Boolean(f.ventureId), f.venturePeriods > 0], passed || f.kyc === "rejected");
}

/** How far along a set of steps is, for a small bar on a list: done of total. */
export const progress = (steps: Step[]) => ({ done: steps.filter((s) => s.state === "done").length, total: steps.length, stopped: steps.some((s) => s.state === "stopped") });

export type SpendFacts = {
  direction: "in" | "out";
  status: string;
  posted: boolean;
  matched: boolean;
  /** Days since the entry's date. */
  ageDays: number;
};

/** A payment from request to the bank statement; money in from record to the bank statement. */
export function spendSteps(f: SpendFacts): Step[] {
  const rejected = f.status === "rejected" || f.status === "withdrawn";
  const approved = f.status === "approved" || f.status === "recorded";
  if (f.direction === "in") {
    return sequence(
      [
        { id: "recorded", label: "Recorded", detail: "Money in is recorded as it happens." },
        { id: "books", label: "In the books", detail: f.posted ? "Posted." : "Not posted yet." },
        { id: "bank", label: "Matched to the bank", detail: f.matched ? "On the bank statement." : "Not matched yet." },
      ],
      [true, f.posted, f.matched],
    );
  }
  return sequence(
    [
      { id: "requested", label: "Requested", detail: "Asked to pay." },
      { id: "approved", label: "Approved", detail: rejected ? "Not approved." : approved ? "Approved." : "Waiting for the Super Admin." },
      { id: "books", label: "In the books", detail: f.posted ? "Posted." : "Posts when approved." },
      { id: "bank", label: "Matched to the bank", detail: f.matched ? "On the bank statement." : "Not matched yet." },
    ],
    [true, approved, f.posted, f.matched],
    rejected,
  );
}

/** A payment or receipt that has sat in the books for a week without showing up on the bank statement. */
export const STUCK_DAYS = 7;
export function isStuck(f: SpendFacts): boolean {
  return f.posted && !f.matched && f.ageDays >= STUCK_DAYS && f.status !== "rejected" && f.status !== "withdrawn";
}
