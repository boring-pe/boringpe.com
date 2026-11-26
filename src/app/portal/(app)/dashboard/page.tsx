import Link from "next/link";
import { Activity, BarChart3, CalendarDays, CheckCircle2, ChevronRight, ListChecks, Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { rupees } from "@/lib/accounting";
import { countPending } from "@/lib/approvals";
import { agenda } from "@/lib/calendar";
import { requireSection } from "@/lib/dal";
import { cashByWorkspace, cashTrend, myUpcomingTasks, periodFlows, receivablesTotals, recentActivity } from "@/lib/dashboard";
import { bucketLabel, bucketSpan, parsePeriod, pctChange, PERIODS, periodRange, rangeLabel, todayIST } from "@/lib/dashboard-calc";
import { workspaceLabel } from "@/lib/workspace-calc";
import { workspaceContext } from "@/lib/workspaces";
import { toTxns } from "@/lib/investments";
import { listTasks, summary, unpostedMoneyCount } from "@/lib/ops";
import { inr, stageLabel, STAGES } from "@/lib/ops-fields";
import { position } from "@/lib/portfolio-calc";
import { can, canSeeFirmData } from "@/lib/rbac";
import { myView } from "@/lib/scopes";
import { firmInsights } from "@/lib/insights";
import { compactRupees, Sparkline, StageBars } from "./charts";
import { FlowChart } from "./flow-chart-lazy";
import type { FlowPoint } from "./flow-chart";
import { PeriodPicker } from "./period-picker";
import { Tabs } from "./tabs";
import { LiveRefresh } from "./live";
import { switchWorkspace } from "../_shell/prefs-actions";
import { GUIDES, progress } from "@/lib/guides-calc";
import { guideFacts } from "@/lib/guides";
import { Checklist } from "../guides/checklist";
import { DueChip, EmptyState, dueState } from "../_shell/status";
import { IntentLink, PendingVeil } from "../_shell/nav-link";

const card = "rounded-xl border border-slate-800 bg-slate-900 p-5";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";
const lift = "transition-[transform,border-color,box-shadow] hover:border-slate-700 hover:shadow-md motion-safe:hover:-translate-y-0.5";

function greeting(name: string) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}
const today = () => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
const firstName = (name: string | null, email: string) => (name ?? email.split("@")[0]).split(" ")[0];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "money_out_awaiting_approval" → "Money out awaiting approval". */
const words = (a: string) => a.replace(/_/g, " ").replace(/\b2fa\b/, "two-step").replace(/^./, (c) => c.toUpperCase());
const rupeesNum = (p: bigint) => Number(p) / 100;
const bucketTitle = (key: string) =>
  new Date(`${key.length === 7 ? `${key}-01` : key}T00:00:00Z`).toLocaleString("en-IN", key.length === 7
    ? { month: "long", year: "numeric", timeZone: "UTC" }
    : { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** One thing someone has to do, in the order it matters: overdue, due soon, then the rest. */
type Todo = { key: string; label: string; cta: string; href: string; tone: "overdue" | "soon" | "info" };
const TONE: Record<Todo["tone"], string> = { overdue: "var(--p-late)", soon: "var(--p-warn)", info: "var(--a-500)" };

/** A headline figure that opens the page behind it. */
function Tile({ href, title, icon: Icon, value, children, accent = false, data }: { href: string; title: string; icon: LucideIcon; value: string; children?: React.ReactNode; accent?: boolean; data: string }) {
  return (
    <IntentLink
      href={href}
      data-kpi={data}
      className={`group relative block rounded-xl border p-4 ${lift} ${accent ? "border-transparent bg-blue-600 text-white" : "border-slate-800 bg-slate-900"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${accent ? "text-white/85" : "text-slate-400"}`}>{title}</span>
        <Icon aria-hidden className={`h-4 w-4 ${accent ? "text-white/70" : "text-slate-500"}`} />
      </div>
      <div className={`mt-1.5 break-words text-xl font-semibold tabular-nums tracking-tight text-white sm:text-2xl`}>{value}</div>
      <div className={`mt-0.5 text-xs ${accent ? "text-white/80" : "text-slate-500"}`}>{children}</div>
      <PendingVeil />
    </IntentLink>
  );
}

/** "▲ 12.5% vs same days last year", green only when more is better. */
function Change({ pct, compare, goodWhenUp }: { pct: number | null; compare: string; goodWhenUp: boolean }) {
  if (pct === null) return <span>nothing to compare with yet</span>;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const good = goodWhenUp && up;
  return (
    <span className="inline-flex items-center gap-1" data-change>
      <Icon aria-hidden className={`h-3.5 w-3.5 ${good ? "text-green-400" : "text-slate-400"}`} />
      <span className={good ? "text-green-400" : "text-slate-300"}>{up ? "+" : "−"}{Math.abs(pct).toLocaleString("en-IN")}%</span>
      <span>{compare}</span>
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireSection("dashboard");
  if (!canSeeFirmData(user.role)) return <MyDashboard userId={user.id} name={firstName(user.name, user.email)} />;

  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const range = periodRange(period, todayIST());
  const periodName = PERIODS.find((p) => p.value === period)!.label;

  const seeDeals = can(user.role, "deals");
  const seeMoney = can(user.role, "money");
  const seeTasks = can(user.role, "tasks");
  const seeBooks = can(user.role, "books");
  const seeReports = can(user.role, "reports");
  const seeInvoices = can(user.role, "invoices");
  const seeActivity = can(user.role, "activity");
  const owner = user.role === "super_admin";
  const seeInsights = can(user.role, "intelligence");
  const ws = await workspaceContext();
  // The owner sees the setup checklist until every step is done.
  const setupGuide = GUIDES.find((g) => g.id === "setup")!;
  const setup = owner ? { p: progress(setupGuide, await guideFacts(user.id), () => true) } : null;
  const [ops, cash, flows, recv, pending, mine, meetings, intel, perWorkspace, unposted, activity] = await Promise.all([
    summary(),
    seeBooks ? cashTrend(12) : Promise.resolve([]),
    seeBooks ? periodFlows(range) : Promise.resolve(null),
    seeInvoices ? receivablesTotals() : Promise.resolve(null),
    owner ? countPending() : Promise.resolve(0),
    myUpcomingTasks(user.id),
    agenda(user.id, 3).catch(() => ({ items: [], accounts: [], errors: [] })),
    seeInsights ? firmInsights() : Promise.resolve(null),
    ws.view === "all" && seeBooks ? cashByWorkspace() : Promise.resolve([]),
    seeBooks && seeMoney ? unpostedMoneyCount() : Promise.resolve(0),
    seeActivity ? recentActivity(8) : Promise.resolve([]),
  ]);
  const urgent = (intel?.insights ?? []).filter((i) => i.severity === "critical" || i.severity === "warning");

  const totalDeals = ops.deals.reduce((n, d) => n + d.n, 0);
  const cashNow = cash.at(-1)?.cash ?? 0n;
  const cashThen = cash.at(-2)?.cash ?? 0n;
  const delta = cashNow - cashThen;
  const income = flows?.income ?? 0n;
  const expense = flows?.expense ?? 0n;
  const anyFlows = !!flows && (income !== 0n || expense !== 0n || flows.prevIncome !== 0n || flows.prevExpense !== 0n || flows.buckets.some((b) => b.lastYearIncome !== 0n));
  const anyBooks = cash.some((c) => c.cash !== 0n) || anyFlows;
  const empty = !anyBooks && totalDeals === 0 && !ops.money?.moneyin && !ops.money?.moneyout && !ops.tasks?.open && !recv?.due;
  const reportHref = (from: string, to: string) => (seeReports ? `/portal/reports?from=${from}&to=${to}` : "/portal/books?view=reports");
  const today_ = todayIST();

  // What needs doing, most pressing first. Each row opens the place where it gets done.
  const myOverdue = mine.filter((t) => t.overdue).length;
  const mySoon = mine.filter((t) => !t.overdue && t.due_date && dueState(t.due_date, today_) === "dueSoon").length;
  const todos: Todo[] = [
    ...(recv && recv.overdueCount > 0 ? [{ key: "ar", label: `${plural(recv.overdueCount, "invoice")} overdue: ${compactRupees(recv.overdue)} to collect`, cta: "Chase", href: "/portal/invoices?view=receivables", tone: "overdue" as const }] : []),
    ...(myOverdue ? [{ key: "tasks-late", label: `${plural(myOverdue, "of your tasks", "of your tasks")} overdue`, cta: "Open", href: "/portal/tasks", tone: "overdue" as const }] : []),
    ...urgent.filter((i) => i.severity === "critical").slice(0, 3).map((i) => ({ key: i.id, label: i.title, cta: "See why", href: i.href, tone: "overdue" as const })),
    ...(pending ? [{ key: "approvals", label: `${plural(pending, "approval")} waiting for your decision`, cta: "Decide", href: "/portal/approvals", tone: "soon" as const }] : []),
    ...(mySoon ? [{ key: "tasks-soon", label: `${plural(mySoon, "task")} due this week`, cta: "Open", href: "/portal/tasks", tone: "soon" as const }] : []),
    ...urgent.filter((i) => i.severity === "warning").slice(0, 3).map((i) => ({ key: i.id, label: i.title, cta: "See why", href: i.href, tone: "soon" as const })),
    ...(unposted ? [{ key: "unposted", label: `${plural(unposted, "money entry", "money entries")} not in the books yet`, cta: "Post", href: "/portal/money", tone: "info" as const }] : []),
  ];

  const points: FlowPoint[] = (flows?.buckets ?? []).map((b) => {
    const [from, to] = bucketSpan(b.key, range.from, range.to);
    return { key: b.key, label: bucketLabel(b.key), title: bucketTitle(b.key), income: rupeesNum(b.income), expense: rupeesNum(b.expense), lastYear: rupeesNum(b.lastYearIncome), href: reportHref(from, to) };
  });

  const strip: { label: string; value: React.ReactNode; href: string; data: string }[] = [
    ...(seeDeals ? [{ label: "Deals", value: totalDeals, href: "/portal/deals", data: "deals" }] : []),
    ...(seeMoney ? [{ label: "Money in", value: inr(ops.money?.moneyin ?? 0), href: "/portal/money", data: "money-in" }] : []),
    ...(seeMoney ? [{ label: "Paid out", value: inr(ops.money?.moneyout ?? 0), href: "/portal/money", data: "paid-out" }] : []),
    ...(seeTasks ? [{
      label: "Open tasks",
      value: <>{ops.tasks?.open ?? 0}{ops.tasks?.overdue ? <span className="ml-2 align-middle"><DueChip state="overdue" label={`${ops.tasks.overdue} overdue`} /></span> : null}</>,
      href: "/portal/tasks", data: "tasks",
    }] : []),
    ...(owner ? [{ label: "Approvals waiting", value: pending, href: "/portal/approvals", data: "approvals" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{today()}</p>
          <h2 className="mt-1 text-white">{greeting(firstName(user.name, user.email))}</h2>
          <p className="mt-1 text-sm text-slate-400" data-dashboard-scope>
            {workspaceLabel(ws.view)} · figures come only from records kept in the portal.
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {seeBooks && !empty ? <PeriodPicker current={period} /> : null}
          <LiveRefresh />
        </div>
      </div>

      {setup && !setup.p.complete ? (
        <div data-getting-started>
          <Checklist id="setup" title="Getting started" summary="A few steps to make the portal safe and ready for the team." p={setup.p} compact />
        </div>
      ) : null}

      {perWorkspace.length ? (
        <div className="grid gap-3 sm:grid-cols-3" data-by-workspace>
          {perWorkspace.map((w) => (
            <form key={w.workspace} action={switchWorkspace.bind(null, w.workspace)}>
              <button className={`${card} ${lift} flex w-full items-center justify-between gap-3 text-left`} data-workspace-cash={w.workspace}>
                <span>
                  <span className={label}>{workspaceLabel(w.workspace)} · cash</span>
                  <span className="mt-1.5 block text-xl font-semibold tabular-nums text-white">{rupees(w.cash)}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-slate-400">Open<ChevronRight aria-hidden className="h-3.5 w-3.5" /></span>
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {empty ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-10 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-slate-600" />
          <h3 className="mt-4 text-base font-semibold text-white">Nothing to report yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Figures appear here once money, invoices, deals and tasks are recorded.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {seeMoney ? <Link href="/portal/money" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">Record money</Link> : null}
            {seeDeals ? <Link href="/portal/deals" className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">Add a deal</Link> : null}
            {seeInvoices ? <Link href="/portal/invoices?view=new" className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">Raise an invoice</Link> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]" data-kpis>
            {seeBooks ? (
              <Tile href={reportHref(range.from, range.to)} title={ws.view === "personal" ? "Cash today" : "Group cash today"} icon={Wallet} value={rupees(cashNow)} accent data="cash">
                {delta >= 0n ? "+" : "−"}{compactRupees(delta < 0n ? -delta : delta)} this month
                <span className="block text-white"><Sparkline values={cash.map((c) => c.cash)} label="Cash at the end of each of the last twelve months" /></span>
              </Tile>
            ) : null}
            {flows ? (
              <Tile href={reportHref(range.from, range.to)} title="Income" icon={TrendingUp} value={rupees(income)} data="income">
                <Change pct={pctChange(income, flows.prevIncome)} compare={range.compare} goodWhenUp />
              </Tile>
            ) : null}
            {flows ? (
              <Tile href={reportHref(range.from, range.to)} title="Expenses" icon={BarChart3} value={rupees(expense)} data="expense">
                <Change pct={pctChange(expense, flows.prevExpense)} compare={range.compare} goodWhenUp={false} />
              </Tile>
            ) : null}
            {recv ? (
              <Tile href="/portal/invoices?view=receivables" title="Owed to us" icon={Receipt} value={rupees(recv.due)} data="receivables">
                {recv.overdue > 0n ? <DueChip state="overdue" label={`${compactRupees(recv.overdue)} overdue`} /> : "nothing overdue"}
              </Tile>
            ) : null}
          </div>

          {strip.length ? (
            <div className="flex flex-wrap rounded-xl border border-slate-800 bg-slate-900 p-1" data-operations>
              {strip.map((s, i) => (
                <IntentLink key={s.label} href={s.href} data-strip={s.data} className={`relative flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-slate-800/60 ${i ? "sm:border-l sm:border-slate-800 sm:rounded-none" : ""}`}>
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className="text-base font-semibold tabular-nums text-white">{s.value}</span>
                <PendingVeil />
                </IntentLink>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
            {flows ? (
              <section className={`${card} lg:col-span-7`} data-flows>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Income and expenses</h3>
                    <p className="text-xs text-slate-500">{periodName} · {rangeLabel(range.from, range.to)}</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${income - expense < 0n ? "text-red-400" : "text-white"}`} data-net>
                    Net {rupees(income - expense)}
                  </span>
                </div>
                {income === 0n && expense === 0n && !points.some((p) => p.lastYear) ? (
                  <EmptyState
                    compact
                    icon={BarChart3}
                    title="No income or expenses in this period"
                    body={anyBooks ? "Your books have entries, just not between these dates." : "They show here once entries are posted to the books."}
                    action={anyBooks ? { label: "Show the last 12 months", href: "/portal/dashboard?period=12m" } : seeMoney ? { label: "Record money", href: "/portal/money" } : undefined}
                  />
                ) : (
                  <>
                    <FlowChart data={points} />
                    <details className="mt-3 group">
                      <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-white [&::-webkit-details-marker]:hidden">
                        <ChevronRight aria-hidden className="mr-1 inline h-3.5 w-3.5 transition-transform group-open:rotate-90" />See the figures
                      </summary>
                      <div className="mt-2 max-h-72 overflow-auto">
                        <table className="w-full text-xs tabular-nums" data-flow-table>
                          <thead className="text-slate-500"><tr><th className="py-1 text-left font-medium">{range.bucket === "day" ? "Day" : "Month"}</th><th className="py-1 text-right font-medium">Income</th><th className="py-1 text-right font-medium">Expenses</th><th className="py-1 text-right font-medium">Net</th></tr></thead>
                          <tbody className="divide-y divide-slate-800">
                            {(flows.buckets).filter((b) => b.income || b.expense).map((b) => (
                              <tr key={b.key}>
                                <td className="py-1"><Link href={points.find((p) => p.key === b.key)!.href} className="text-slate-300 hover:text-white">{bucketTitle(b.key)}</Link></td>
                                <td className="py-1 text-right text-slate-300">{rupees(b.income)}</td>
                                <td className="py-1 text-right text-slate-300">{rupees(b.expense)}</td>
                                <td className={`py-1 text-right ${b.income - b.expense < 0n ? "text-red-400" : "text-white"}`}>{rupees(b.income - b.expense)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                )}
              </section>
            ) : null}

            {todos.length ? (
              <section className={`rounded-xl border border-slate-800 bg-slate-900 p-4 ${flows ? "lg:col-span-5" : "lg:col-span-12"}`} data-attention>
                <div className="mb-2 flex items-center gap-3 px-1">
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] text-sm font-bold text-white" style={{ borderColor: todos.some((t) => t.tone === "overdue") ? TONE.overdue : TONE.soon }}>{todos.length}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">What needs attention</h3>
                    <p className="text-xs text-slate-500">
                      {plural(todos.length, "thing")} to do{todos.some((t) => t.tone === "overdue") ? ` · ${todos.filter((t) => t.tone === "overdue").length} overdue` : ""}
                    </p>
                  </div>
                  {seeInsights ? <Link href="/portal/intelligence" className="shrink-0 text-xs text-blue-400 hover:text-blue-300">All insights</Link> : null}
                </div>
                <ul className="space-y-1">
                  {todos.map((t) => (
                    <li key={t.key}>
                      <IntentLink href={t.href} data-todo={t.key} data-tone={t.tone} className="group relative flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-slate-800/60">
                        <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: TONE[t.tone] }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[t.tone] }} />
                        </span>
                        <span className="min-w-0 flex-1 text-sm leading-snug text-slate-200">{t.label}</span>
                        <span className="shrink-0 rounded-md border border-slate-700 px-2 py-0.5 text-xs font-medium text-slate-200 group-hover:border-slate-500" style={t.tone === "overdue" ? { color: TONE.overdue, borderColor: "color-mix(in oklab, var(--p-late) 45%, transparent)" } : undefined}>
                          {t.cta}
                        </span>
                      <PendingVeil />
                      </IntentLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section className={`${card} flex items-center gap-3 ${flows ? "lg:col-span-5 lg:flex-col lg:justify-center lg:text-center" : "lg:col-span-12"}`} data-all-clear>
                <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0" style={{ color: "var(--p-good)" }} />
                <div>
                  <h3 className="text-sm font-semibold text-white">All clear</h3>
                  <p className="mt-0.5 text-sm text-slate-400">Nothing overdue, nothing waiting for you.</p>
                </div>
              </section>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            {seeDeals && totalDeals > 0 ? (
              <section className={`${card} lg:col-span-5`} data-pipeline>
                <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Pipeline by stage</h3><Link href="/portal/deals" className="inline-flex items-center text-xs text-blue-400 hover:text-blue-300">Open deals<ChevronRight aria-hidden className="h-3.5 w-3.5" /></Link></div>
                <StageBars rows={STAGES.map((s) => { const r = ops.deals.find((d) => d.stage === s.id); return { label: stageLabel(s.id), n: r?.n ?? 0, value: r?.value ? compactRupees(BigInt(Math.round(Number(r.value) * 100))) : "", href: "/portal/deals" }; })} />
              </section>
            ) : null}
            <section className={`rounded-xl border border-slate-800 bg-slate-900 ${seeDeals && totalDeals > 0 ? "lg:col-span-7" : "lg:col-span-12"}`} data-lists>
              <Tabs
                label="Your lists"
                tabs={[
                  {
                    id: "tasks", label: "Your tasks", count: mine.length,
                    content: mine.length === 0 ? <EmptyState compact icon={ListChecks} title="Nothing due this week" body="Tasks assigned to you show here a week before they are due." action={seeTasks ? { label: "Add a task", href: "/portal/tasks#add" } : undefined} /> : (
                      <ul className="divide-y divide-slate-800 text-sm">
                        {mine.map((t) => {
                          const due = t.due_date ? dueState(t.due_date, today_) : null;
                          return (
                            <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                              <Link href="/portal/tasks" className="truncate text-slate-200 hover:text-white">{t.title}</Link>
                              <span className="inline-flex shrink-0 items-center gap-2 text-xs text-slate-500">{t.due_date ?? "no date"}{due ? <DueChip state={due} /> : null}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ),
                  },
                  {
                    id: "meetings", label: "Next three days", count: meetings.items.length,
                    content: meetings.items.length === 0 ? (
                      <EmptyState compact icon={CalendarDays} title={meetings.accounts.length ? "No meetings" : "No calendar connected"} body={meetings.accounts.length ? "Nothing in the next three days." : "Connect a calendar under Inbox, then Accounts, to see meetings here."} action={meetings.accounts.length ? undefined : { label: "Connect a calendar", href: "/portal/inbox?view=accounts" }} />
                    ) : (
                      <ul className="divide-y divide-slate-800 text-sm">
                        {meetings.items.slice(0, 8).map((m) => (
                          <li key={`${m.accountId}:${m.id}`} className="flex items-center justify-between gap-2 py-2">
                            <Link href="/portal/calendar" className="truncate text-slate-200 hover:text-white">{m.title}</Link>
                            <span className="shrink-0 text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(m.start))}</span>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                  ...(seeActivity ? [{
                    id: "activity", label: "Recent activity",
                    content: activity.length === 0 ? <EmptyState compact icon={Activity} title="Nothing yet" body="What people do in the portal shows here." /> : (
                      <>
                        <ol className="divide-y divide-slate-800 text-sm">
                          {activity.map((a) => (
                            <li key={a.id} className="flex items-center gap-2.5 py-2">
                              <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-[11px] font-semibold uppercase text-slate-300">{(a.actor_email ?? "sy").slice(0, 2)}</span>
                              <span className="min-w-0 flex-1 truncate text-slate-300"><span className="text-white">{a.actor_email?.split("@")[0] ?? "System"}</span> · {words(a.action)}</span>
                              <span className="shrink-0 text-xs text-slate-500">{a.at.slice(5).replace("-", "/")}</span>
                            </li>
                          ))}
                        </ol>
                        <Link href="/portal/activity" className="mt-2 inline-flex items-center text-xs text-blue-400 hover:text-blue-300">All activity<ChevronRight aria-hidden className="h-3.5 w-3.5" /></Link>
                      </>
                    ),
                  }] : []),
                ]}
              />
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
