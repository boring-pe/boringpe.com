"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { requireSection } from "@/lib/dal";
import { listEntities } from "@/lib/books";
import { listAssignees, listDeals } from "@/lib/ops";
import { can, canSeeFirmData } from "@/lib/rbac";
import { MONEY_NOTICES, DEAL_NOTICES, TASK_NOTICES, type Notice } from "@/lib/notices";
import { addTask } from "../tasks/actions";
import { addEntry } from "../money/actions";
import { addDeal } from "../deals/actions";

export type QuickKind = "task" | "money" | "deal";
export type QuickResult = { ok: boolean; text: string; href: string; at: number } | null;
type Option = { id: string; label: string };
export type QuickOptions = { assignees: Option[]; deals: Option[]; entities: (Option & { main: boolean })[]; me: string };

const RUN: Record<QuickKind, { action: (f: FormData) => Promise<void>; notices: Record<string, Notice>; href: string; section: "tasks" | "money" | "deals" }> = {
  task: { action: addTask, notices: TASK_NOTICES, href: "/portal/tasks", section: "tasks" },
  money: { action: addEntry, notices: MONEY_NOTICES, href: "/portal/money", section: "money" },
  deal: { action: addDeal, notices: DEAL_NOTICES, href: "/portal/deals", section: "deals" },
};

/**
 * Runs the page's own create action from the quick-add panel, so the checks, approvals, audit
 * and notifications are exactly the page's. Those actions finish by sending the browser to their
 * page with a notice; here that redirect is caught and its notice is answered in the panel
 * instead, so the person stays where they were. Any other redirect (signed out, no access) goes ahead.
 */
export async function quickAdd(kind: QuickKind, _prev: QuickResult, formData: FormData): Promise<QuickResult> {
  const run = RUN[kind];
  if (!run) return { ok: false, text: "That cannot be added from here.", href: "/portal/dashboard", at: Date.now() };
  try {
    await run.action(formData);
  } catch (e) {
    if (!isRedirectError(e)) throw e;
    const url = new URL(getURLFromRedirectError(e), "http://portal.local");
    const notice = run.notices[url.searchParams.get("notice") ?? ""];
    if (url.pathname !== run.href || !notice) throw e;
    if (!notice.bad) revalidatePath("/portal", "layout");
    return { ok: !notice.bad, text: notice.text, href: run.href, at: Date.now() };
  }
  return { ok: true, text: "Saved.", href: run.href, at: Date.now() };
}

/** The choices a quick-add form offers, fetched when the panel opens so pages carry none of it. */
export async function quickOptions(kind: QuickKind): Promise<QuickOptions> {
  const user = await requireSection(RUN[kind].section);
  const firm = canSeeFirmData(user.role);
  const [assignees, deals, entities] = await Promise.all([
    kind === "task" && firm ? listAssignees() : Promise.resolve([]),
    (kind === "task" || kind === "money") && can(user.role, "deals") ? listDeals() : Promise.resolve([]),
    kind === "money" ? listEntities() : Promise.resolve([]),
  ]);
  return {
    me: user.id,
    assignees: assignees.map((a) => ({ id: a.id, label: a.label })),
    deals: deals.map((d) => ({ id: d.id, label: d.name })),
    entities: entities.map((x) => ({ id: x.id, label: `Books of ${x.name}`, main: x.kind === "boring_pe" })),
  };
}
