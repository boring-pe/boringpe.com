import { getSql } from "./db";
import { notifyRoles } from "./notify";
import { MAX_PENDING_PER_PERSON, type ApprovalKind } from "./approval-kinds";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type ApprovalRow = {
  id: string;
  kind: ApprovalKind;
  title: string;
  detail: string;
  status: ApprovalStatus;
  ref_type: string | null;
  ref_id: string | null;
  requested_by: string;
  requested_by_email: string;
  decided_by_email: string | null;
  decision_note: string | null;
  created_at: Date;
  decided_at: Date | null;
};

const COLUMNS = `id, kind, title, detail, status, ref_type, ref_id, requested_by, requested_by_email,
  decided_by_email, decision_note, created_at, decided_at`;

export async function createApproval(input: {
  kind: ApprovalKind;
  title: string;
  detail: string;
  requestedBy: string;
  requestedByEmail: string;
  refType?: string | null;
  refId?: string | null;
}): Promise<ApprovalRow | "too-many"> {
  const sql = await getSql();
  const open = await sql.query<{ n: number }>(
    "select count(*)::int as n from approvals where requested_by = $1 and status = 'pending'",
    [input.requestedBy],
  );
  if (Number(open[0]?.n ?? 0) >= MAX_PENDING_PER_PERSON) return "too-many";
  const rows = await sql.query<ApprovalRow>(
    `insert into approvals (kind, title, detail, requested_by, requested_by_email, ref_type, ref_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
    [
      input.kind,
      input.title,
      input.detail,
      input.requestedBy,
      input.requestedByEmail,
      input.refType ?? null,
      input.refId ?? null,
    ],
  );
  await notifyRoles(["super_admin"], {
    kind: "approval", title: `Approval needed: ${input.title}`, body: `${input.requestedByEmail}${input.detail ? `: ${input.detail}` : ""}`,
    href: "/portal/approvals",
  }, input.requestedBy);
  return rows[0] as ApprovalRow;
}

export async function getApproval(id: string) {
  const sql = await getSql();
  const rows = await sql.query<ApprovalRow>(`select ${COLUMNS} from approvals where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listApprovals(filter: { status?: ApprovalStatus; requestedBy?: string; limit?: number }) {
  const sql = await getSql();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.requestedBy) {
    params.push(filter.requestedBy);
    where.push(`requested_by = $${params.length}`);
  }
  params.push(filter.limit ?? 50);
  return sql.query<ApprovalRow>(
    `select ${COLUMNS} from approvals ${where.length ? `where ${where.join(" and ")}` : ""}
     order by created_at desc limit $${params.length}`,
    params,
  );
}

export async function countPending() {
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    "select count(*)::int as n from approvals where status = 'pending'",
  );
  return Number(rows[0]?.n ?? 0);
}

/** Decides only while still pending, in one statement, so two clicks can never decide twice. */
export async function decideApproval(input: {
  id: string;
  status: "approved" | "rejected";
  deciderEmail: string;
  note: string | null;
}) {
  const sql = await getSql();
  const rows = await sql.query<ApprovalRow>(
    `update approvals set status = $2, decided_by_email = $3, decision_note = $4, decided_at = now()
     where id = $1 and status = 'pending' returning ${COLUMNS}`,
    [input.id, input.status, input.deciderEmail, input.note],
  );
  return rows[0] ?? null;
}

/** A person may withdraw only their own request, and only while it is pending. */
export async function withdrawApproval(id: string, requestedBy: string) {
  const sql = await getSql();
  const rows = await sql.query<ApprovalRow>(
    `update approvals set status = 'withdrawn', decided_at = now()
     where id = $1 and requested_by = $2 and status = 'pending' returning ${COLUMNS}`,
    [id, requestedBy],
  );
  return rows[0] ?? null;
}
