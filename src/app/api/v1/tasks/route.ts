import { apiCaller, json } from "@/lib/api-auth";
import { emit } from "@/lib/integrations";
import { notifyUsers, userIdByEmail } from "@/lib/notify";
import { createTask } from "@/lib/ops";
import { oneLine, parseDate } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

export async function POST(request: Request) {
  const k = await apiCaller(request, "write:tasks");
  if (k instanceof Response) return k;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", message: "Send a JSON body." }, 400);
  }
  const title = oneLine(body.title, 200);
  const due = body.due ? parseDate(body.due) : null;
  if (title.length < 2 || (body.due && !due)) return json({ error: "invalid", message: "Need a title; due must be YYYY-MM-DD." }, 422);
  const assigneeId = typeof body.assignee_email === "string" ? await userIdByEmail(body.assignee_email) : null;
  if (body.assignee_email && !assigneeId) return json({ error: "invalid", message: "No user with that email." }, 422);
  await createTask({ title, dealId: null, assigneeId, due, by: k.created_by });
  await audit({ actorId: k.created_by, actorEmail: `api:${k.name} (${k.email})`, action: "task_added", detail: title });
  if (assigneeId) await notifyUsers([assigneeId], { kind: "task", title: `New task: ${title}`, body: due ? `Due ${due}` : "", href: "/portal/tasks" });
  await emit("task.created", { title, due, assignee_email: body.assignee_email ?? null });
  return json({ status: "created" }, 201);
}
