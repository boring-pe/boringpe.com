// What each create form says back, shared by its page and the quick-add panel so both use the same words.
export type Notice = { text: string; bad?: boolean };

export const TASK_NOTICES: Record<string, Notice> = {
  added: { text: "Task added." },
  done: { text: "Marked done." },
  reopened: { text: "Reopened." },
  invalid: { text: "That was not valid. Give the task a short title.", bad: true },
};

export const MONEY_NOTICES: Record<string, Notice> = {
  saved: { text: "Recorded." },
  requested: { text: "Payment sent to the Super Admin. It counts once approved." },
  invalid: { text: "That was not valid. Check the amount and category.", bad: true },
  memo: { text: "Say what the payment is for.", bad: true },
  rate: { text: "Give the amount and the rate in rupees per unit, for example 83.45.", bad: true },
  backfilled: { text: "Older entries posted to the books." },
  "books-refused": { text: "The books refused that entry. Nothing was saved.", bad: true },
  "too-many": { text: "You already have 20 requests waiting.", bad: true },
};

export const DEAL_NOTICES: Record<string, Notice> = {
  "deal-added": { text: "Deal added." },
  "party-added": { text: "Party added." },
  moved: { text: "Stage updated." },
  requested: { text: "Sent to the Super Admin. The stage changes once it is approved." },
  invalid: { text: "That was not valid. Check the name, pillar and amount.", bad: true },
  "owner-only": { text: "Only the Super Admin can move a closed deal.", bad: true },
  "already-waiting": { text: "That deal already has a move waiting for approval.", bad: true },
  "too-many": { text: "You already have 20 requests waiting.", bad: true },
};

/** Deal and contact record pages. */
export const RECORD_NOTICES: Record<string, Notice> = {
  "task-added": { text: "Task added to this record." },
  "doc-added": { text: "Document attached. It is also in the BIDU Vault." },
  "party-linked": { text: "Contact linked to the deal." },
  "kyc-started": { text: "KYC case opened. Send the contact their link from the KYC page." },
  "kyc-exists": { text: "This contact already has a KYC case.", bad: true },
  "chat-linked": { text: "WhatsApp chat linked to this contact." },
  "no-file": { text: "Choose a file to attach.", bad: true },
  "too-big": { text: "That file is over 4 MB. Attach a smaller one.", bad: true },
  type: { text: "That file type is not accepted. Use PDF, an image, Word, Excel or text.", bad: true },
  forbidden: { text: "Your role cannot do that here.", bad: true },
  invalid: { text: "That was not valid. Check the fields and try again.", bad: true },
};
