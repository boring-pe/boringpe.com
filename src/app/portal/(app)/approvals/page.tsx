import { listApprovals, type ApprovalRow } from "@/lib/approvals";
import { APPROVAL_KINDS } from "@/lib/approval-kinds";
import { requireSection } from "@/lib/dal";
import { decide, requestApproval, withdrawRequest } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  requested: { text: "Request sent to the Super Admin." },
  withdrawn: { text: "Request withdrawn." },
  approved: { text: "Approved." },
  rejected: { text: "Rejected." },
  owner: { text: "As Super Admin you act directly; there is no one to ask.", bad: true },
  invalid: { text: "That request was not valid. Give it a short title.", bad: true },
  "too-many": { text: "You already have 20 requests waiting. Wait for decisions first.", bad: true },
  gone: { text: "That request was already decided or withdrawn.", bad: true },
};

const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const STATUS_STYLE: Record<ApprovalRow["status"], string> = {
  pending: "text-amber-400",
  approved: "text-green-400",
  rejected: "text-red-400",
  withdrawn: "text-slate-500",
};

function when(value: Date) {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function kindLabel(kind: string) {
  return APPROVAL_KINDS.find((item) => item.id === kind)?.label ?? kind;
}

function Item({ item, children }: { item: ApprovalRow; children?: React.ReactNode }) {
  return (
    <li className="px-6 py-4" data-approval={item.title}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs text-slate-500">{when(item.created_at)}</span>
        <span className="text-xs uppercase tracking-wide text-blue-400">{kindLabel(item.kind)}</span>
        <span className="text-white font-medium">{item.title}</span>
        <span className={`text-xs font-semibold ${STATUS_STYLE[item.status]}`}>{item.status}</span>
        <span className="text-xs text-slate-500">from {item.requested_by_email}</span>
      </div>
      {item.detail ? <p className="mt-2 text-sm text-slate-400 whitespace-pre-wrap">{item.detail}</p> : null}
      {item.decided_by_email ? (
        <p className="mt-2 text-xs text-slate-500">
          Decided by {item.decided_by_email}
          {item.decision_note ? `: ${item.decision_note}` : ""}
        </p>
      ) : null}
      {children}
    </li>
  );
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const me = await requireSection("approvals");
  const { notice } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const owner = me.role === "super_admin";

  const [waiting, history] = await Promise.all([
    listApprovals(owner ? { status: "pending" } : { status: "pending", requestedBy: me.id }),
    listApprovals(owner ? { limit: 30 } : { requestedBy: me.id, limit: 30 }),
  ]);
  const decided = history.filter((item) => item.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Approvals</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          {owner
            ? "Requests from the team wait here. Nothing they ask for happens until you decide."
            : "Ask the Super Admin to approve something. You will see the decision here."}
        </p>
      </div>

      {banner ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.bad
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-blue-500/30 bg-blue-500/10 text-blue-200"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {!owner ? (
        <section className={`${card} p-6`}>
          <h3 className="text-sm font-semibold text-white mb-4">New request</h3>
          <form action={requestApproval} className="grid gap-3 md:grid-cols-4">
            <select name="kind" defaultValue="other" className={input} aria-label="Kind">
              {APPROVAL_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
            <input name="title" required minLength={3} maxLength={140} placeholder="What needs approval" className={`${input} md:col-span-3`} />
            <textarea name="detail" maxLength={2000} rows={3} placeholder="Details (optional)" className={`${input} md:col-span-4`} />
            <div className="md:col-span-4">
              <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Send request
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">
            {owner ? "Waiting for you" : "My open requests"} ({waiting.length})
          </h3>
        </div>
        {waiting.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">Nothing is waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {waiting.map((item) => (
              <Item key={item.id} item={item}>
                {owner ? (
                  <form action={decide} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input name="note" maxLength={500} placeholder="Note (optional)" aria-label="Decision note" className={`${input} max-w-xs`} />
                    <button type="submit" name="status" value="approved" className="rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700">
                      Approve
                    </button>
                    <button type="submit" name="status" value="rejected" className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                      Reject
                    </button>
                  </form>
                ) : (
                  <form action={withdrawRequest} className="mt-3">
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
                      Withdraw
                    </button>
                  </form>
                )}
              </Item>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">{owner ? "Decided" : "My past requests"}</h3>
        </div>
        {decided.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-500">Nothing decided yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {decided.map((item) => (
              <Item key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
