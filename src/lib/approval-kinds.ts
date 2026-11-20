export const APPROVAL_KINDS = [
  { id: "access", label: "Access" },
  { id: "deal", label: "Deal" },
  { id: "payment", label: "Payment" },
  { id: "document", label: "Document" },
  { id: "content", label: "Site content" },
  { id: "other", label: "Other" },
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number]["id"];

export function isApprovalKind(value: unknown): value is ApprovalKind {
  return APPROVAL_KINDS.some((kind) => kind.id === value);
}

export const MAX_PENDING_PER_PERSON = 20;
