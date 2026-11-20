import { BarChart3 } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { summary } from "@/lib/ops";
import { inr, stageLabel, STAGES } from "@/lib/ops-fields";
import { can } from "@/lib/rbac";

const card = "bg-slate-900 border border-slate-800 rounded-xl p-5";

export default async function DashboardPage() {
  const user = await requireSection("dashboard");
  const seeDeals = can(user.role, "deals");
  const seeMoney = can(user.role, "money");
  const seeTasks = can(user.role, "tasks");
  const data = seeDeals || seeMoney || seeTasks ? await summary() : null;

  const totalDeals = data?.deals.reduce((n, d) => n + d.n, 0) ?? 0;
  const empty = !data || (totalDeals === 0 && !data.money?.moneyin && !data.money?.moneyout && !data.tasks?.open);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Figures on this page come only from records kept in the portal.
        </p>
      </div>

      {empty ? (
        <div className="p-10 bg-slate-900 border border-dashed border-slate-700 rounded-xl text-center">
          <BarChart3 className="w-8 h-8 mx-auto text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-white">Nothing to report yet</h3>
          <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
            Figures appear here once deals, money and tasks are recorded in Operations.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {seeDeals ? (
              <div className={card}>
                <div className="text-xs uppercase tracking-wide text-slate-500">Deals</div>
                <div className="mt-1 text-xl font-semibold text-white">{totalDeals}</div>
              </div>
            ) : null}
            {seeMoney ? (
              <>
                <div className={card}>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Money in</div>
                  <div className="mt-1 text-xl font-semibold text-white">{inr(data?.money?.moneyin ?? 0)}</div>
                </div>
                <div className={card}>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Paid out</div>
                  <div className="mt-1 text-xl font-semibold text-white">{inr(data?.money?.moneyout ?? 0)}</div>
                </div>
              </>
            ) : null}
            {seeTasks ? (
              <div className={card}>
                <div className="text-xs uppercase tracking-wide text-slate-500">Open tasks</div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {data?.tasks?.open ?? 0}
                  {data?.tasks?.overdue ? <span className="ml-2 text-xs text-red-400">{data.tasks.overdue} overdue</span> : null}
                </div>
              </div>
            ) : null}
          </div>

          {seeDeals && totalDeals > 0 ? (
            <section className={`${card}`}>
              <h3 className="text-sm font-semibold text-white mb-3">Pipeline by stage</h3>
              <ul className="grid gap-2 md:grid-cols-3 text-sm">
                {STAGES.map((s) => {
                  const row = data?.deals.find((d) => d.stage === s.id);
                  return (
                    <li key={s.id} className="flex justify-between text-slate-300">
                      <span>{stageLabel(s.id)}</span>
                      <span className="text-slate-400">{row?.n ?? 0}{row?.value ? ` · ${inr(row.value)}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
