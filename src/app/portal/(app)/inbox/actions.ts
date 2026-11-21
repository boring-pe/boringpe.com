"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { accountRow, connectMock, mayUse, readMessage, removeMailbox, sendMail, setShared } from "@/lib/mail";
import { oneLine } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

const EMAILS = /^([^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+)(\s*,\s*[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+)*$/;

export async function send(formData: FormData) {
  const user = await requireSection("inbox");
  const accountId = String(formData.get("accountId") ?? "");
  const replyId = String(formData.get("replyId") ?? "");
  const back = replyId ? `/portal/inbox?a=${encodeURIComponent(accountId)}&m=${encodeURIComponent(replyId)}` : "/portal/inbox?view=compose";
  const account = await accountRow(accountId);
  if (!account || !mayUse(account, user.id, user.role)) redirect(`${back}&notice=forbidden`);
  const to = String(formData.get("to") ?? "").trim();
  const cc = String(formData.get("cc") ?? "").trim();
  const subject = oneLine(formData.get("subject"), 300);
  const body = String(formData.get("body") ?? "").slice(0, 50_000);
  if (!EMAILS.test(to) || (cc && !EMAILS.test(cc)) || !body.trim()) redirect(`${back}&notice=invalid`);
  let ok = true;
  try {
    const replyTo = replyId ? await readMessage(accountId, replyId) : null;
    await sendMail(accountId, { to, cc, subject: subject || (replyTo ? `Re: ${replyTo.subject}` : "(no subject)"), body, replyTo });
  } catch (err) {
    ok = false;
    console.error("[mail]", (err as Error).message);
  }
  if (!ok) redirect(`${back}&notice=send-failed`);
  await audit({ actorId: user.id, actorEmail: user.email, action: "mail_sent", detail: `from ${account.email} to ${to}` });
  redirect(`/portal/inbox?notice=sent`);
}

export async function mailboxAction(formData: FormData) {
  const user = await requireSection("inbox");
  const id = String(formData.get("id") ?? "");
  const what = formData.get("what");
  let ok = false;
  if (what === "share" || what === "unshare") ok = await setShared(id, user.id, what === "share");
  else if (what === "remove") ok = await removeMailbox(id, user.id);
  if (!ok) redirect("/portal/inbox?view=accounts&notice=invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: `mailbox_${String(what)}`, detail: id });
  redirect(`/portal/inbox?view=accounts&notice=${String(what)}`);
}

/** Only when MAIL_TEST_MODE=1: a pretend mailbox for automated tests. */
export async function connectTestMailbox() {
  const user = await requireSection("inbox");
  if (!(await connectMock(user.id, user.email))) redirect("/portal/inbox?view=accounts&notice=invalid");
  redirect("/portal/inbox?view=accounts&notice=connected");
}
