import { requireSection } from "@/lib/dal";
import { listAssignees, listDeals, listTasks } from "@/lib/ops";
import { can } from "@/lib/rbac";
import { addTask, toggleTask } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  added: { text: "Task added." },
  done: { text: "Marked done." },
  reopened: { text: "Reopened." },
  invalid: { text: "That was not valid. Give the task a short title.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireSection("tasks");
  const { notice } = await searchParams;
  const seeDeals = can(user.role, "deals");
  const [tasks, assignees, deals] = await Promise.all([
    listTasks(),
    listAssignees(),
    seeDeals ? listDeals() : Promise.resolve([]),
  ]);
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
        <form action={addTask} className="grid gap-3 md:grid-cols-4">
          <input name="title" required minLength={2} maxLength={200} placeholder="Task" className={`${input} md:col-span-2`} />
          <select name="assigneeId" defaultValue="" className={input} aria-label="Assignee">
            <option value="">Unassigned</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <input name="due" type="date" className={input} aria-label="Due date" />
          {seeDeals ? (
            <select name="dealId" defaultValue="" className={input} aria-label="Deal">
              <option value="">No deal</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : null}
          <div className="md:col-span-4">
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Add task
            </button>
          </div>
        </form>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Tasks ({tasks.length})</h3>
        </div>
        {tasks.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">No tasks yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80 text-sm">
            {tasks.map((t) => {
              const overdue = !t.done && t.due_date !== null && t.due_date < today;
              return (
                <li key={t.id} className="px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1" data-task={t.title}>
                  <form action={toggleTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="done" value={t.done ? "false" : "true"} />
                    <button type="submit" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                      {t.done ? "Reopen" : "Mark done"}
                    </button>
                  </form>
                  <span className={t.done ? "text-slate-500 line-through" : "text-white"}>{t.title}</span>
                  {t.assignee_email ? <span className="text-xs text-slate-500">{t.assignee_email}</span> : null}
                  {seeDeals && t.deal_name ? <span className="text-xs text-slate-500">{t.deal_name}</span> : null}
                  {t.due_date ? (
                    <span className={`text-xs ${overdue ? "text-red-400" : "text-slate-500"}`}>
                      due {t.due_date}{overdue ? " (overdue)" : ""}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
