import Link from "next/link";
import { ArrowUpRight, BarChart3, CalendarDays, ClipboardCheck, ListChecks, Receipt, Wallet } from "lucide-react";
import { rupees } from "@/lib/accounting";
import { countPending } from "@/lib/approvals";
import { agenda } from "@/lib/calendar";
import { requireSection } from "@/lib/dal";
import { cashTrend, fyMonthly, myUpcomingTasks, receivablesTotals } from "@/lib/dashboard";
import { toTxns } from "@/lib/investments";
import { listTasks, summary } from "@/lib/ops";
import { inr, stageLabel, STAGES } from "@/lib/ops-fields";
import { position } from "@/lib/portfolio-calc";
import { can, canSeeFirmData } from "@/lib/rbac";
import { myView } from "@/lib/scopes";
import { firmInsights } from "@/lib/insights";
import { InsightList } from "../intelligence/insight-list";
import { compactRupees, IncomeExpenseChart, Sparkline, StageBars } from "./charts";
import { LiveRefresh } from "./live";

const card = "rounded-xl border border-slate-800 bg-slate-900 p-5";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";

function greeting(name: string) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}
const today = () => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
const firstName = (name: string | null, email: string) => (name ?? email.split("@")[0]).split(" ")[0];

export default async function DashboardPage() {
  const user = await requireSection("dashboard");
  if (!canSeeFirmData(user.role)) return <MyDashboard userId={user.id} name={firstName(user.name, user.email)} />;

  const seeDeals = can(user.role, "deals");
  const seeMoney = can(user.role, "money");
  const seeTasks = can(user.role, "tasks");
  const seeBooks = can(user.role, "books");
  const owner = user.role === "super_admin";
  const seeInsights = can(user.role, "intelligence");
  const [ops, cash, fy, recv, pending, mine, meetings, intel] = await Promise.all([
    summary(),
    seeBooks ? cashTrend(12) : Promise.resolve([]),
    seeBooks ? fyMonthly() : Promise.resolve(null),
    can(user.role, "invoices") ? receivablesTotals() : Promise.resolve(null),
    owner ? countPending() : Promise.resolve(0),
    myUpcomingTasks(user.id),
    agenda(user.id, 3).catch(() => ({ items: [], accounts: [], errors: [] })),
    seeInsights ? firmInsights() : Promise.resolve(null),
  ]);
  const urgent = (intel?.insights ?? []).filter((i) => i.severity === "critical" || i.severity === "warning");

  const totalDeals = ops.deals.reduce((n, d) => n + d.n, 0);
  const cashNow = cash.at(-1)?.cash ?? 0n;
  const cashThen = cash.at(-2)?.cash ?? 0n;
  const fyIncome = fy?.months.reduce((s, m) => s + m.income, 0n) ?? 0n;
  const fyExpense = fy?.months.reduce((s, m) => s + m.expense, 0n) ?? 0n;
  const anyBooks = cash.some((c) => c.cash !== 0n) || fyIncome !== 0n || fyExpense !== 0n;
  const empty = !anyBooks && totalDeals === 0 && !ops.money?.moneyin && !ops.money?.moneyout && !ops.tasks?.open && !recv?.due;
  const delta = cashNow - cashThen;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{today()}</p>
          <h2 className="mt-1 text-white">{greeting(firstName(user.name, user.email))}</h2>
          <p className="mt-1 text-sm text-slate-400">Dashboard · figures come only from records kept in the portal.</p>
        </div>
        <LiveRefresh />
      </div>

      {empty ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-white">Nothing to report yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Figures appear here once money, invoices, deals and tasks are recorded.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {seeMoney ? <Link href="/portal/money" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">Record money</Link> : null}
            {seeDeals ? <Link href="/portal/deals" className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">Add a deal</Link> : null}
            {can(user.role, "invoices") ? <Link href="/portal/invoices?view=new" className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">Raise an invoice</Link> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-kpis>
            {seeBooks ? (
              <Link href="/portal/reports" className={`${card} block`}>
                <div className="flex items-center justify-between"><span className={label}>Group cash</span><Wallet className="h-4 w-4 text-slate-500" /></div>
                <div className="mt-2 text-2xl font-semibold text-white">{rupees(cashNow)}</div>
                <div className={`text-xs ${delta >= 0n ? "text-green-400" : "text-red-400"}`}>{delta >= 0n ? "▲" : "▼"} {compactRupees(delta < 0n ? -delta : delta)} this month</div>
                <Sparkline values={cash.map((c) => c.cash)} label="Cash over the last twelve months" />
              </Link>
            ) : null}
            {seeBooks ? (
              <Link href="/portal/reports" className={`${card} block`}>
                <div className="flex items-center justify-between"><span className={label}>Profit this year</span><BarChart3 className="h-4 w-4 text-slate-500" /></div>
                <div className={`mt-2 text-2xl font-semibold ${fyIncome - fyExpense >= 0n ? "text-white" : "text-red-400"}`}>{rupees(fyIncome - fyExpense)}</div>
                <div className="text-xs text-slate-500">Income {compactRupees(fyIncome)} · Expenses {compactRupees(fyExpense)}</div>
                <Sparkline values={(fy?.months ?? []).map((m) => m.income - m.expense)} label="Monthly profit this financial year" />
              </Link>
            ) : null}
            {recv ? (
              <Link href="/portal/invoices?view=receivables" className={`${card} block`}>
                <div className="flex items-center justify-between"><span className={label}>Owed to us</span><Receipt className="h-4 w-4 text-slate-500" /></div>
                <div className="mt-2 text-2xl font-semibold text-white">{rupees(recv.due)}</div>
                <div className={`text-xs ${recv.overdue > 0n ? "text-amber-400" : "text-slate-500"}`}>{recv.overdue > 0n ? `${compactRupees(recv.overdue)} overdue on ${recv.overdueCount} invoice${recv.overdueCount === 1 ? "" : "s"}` : "Nothing overdue"}</div>
              </Link>
            ) : null}
            {owner ? (
              <Link href="/portal/approvals" className={`${card} block`}>
                <div className="flex items-center justify-between"><span className={label}>Waiting for you</span><ClipboardCheck className="h-4 w-4 text-slate-500" /></div>
                <div className="mt-2 text-2xl font-semibold text-white">{pending}</div>
                <div className="text-xs text-slate-500">{pending ? "Approvals to decide" : "No approvals waiting"}</div>
              </Link>
            ) : null}
          </div>

          {urgent.length ? (
            <section className="rounded-xl border border-slate-800 bg-slate-900" data-attention>
              <div className="flex items-baseline justify-between gap-2 px-4 pt-4">
                <h3 className="text-sm font-semibold text-white">What needs attention</h3>
                <Link href="/portal/intelligence" className="text-xs text-blue-400 hover:text-blue-300">All insights ({urgent.length})</Link>
              </div>
              <InsightList items={urgent.slice(0, 4)} compact />
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            {fy ? (
              <section className={`${card} lg:col-span-2`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Income and expenses this year</h3>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: "var(--a-500)" }} />Income</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm" style={{ background: "color-mix(in oklab, var(--p-muted) 55%, transparent)" }} />Expenses</span>
                  </span>
                </div>
                <IncomeExpenseChart months={fy.months} />
              </section>
            ) : null}
            <section className={card} data-operations>
              <h3 className="mb-3 text-sm font-semibold text-white">Operations</h3>
              <dl className="divide-y divide-slate-800 text-sm">
                {seeDeals ? <div className="flex justify-between py-2"><dt className="text-slate-400">Deals</dt><dd className="font-medium text-white">{totalDeals}</dd></div> : null}
                {seeMoney ? <div className="flex justify-between py-2"><dt className="text-slate-400">Money in</dt><dd className="font-medium text-white">{inr(ops.money?.moneyin ?? 0)}</dd></div> : null}
                {seeMoney ? <div className="flex justify-between py-2"><dt className="text-slate-400">Paid out</dt><dd className="font-medium text-white">{inr(ops.money?.moneyout ?? 0)}</dd></div> : null}
                {seeTasks ? (
                  <div className="flex justify-between py-2"><dt className="text-slate-400">Open tasks</dt>
                    <dd className="font-medium text-white">{ops.tasks?.open ?? 0}{ops.tasks?.overdue ? <span className="ml-2 text-xs text-red-400">{ops.tasks.overdue} overdue</span> : null}</dd></div>
                ) : null}
              </dl>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {seeDeals && totalDeals > 0 ? (
              <section className={card}>
                <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Pipeline by stage</h3><Link href="/portal/deals" className="text-xs text-blue-400">Open <ArrowUpRight className="inline h-3 w-3" /></Link></div>
                <StageBars rows={STAGES.map((s) => { const r = ops.deals.find((d) => d.stage === s.id); return { label: stageLabel(s.id), n: r?.n ?? 0, value: r?.value ? compactRupees(BigInt(Math.round(Number(r.value) * 100))) : "" }; })} />
              </section>
            ) : null}
            <section className={card}>
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Your tasks</h3><ListChecks className="h-4 w-4 text-slate-500" /></div>
              {mine.length === 0 ? <p className="text-sm text-slate-500">Nothing due this week.</p> : (
                <ul className="space-y-2 text-sm">
                  {mine.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-2">
                      <Link href="/portal/tasks" className="truncate text-slate-300 hover:text-white">{t.title}</Link>
                      <span className={`shrink-0 text-xs ${t.overdue ? "text-red-400" : "text-slate-500"}`}>{t.due_date ?? "no date"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={card}>
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Next three days</h3><CalendarDays className="h-4 w-4 text-slate-500" /></div>
              {meetings.items.length === 0 ? <p className="text-sm text-slate-500">{meetings.accounts.length ? "No meetings." : "Connect a calendar under Inbox → Accounts."}</p> : (
                <ul className="space-y-2 text-sm">
                  {meetings.items.slice(0, 6).map((m) => (
                    <li key={`${m.accountId}:${m.id}`} className="flex items-baseline justify-between gap-2">
                      <Link href="/portal/calendar" className="truncate text-slate-300 hover:text-white">{m.title}</Link>
                      <span className="shrink-0 text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(m.start))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** External people: only what is linked to them, never firm-wide figures. */
async function MyDashboard({ userId, name }: { userId: string; name: string }) {
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{today()}</p>
          <h2 className="mt-1 text-white">{greeting(name)}</h2>
          <p className="mt-1 text-sm text-slate-400">Dashboard · what is linked to you in the portal.</p>
        </div>
        <LiveRefresh />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([l, v, href]) => (
          <Link key={l} href={href} className={`${card} block`}>
            <div className={label}>{l}</div>
            <div className="mt-2 text-xl font-semibold text-white">{v}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
