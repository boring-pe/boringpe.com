import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { credentials } from "@/lib/integrations";
import { MAIL_PROVIDERS, mailboxesFor, mayUse, mockEnabled, readMessage, unifiedInbox, type MailAccount } from "@/lib/mail";
import { emailFrameDoc } from "@/lib/mail-providers";
import { connectTestMailbox, mailboxAction, send } from "./actions";

const NOTICES: Record<string, { text: string; bad?: boolean }> = {
  sent: { text: "Sent." },
  connected: { text: "Mailbox connected." },
  share: { text: "Shared with the Boring PE team." },
  unshare: { text: "Now private to you." },
  remove: { text: "Mailbox disconnected from the portal." },
  cancelled: { text: "Connection cancelled.", bad: true },
  "connect-failed": { text: "Could not connect that mailbox. The Integrations activity log has the reason.", bad: true },
  "not-setup": { text: "That provider is not set up yet. The Super Admin adds its app under Integrations.", bad: true },
  "send-failed": { text: "The provider refused to send it. Check the mailbox under Accounts.", bad: true },
  invalid: { text: "That was not valid. Recipients must be email addresses, separated by commas.", bad: true },
  forbidden: { text: "You cannot use that mailbox.", bad: true },
};
const card = "bg-slate-900 border border-slate-800 rounded-xl";
const input = "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none";
const btn = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500";
const PROVIDER_LABEL: Record<string, string> = { google: "Gmail", microsoft: "Outlook", zoho: "Zoho", mock: "Test" };
const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; a?: string; m?: string; q?: string; notice?: string }>;
}) {
  const user = await requireSection("inbox");
  const sp = await searchParams;
  const accounts = await mailboxesFor(user.id, user.role);
  const banner = sp.notice ? NOTICES[sp.notice] : undefined;
  const view = sp.m ? "message" : sp.view === "compose" || sp.view === "accounts" ? sp.view : "inbox";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Inbox</h2>
          <p className="mt-2 text-sm text-slate-400">Every connected mailbox in one place: Gmail, Outlook and Zoho.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/inbox" className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white">Inbox</Link>
          <Link href="/portal/inbox?view=compose" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500">Compose</Link>
          <Link href="/portal/inbox?view=accounts" className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white">Accounts</Link>
        </div>
      </div>
      {banner ? <p role="status" className={`rounded-md border px-3 py-2 text-sm ${banner.bad ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-blue-500/30 bg-blue-500/10 text-blue-200"}`}>{banner.text}</p> : null}
      {view === "accounts" ? <Accounts accounts={accounts} userId={user.id} />
        : accounts.length === 0 ? <p className="text-sm text-slate-500">No mailbox connected yet. <Link href="/portal/inbox?view=accounts" className="text-blue-300">Connect one</Link>.</p>
        : view === "compose" ? <Compose accounts={accounts} />
        : view === "message" ? <Message accounts={accounts} accountId={sp.a ?? ""} messageId={sp.m ?? ""} userId={user.id} role={user.role} />
        : <List accounts={accounts} only={sp.a} q={sp.q} />}
    </div>
  );
}

async function List({ accounts, only, q }: { accounts: MailAccount[]; only?: string; q?: string }) {
  const chosen = only ? accounts.filter((a) => a.id === only) : accounts;
  const { items, errors } = await unifiedInbox(chosen, q?.slice(0, 200));
  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap gap-2">
        <select name="a" defaultValue={only ?? ""} className={`${input} w-auto`} aria-label="Mailbox">
          <option value="">All mailboxes</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
        </select>
        <input name="q" defaultValue={q ?? ""} placeholder="Search" className={`${input} w-auto flex-1`} />
        <button className={btn}>Search</button>
      </form>
      {errors.map((e) => <p key={e.email} className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{e.email}: {e.message}</p>)}
      <ul className={`${card} divide-y divide-slate-800`}>
        {items.length === 0 ? <li className="px-4 py-6 text-sm text-slate-500">No messages.</li> : items.map((m) => (
          <li key={`${m.accountId}:${m.id}`} data-mail={m.subject}>
            <Link href={`/portal/inbox?a=${m.accountId}&m=${encodeURIComponent(m.id)}`} className="block px-4 py-3 hover:bg-slate-800/60">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`truncate text-sm ${m.unread ? "font-semibold text-white" : "text-slate-300"}`}>{m.from}</span>
                <span className="text-xs text-slate-500">{when(m.date)} · {PROVIDER_LABEL[m.provider]} {m.accountEmail}</span>
              </div>
              <div className={`truncate text-sm ${m.unread ? "text-white" : "text-slate-400"}`}>{m.subject || "(no subject)"}</div>
              <div className="truncate text-xs text-slate-500">{m.snippet}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Message({ accounts, accountId, messageId, userId, role }: { accounts: MailAccount[]; accountId: string; messageId: string; userId: string; role: Parameters<typeof mayUse>[2] }) {
  const account = accounts.find((a) => a.id === accountId);
  if (!account || !mayUse(account, userId, role)) return <p className="text-sm text-slate-500">That message is not in a mailbox you can open.</p>;
  let m;
  try {
    m = await readMessage(account.id, messageId);
  } catch (err) {
    return <p className="text-sm text-red-300">Could not open it: {(err as Error).message}</p>;
  }
  const replyTo = m.from.match(/<([^>]+)>/)?.[1] ?? m.from;
  return (
    <div className="space-y-4">
      <article className={`${card} p-5 space-y-3`}>
        <h3 className="text-lg font-semibold text-white">{m.subject || "(no subject)"}</h3>
        <div className="text-sm text-slate-400">From {m.from}<br />To {m.to}{m.cc ? <><br />Cc {m.cc}</> : null}<br />{when(m.date)} · in {account.email}</div>
        {m.html ? (
          <iframe title="Message" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={emailFrameDoc(m.html)} className="paper h-[60vh] w-full rounded-md bg-white" data-mail-frame />
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-950 p-4 text-sm text-slate-200">{m.text}</pre>
        )}
      </article>
      <section className={`${card} p-5`}>
        <h3 className="mb-3 text-sm font-semibold text-white">Reply from {account.email}</h3>
        <form action={send} className="space-y-3">
          <input type="hidden" name="accountId" value={account.id} />
          <input type="hidden" name="replyId" value={m.id} />
          <input name="to" defaultValue={replyTo} className={input} aria-label="To" />
          <input name="subject" defaultValue={m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`} className={input} aria-label="Subject" />
          <textarea name="body" required rows={6} placeholder="Write your reply" className={input} />
          <button className={btn}>Send reply</button>
        </form>
      </section>
    </div>
  );
}

function Compose({ accounts }: { accounts: MailAccount[] }) {
  return (
    <section className={`${card} p-5`}>
      <form action={send} className="space-y-3">
        <select name="accountId" className={input} aria-label="From">{accounts.map((a) => <option key={a.id} value={a.id}>From {a.email}</option>)}</select>
        <input name="to" required placeholder="To (comma-separated)" className={input} />
        <input name="cc" placeholder="Cc" className={input} />
        <input name="subject" placeholder="Subject" className={input} />
        <textarea name="body" required rows={10} placeholder="Message" className={input} />
        <button className={btn}>Send</button>
      </form>
    </section>
  );
}

async function Accounts({ accounts, userId }: { accounts: MailAccount[]; userId: string }) {
  const ready = await Promise.all(MAIL_PROVIDERS.map(async (p) => ({ ...p, ready: Boolean((await credentials(p.id))?.clientId) })));
  return (
    <div className="space-y-6">
      <section className={`${card} p-5 space-y-3`}>
        <h3 className="text-sm font-semibold text-white">Connect a mailbox</h3>
        <p className="text-xs text-slate-500">You approve access at the provider. Your mailbox stays private unless you share it with the team.</p>
        <div className="flex flex-wrap gap-3">
          {ready.map((p) => p.ready ? (
            <a key={p.id} href={`/api/integrations/oauth/${p.id}/start`} className={btn}>Connect {p.name}</a>
          ) : (
            <span key={p.id} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-500" title="The Super Admin sets this up under Integrations">{p.name}: not set up</span>
          ))}
          {mockEnabled() ? <form action={connectTestMailbox}><button className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">Connect test mailbox</button></form> : null}
        </div>
      </section>
      <ul className={`${card} divide-y divide-slate-800`}>
        {accounts.length === 0 ? <li className="px-4 py-6 text-sm text-slate-500">None yet.</li> : accounts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-mailbox={a.email}>
            <div className="text-sm">
              <div className="text-white">{a.email} <span className="text-xs text-slate-500">{PROVIDER_LABEL[a.provider]}</span></div>
              <div className="text-xs text-slate-500">
                {a.user_id === userId ? (a.shared ? "Yours, shared with the team" : "Yours, private") : `Shared by ${a.owner_email}`}
                {a.status === "error" && a.last_error ? <span className="text-red-300"> · {a.last_error}</span> : null}
              </div>
            </div>
            {a.user_id === userId ? (
              <form action={mailboxAction} className="flex gap-3">
                <input type="hidden" name="id" value={a.id} />
                <button name="what" value={a.shared ? "unshare" : "share"} className="text-xs text-blue-300 hover:text-blue-200">{a.shared ? "Make private" : "Share with team"}</button>
                <button name="what" value="remove" className="text-xs text-red-300 hover:text-red-200">Disconnect</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
