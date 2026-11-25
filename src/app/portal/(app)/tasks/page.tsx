import { requireSection } from "@/lib/dal";
import { FilterBar } from "../_shell/filter-bar";
import { TASK_NOTICES } from "@/lib/notices";
import { VerticalSelect } from "../_shell/vertical-select";
import { VerticalFilter } from "../_shell/vertical-filter";
import { isVertical, verticalLabel } from "@/lib/ops-fields";
import { listAssignees, listDeals, listTasks } from "@/lib/ops";
import { can, canSeeFirmData } from "@/lib/rbac";
import { addTask, toggleTask } from "./actions";
import { DueChip, EmptyState, dueState } from "../_shell/status";
import { ListChecks } from "lucide-react";
import { SubmitButton } from "../_shell/buttons";

const NOTICES = TASK_NOTICES;
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ notice?: string; vertical?: string }> }) {
  const user = await requireSection("tasks");
  const { notice, vertical: rawVertical } = await searchParams;
  const vertical = isVertical(rawVertical) ? rawVertical : null;
  const seeDeals = can(user.role, "deals");
  const firm = canSeeFirmData(user.role);
  const [allTasks, allAssignees, deals] = await Promise.all([
    listTasks(firm ? null : user.id),
    listAssignees(),
    seeDeals ? listDeals() : Promise.resolve([]),
  ]);
  const tasks = allTasks.filter((t) => !vertical || t.vertical === vertical);
  // External people see and assign only their own tasks, not the team list.
  const assignees = firm ? allAssignees : allAssignees.filter((a) => a.id === user.id);
  const banner = notice ? NOTICES[notice] : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Tasks</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">What needs doing, who owns it and when it is due.</p>
      </div>

      {banner ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>
          {banner.text}
        </p>
      ) : null}

      <section className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-white mb-4">Add a task</h3>
        <form id="add" action={addTask} className="grid gap-3 md:grid-cols-4 scroll-mt-28">
          <input name="title" required minLength={2} maxLength={200} placeholder="Task" className={`${input} md:col-span-2`} />
          <select name="assigneeId" defaultValue="" className={input} aria-label="Assignee">
            <option value="">Unassigned</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <VerticalSelect className={input} />
          <input name="due" type="date" className={input} aria-label="Due date" />
          {seeDeals ? (
            <select name="dealId" defaultValue="" className={input} aria-label="Deal">
              <option value="">No deal</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : null}
          <div className="md:col-span-4">
            <SubmitButton pending="Adding…">Add task</SubmitButton>
          </div>
        </form>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="space-y-3 px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Tasks ({tasks.length})</h3>
          <VerticalFilter base="/portal/tasks" current={vertical} />
        </div>
        {tasks.length === 0 ? (
          <div className="p-6"><EmptyState compact icon={ListChecks} title={vertical ? `No ${verticalLabel(vertical)} tasks yet` : "No tasks yet"} body="Add a task with an owner and a due date; overdue ones show on the dashboard." action={{ label: "Add a task", href: "#add" }} /></div>
        ) : (
          <>
          <FilterBar list="tasks" placeholder="Search tasks, owners, deals" noun={["task", "tasks"]} chips={[{ id: "open", label: "Open" }, { id: "overdue", label: "Overdue" }, { id: "soon", label: "Due this week" }, { id: "done", label: "Done" }]} />
          <ul className="divide-y divide-slate-800/80 text-sm" data-filter-list="tasks">
            {tasks.map((t) => {
              const due = !t.done && t.due_date ? dueState(t.due_date, today) : null;
              return (
                <li key={t.id} className="px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1" data-task={t.title} data-row data-tags={[t.done ? "done" : "open", due === "overdue" ? "overdue" : "", due === "dueSoon" ? "soon" : ""].join(" ")}>
                  <form action={toggleTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="done" value={t.done ? "false" : "true"} />
                    <button type="submit" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                      {t.done ? "Reopen" : "Mark done"}
                    </button>
                  </form>
                  <span className={t.done ? "text-slate-500 line-through" : "text-white"}>{t.title}</span>
                  {t.vertical ? <span className="rounded-full border border-slate-700 px-2 text-[11px] text-slate-400">{verticalLabel(t.vertical)}</span> : null}
                  {t.assignee_email ? <span className="text-xs text-slate-500">{t.assignee_email}</span> : null}
                  {seeDeals && t.deal_name ? <span className="text-xs text-slate-500">{t.deal_name}</span> : null}
                  {t.due_date ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      due {t.due_date}{!t.done && dueState(t.due_date, today) ? <DueChip state={dueState(t.due_date, today)!} /> : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          </>
        )}
      </section>
    </div>
  );
}
