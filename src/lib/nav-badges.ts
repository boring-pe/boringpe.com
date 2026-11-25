import { getSql } from "./db";
import { countPending } from "./approvals";
import { entityIdsInView, workspaceContext } from "./workspaces";
import { can, type Role, type SectionId } from "./rbac";

export type Badge = { n: number; tone: "late" | "waiting"; label: string };

/**
 * The counts beside menu items: what is waiting for this person, so they need not open a page to
 * find out. Only for sections they can open, and only counts that ask for action.
 */
export async function navBadges(user: { id: string; role: Role }): Promise<Partial<Record<SectionId, Badge>>> {
  const sql = await getSql();
  const out: Partial<Record<SectionId, Badge>> = {};
  const [pending, tasks, invoices] = await Promise.all([
    user.role === "super_admin" ? countPending() : Promise.resolve(0),
    can(user.role, "tasks")
      ? workspaceContext().then(({ inView }) => sql.query<{ n: number }>(
          `select count(*)::int as n from tasks where not done and due_date < current_date
              and (assignee_id = $1 or (assignee_id is null and created_by = $1)) and workspace = any($2::text[])`,
          [user.id, inView],
        )).then((r) => r[0]?.n ?? 0)
      : Promise.resolve(0),
    can(user.role, "invoices")
      ? entityIdsInView().then((ids) => sql.query<{ n: number }>(
          "select count(*)::int as n from invoices where status = 'issued' and due_date < current_date and total - received - tds > 0 and entity_id = any($1::text[])",
          [ids],
        )).then((r) => r[0]?.n ?? 0)
      : Promise.resolve(0),
  ]);
  if (pending) out.approvals = { n: pending, tone: "waiting", label: `${pending} waiting for your decision` };
  if (tasks) out.tasks = { n: tasks, tone: "late", label: `${tasks} of your tasks overdue` };
  if (invoices) out.invoices = { n: invoices, tone: "late", label: `${invoices} invoice${invoices === 1 ? "" : "s"} overdue` };
  return out;
}
