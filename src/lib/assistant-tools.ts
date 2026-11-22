import type { ToolDef } from "./ai-format";
import type { Category } from "./assistant-policy";
import { parsePaise, paiseToDecimal } from "./accounting";
import { createApproval } from "./approvals";
import { agenda, calendarsFor, createMeeting } from "./calendar";
import { cashTrend, fyMonthly, receivablesTotals } from "./dashboard";
import { firmInsights } from "./insights";
import { listInvoices } from "./invoices";
import { mailboxesFor, sendMail, unifiedInbox } from "./mail";
import { addNote, listNotes } from "./notes";
import { createEntry, createTask, dropEntry, listTasks, setTaskDone } from "./ops";
import { categoryLabel, inr, isCategory } from "./ops-fields";
import { can, canSeeFirmData, type SectionId } from "./rbac";
import { audit, type UserRow } from "./users";
import { listEntities } from "./books";
import { sendText } from "./whatsapp";

export type Tool = ToolDef & {
  category: Category;
  /** The page a person must be able to open for her to use this tool for them. */
  section: SectionId;
  firmOnly?: boolean;
  /** One line shown on the approval card. */
  describe: (input: Record<string, unknown>) => string;
  run: (user: UserRow, input: Record<string, unknown>) => Promise<string>;
};

const str = (v: unknown, max = 500) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const text = (v: unknown, max = 5000) => String(v ?? "").trim().slice(0, max);
const rupee = (p: bigint) => inr(paiseToDecimal(p));
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const TOOLS: Tool[] = [
  {
    name: "business_snapshot", category: "read", section: "dashboard", firmOnly: true,
    description: "Cash now and a year ago, profit this financial year, money owed to us and the most pressing insights, for the workspace on view.",
    input_schema: obj({}),
    describe: () => "Look at the business figures",
    run: async () => {
      const [cash, fy, recv, intel] = await Promise.all([cashTrend(12), fyMonthly(), receivablesTotals(), firmInsights()]);
      const income = fy.months.reduce((s, m) => s + m.income, 0n);
      const expense = fy.months.reduce((s, m) => s + m.expense, 0n);
      const top = intel.insights.filter((i) => i.severity === "critical" || i.severity === "warning").slice(0, 6);
      return [
        `Cash now ${rupee(cash.at(-1)?.cash ?? 0n)}; twelve months ago ${rupee(cash[0]?.cash ?? 0n)}.`,
        `This financial year: income ${rupee(income)}, expenses ${rupee(expense)}, net ${rupee(income - expense)}.`,
        `Owed to us ${rupee(recv.due)}, of which overdue ${rupee(recv.overdue)} on ${recv.overdueCount} invoices.`,
        intel.group.runwayMonths === null ? "Not burning cash." : `Runway about ${intel.group.runwayMonths.toFixed(1)} months at ${rupee(intel.group.burn)} a month.`,
        top.length ? `Needs attention:\n${top.map((i) => `- ${i.title}. ${i.detail}`).join("\n")}` : "Nothing urgent flagged.",
      ].join("\n");
    },
  },
  {
    name: "list_insights", category: "read", section: "intelligence",
    description: "Every plain-language insight for the workspace on view: runway, overdue receivables, budget variance, ventures, unusual spending.",
    input_schema: obj({}),
    describe: () => "Read the insights",
    run: async () => {
      const { insights } = await firmInsights();
      return insights.length ? insights.map((i) => `[${i.severity}] ${i.title}. ${i.detail}`).join("\n") : "No insights yet.";
    },
  },
  {
    name: "overdue_invoices", category: "read", section: "invoices",
    description: "Issued invoices not yet fully paid, with who owes what and how late.",
    input_schema: obj({}),
    describe: () => "List unpaid invoices",
    run: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const open = (await listInvoices()).filter((i) => i.status === "issued");
      if (!open.length) return "No unpaid invoices.";
      return open.slice(0, 40).map((i) => `${i.number ?? "Draft"} · ${i.party_name} · ${inr(i.total)} total · due ${i.due_date}${i.due_date < today ? " (overdue)" : ""}`).join("\n");
    },
  },
  {
    name: "list_tasks", category: "read", section: "tasks",
    description: "Open tasks in the workspace on view (for people outside the team, only their own).",
    input_schema: obj({}),
    describe: () => "List open tasks",
    run: async (user) => {
      const tasks = (await listTasks(canSeeFirmData(user.role) ? null : user.id)).filter((t) => !t.done);
      return tasks.length ? tasks.map((t) => `${t.id} · ${t.title}${t.due_date ? ` · due ${t.due_date}` : ""}${t.assignee_email ? ` · ${t.assignee_email}` : ""}`).join("\n") : "No open tasks.";
    },
  },
  {
    name: "agenda", category: "read", section: "calendar",
    description: "Meetings in the person's connected calendars for the next days.",
    input_schema: obj({ days: { type: "integer", minimum: 1, maximum: 30 } }),
    describe: () => "Read the calendar",
    run: async (user, input) => {
      const a = await agenda(user.id, Math.min(30, Math.max(1, Number(input.days) || 7)));
      if (!a.accounts.length) return "No calendar is connected. Connect one under Inbox → Accounts.";
      return a.items.length ? a.items.map((i) => `${i.start} · ${i.title}${i.joinUrl ? ` · ${i.joinUrl}` : ""}`).join("\n") : "Nothing scheduled.";
    },
  },
  {
    name: "recent_email", category: "read", section: "inbox",
    description: "Recent messages across the mailboxes the person can open, optionally matching a search.",
    input_schema: obj({ search: { type: "string" } }),
    describe: (i) => (i.search ? `Search mail for "${str(i.search, 60)}"` : "Read recent mail"),
    run: async (user, input) => {
      const boxes = await mailboxesFor(user.id, user.role);
      if (!boxes.length) return "No mailbox is connected.";
      const { items } = await unifiedInbox(boxes, str(input.search, 100) || undefined);
      return items.slice(0, 20).map((m) => `${m.date.slice(0, 16)} · ${m.from} → ${m.accountEmail} · ${m.subject} · ${m.snippet}`).join("\n") || "No messages.";
    },
  },
  {
    name: "add_note", category: "notes", section: "personal",
    description: "Save a private note on the Super Admin's personal desk.",
    input_schema: obj({ title: { type: "string" }, body: { type: "string" } }, ["title"]),
    describe: (i) => `Save a note: ${str(i.title, 80)}`,
    run: async (user, input) => {
      const title = str(input.title, 200);
      if (!title) return "A note needs a title.";
      await addNote(user.id, title, text(input.body, 10000));
      return `Note saved: ${title}.`;
    },
  },
  {
    name: "list_notes", category: "notes", section: "personal",
    description: "The Super Admin's private notes.",
    input_schema: obj({}),
    describe: () => "Read your notes",
    run: async (user) => (await listNotes(user.id)).slice(0, 30).map((n) => `${n.title}: ${n.body.slice(0, 200)}`).join("\n") || "No notes.",
  },
  {
    name: "create_task", category: "tasks", section: "tasks",
    description: "Add a task in the workspace on view, optionally with a due date (YYYY-MM-DD).",
    input_schema: obj({ title: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD" } }, ["title"]),
    describe: (i) => `Add a task: ${str(i.title, 80)}${i.due ? ` (due ${str(i.due, 10)})` : ""}`,
    run: async (user, input) => {
      const title = str(input.title, 200);
      if (title.length < 2) return "A task needs a title.";
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(input.due ?? "")) ? String(input.due) : null;
      await createTask({ title, dealId: null, assigneeId: null, due, by: user.id });
      return `Task added: ${title}${due ? `, due ${due}` : ""}.`;
    },
  },
  {
    name: "complete_task", category: "tasks", section: "tasks",
    description: "Mark a task done, by the id shown in list_tasks.",
    input_schema: obj({ task_id: { type: "string" } }, ["task_id"]),
    describe: (i) => `Mark task ${str(i.task_id, 40)} done`,
    run: async (user, input) =>
      (await setTaskDone(str(input.task_id, 60), true, canSeeFirmData(user.role) ? null : user.id)) ? "Task marked done." : "No such task here.",
  },
  {
    name: "send_email", category: "email", section: "inbox",
    description: "Send an email from one of the person's mailboxes (the first one if none is named).",
    input_schema: obj({ to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, from: { type: "string", description: "mailbox address" } }, ["to", "subject", "body"]),
    describe: (i) => `Email ${str(i.to, 80)}: ${str(i.subject, 80)}`,
    run: async (user, input) => {
      const boxes = (await mailboxesFor(user.id, user.role)).filter((b) => b.user_id === user.id || b.shared);
      const from = boxes.find((b) => b.email === str(input.from, 200).toLowerCase()) ?? boxes[0];
      if (!from) return "No mailbox is connected to send from.";
      const to = str(input.to, 500);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+(\s*,\s*[^\s@]+@[^\s@]+\.[^\s@]+)*$/.test(to)) return "That address does not look right.";
      await sendMail(from.id, { to, subject: str(input.subject, 200), body: text(input.body) });
      return `Sent from ${from.email} to ${to}.`;
    },
  },
  {
    name: "schedule_meeting", category: "calendar", section: "calendar",
    description: "Create a meeting in the person's calendar and invite attendees. Times are India time, YYYY-MM-DDTHH:MM.",
    input_schema: obj({
      title: { type: "string" }, start: { type: "string" }, end: { type: "string" },
      attendees: { type: "array", items: { type: "string" } }, online: { type: "boolean" },
    }, ["title", "start", "end"]),
    describe: (i) => `Schedule "${str(i.title, 60)}" ${str(i.start, 16)} to ${str(i.end, 16)}`,
    run: async (user, input) => {
      const cal = (await calendarsFor(user.id))[0];
      if (!cal) return "No calendar is connected.";
      const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
      const start = str(input.start, 16), end = str(input.end, 16);
      if (!re.test(start) || !re.test(end) || end <= start) return "Start and end must be India time, YYYY-MM-DDTHH:MM, end after start.";
      const attendees = (Array.isArray(input.attendees) ? input.attendees : []).map((a) => str(a, 200)).filter((a) => a.includes("@")).slice(0, 20);
      const made = await createMeeting(user.id, cal.id, { title: str(input.title, 200), description: "", startLocal: start, endLocal: end, attendees, online: input.online !== false }, null);
      return `Meeting created${made.joinUrl ? `, join at ${made.joinUrl}` : ""}.`;
    },
  },
  {
    name: "whatsapp_reply", category: "whatsapp", section: "whatsapp", firmOnly: true,
    description: "Reply in an open WhatsApp conversation (within 24 hours of their last message), by the contact's number.",
    input_schema: obj({ number: { type: "string", description: "digits with country code" }, text: { type: "string" } }, ["number", "text"]),
    describe: (i) => `WhatsApp +${str(i.number, 20)}: ${str(i.text, 80)}`,
    run: async (user, input) => {
      const err = await sendText(str(input.number, 20).replace(/\D/g, ""), text(input.text, 4000), user.id);
      return err ?? "Sent.";
    },
  },
  {
    name: "record_money", category: "money", section: "money",
    description: "Record money in or a payment out in the first books of the workspace on view. Payments out by anyone but the Super Admin then wait for her approval as usual.",
    input_schema: obj({
      direction: { type: "string", enum: ["in", "out"] },
      category: { type: "string", enum: ["investment", "fee", "expense", "payout", "salary", "other"] },
      amount: { type: "string", description: "rupees, e.g. 25000" }, memo: { type: "string" },
    }, ["direction", "category", "amount", "memo"]),
    describe: (i) => `${i.direction === "in" ? "Record money in" : "Pay"} ₹${str(i.amount, 20)} (${str(i.category, 20)}): ${str(i.memo, 80)}`,
    run: async (user, input) => {
      const direction = input.direction === "in" ? "in" : input.direction === "out" ? "out" : null;
      const paise = parsePaise(str(input.amount, 30));
      const category = isCategory(input.category) ? input.category : null;
      const memo = str(input.memo, 300);
      if (!direction || !paise || !category || (direction === "out" && memo.length < 3)) return "Direction, category, amount and a purpose are all needed.";
      const entity = (await listEntities())[0];
      if (!entity) return "There are no books in this workspace.";
      const amount = paiseToDecimal(paise);
      const status = direction === "in" ? "recorded" : user.role === "super_admin" ? "approved" : "awaiting_approval";
      const date = new Date().toISOString().slice(0, 10);
      const id = await createEntry({ direction, category, amount, memo, dealId: null, partyId: null, status, date, by: user.id, entityId: entity.id });
      if (status === "awaiting_approval") {
        const made = await createApproval({
          kind: "payment", title: `Pay ${inr(amount)} (${categoryLabel(category)})`, detail: memo,
          requestedBy: user.id, requestedByEmail: user.email, refType: "money_entry", refId: id,
        });
        if (made === "too-many") {
          await dropEntry(id);
          return "Too many approvals are waiting; nothing was recorded.";
        }
      }
      await audit({ actorId: user.id, actorEmail: user.email, action: `money_${direction}_${status}`, detail: `${inr(amount)} via assistant: ${memo}` });
      return status === "awaiting_approval" ? `Payment of ${inr(amount)} recorded in ${entity.name} and sent for approval.` : `Recorded ${inr(amount)} in ${entity.name}'s books.`;
    },
  },
];

/** The tools this person's role and pages allow at all; the policy then decides ask or act. */
export function toolsFor(user: UserRow): Tool[] {
  return TOOLS.filter((t) => can(user.role, t.section) && (!t.firmOnly || canSeeFirmData(user.role)));
}
export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
