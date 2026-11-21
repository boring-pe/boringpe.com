"use server";

import { redirect } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { createTask, getDeal, listAssignees, setTaskDone } from "@/lib/ops";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { can, canSeeFirmData } from "@/lib/rbac";
import { notifyUsers } from "@/lib/notify";
import { audit } from "@/lib/users";

function back(notice: string): never {
  redirect(`/portal/tasks?notice=${notice}`);
}

export async function addTask(formData: FormData) {
  const user = await requireSection("tasks");
  const title = oneLine(formData.get("title"), 200);
  const dueRaw = String(formData.get("due") ?? "");
  const due = dueRaw ? parseDate(dueRaw) : null;
  if (title.length < 2 || (dueRaw && !due)) back("invalid");

  // Linking to a deal is for people who can see deals; everyone else's link is ignored.
  let dealId: string | null = null;
  const dealRaw = String(formData.get("dealId") ?? "");
  if (dealRaw && can(user.role, "deals")) {
    if (!(await getDeal(dealRaw))) back("invalid");
    dealId = dealRaw;
  }
  let assigneeId: string | null = null;
  const assigneeRaw = String(formData.get("assigneeId") ?? "");
  if (assigneeRaw) {
    // External people can only give tasks to themselves.
    if (!canSeeFirmData(user.role) && assigneeRaw !== user.id) back("invalid");
    if (!(await listAssignees()).some((a) => a.id === assigneeRaw)) back("invalid");
    assigneeId = assigneeRaw;
  }
  await createTask({ title, dealId, assigneeId, due, by: user.id });
  await audit({ actorId: user.id, actorEmail: user.email, action: "task_added", detail: title });
  if (assigneeId && assigneeId !== user.id) {
    await notifyUsers([assigneeId], { kind: "task", title: `New task: ${title}`, body: due ? `Due ${due}` : "", href: "/portal/tasks" });
  }
  back("added");
}

export async function toggleTask(formData: FormData) {
  const user = await requireSection("tasks");
  const done = formData.get("done") === "true";
  const onlyFor = canSeeFirmData(user.role) ? null : user.id;
  if (!(await setTaskDone(String(formData.get("id") ?? ""), done, onlyFor))) back("invalid");
  await audit({ actorId: user.id, actorEmail: user.email, action: done ? "task_done" : "task_reopened" });
  back(done ? "done" : "reopened");
}
