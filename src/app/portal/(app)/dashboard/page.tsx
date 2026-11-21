import { BarChart3 } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { listTasks, summary } from "@/lib/ops";
import { inr, stageLabel, STAGES } from "@/lib/ops-fields";
import Link from "next/link";
import { rupees } from "@/lib/accounting";
import { toTxns } from "@/lib/investments";
import { position } from "@/lib/portfolio-calc";
import { can, canSeeFirmData } from "@/lib/rbac";
import { myView } from "@/lib/scopes";

const card = "bg-slate-900 border border-slate-800 rounded-xl p-5";

export default async function DashboardPage() {
  const user = await requireSection("dashboard");
  if (!canSeeFirmData(user.role)) return <MyDashboard userId={user.id} />;
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

/** External people: only what is linked to them, never firm-wide figures. */
async function MyDashboard({ userId }: { userId: string }) {
  const [view, tasks] = await Promise.all([myView(userId), listTasks(userId)]);
  const holdings = [...view.holdings, ...view.entities.flatMap((e) => e.holdings)];
  const positions = holdings.map((h) => position(toTxns(h)));
  const invested = positions.reduce((s, p) => s + p.invested, 0n);
  const value = positions.reduce((s, p) => s + p.currentValue, 0n);
  const open = tasks.filter((t) => !t.done).length;
  const tiles: [string, string, string][] = [
    ["Linked companies", String(view.entities.length), "/portal/portfolio"],
    ["Holdings: invested / value", `${rupees(invested)} / ${rupees(value)}`, "/portal/portfolio"],
    ["Ventures", String(view.ventures.length), "/portal/ventures"],
    ["Open tasks", String(open), "/portal/tasks"],
  ];
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">What is linked to you in the portal.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {tiles.map(([label, v, href]) => (
          <Link key={label} href={href} className={`${card} block hover:border-slate-700`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-semibold text-white">{v}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
