"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSection, requireSuperAdmin } from "@/lib/dal";
import { isAiProvider } from "@/lib/ai-format";
import { ask, cleanMode, decide, deleteThread, policyFor, saveSettings, setFullAgent, setPolicy, setThreadProvider, getSettings } from "@/lib/assistant";
import { CATEGORIES, isCategory } from "@/lib/assistant-policy";
import { ROLES, isRole } from "@/lib/rbac";
import { audit } from "@/lib/users";

const go = (q: string): never => redirect(`/portal/assistant${q ? `?${q}` : ""}`);

export async function sendMessage(formData: FormData) {
  const user = await requireSection("assistant");
  const text = String(formData.get("text") ?? "").trim();
  const threadId = String(formData.get("threadId") ?? "") || null;
  const provider = String(formData.get("provider") ?? "");
  if (!text) go(threadId ? `t=${threadId}` : "");
  if (threadId && provider !== "") await setThreadProvider(threadId, user.id, provider === "auto" ? null : provider);
  const r = await ask(user, threadId, text, isAiProvider(provider) ? provider : null);
  revalidatePath("/portal/assistant");
  go(`t=${r.threadId}${r.error ? "&notice=ai-failed" : ""}`);
}

export async function decideAction(formData: FormData) {
  const user = await requireSection("assistant");
  const id = String(formData.get("actionId") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  const outcome = await decide(user, id, formData.get("decision") === "approve");
  await audit({ actorId: user.id, actorEmail: user.email, action: `assistant_${outcome}`, detail: id });
  go(`t=${encodeURIComponent(threadId)}&notice=${outcome}`);
}

export async function removeThread(formData: FormData) {
  const user = await requireSection("assistant");
  await deleteThread(String(formData.get("threadId") ?? ""), user.id);
  go("");
}

/** A person's own limits: only ever more careful than their role, plus full agent if their role may. */
export async function saveMyPolicy(formData: FormData) {
  const user = await requireSection("assistant");
  const { fullAgentAllowed } = await policyFor(user);
  for (const c of CATEGORIES) {
    const raw = String(formData.get(`mode_${c.id}`) ?? "");
    await setPolicy(`user:${user.id}`, c.id, raw === "role" ? null : cleanMode(raw), user.id);
  }
  await setFullAgent(user.id, fullAgentAllowed && formData.get("fullAgent") === "on");
  await audit({ actorId: user.id, actorEmail: user.email, action: "assistant_policy_self", detail: formData.get("fullAgent") === "on" ? "full agent on" : "full agent off" });
  go("view=settings&notice=saved");
}

/** The Super Admin sets what she may do for each role, her name and which AI services she uses first. */
export async function saveRolePolicy(formData: FormData) {
  const user = await requireSuperAdmin();
  const role = formData.get("role");
  if (!isRole(role)) go("view=settings&notice=invalid");
  for (const c of CATEGORIES) {
    const raw = String(formData.get(`mode_${c.id}`) ?? "");
    await setPolicy(`role:${role}`, c.id, raw === "default" ? null : cleanMode(raw), user.id);
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: "assistant_policy_role", detail: String(role) });
  go(`view=settings&role=${role}&notice=saved`);
}

export async function saveAssistantSettings(formData: FormData) {
  const user = await requireSuperAdmin();
  const current = await getSettings();
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Assistant";
  const providers = formData.getAll("providers").map(String).filter((p) => isAiProvider(p) && p !== "mock");
  const fullAgentRoles = ["super_admin", ...formData.getAll("fullAgentRoles").map(String).filter((r) => isRole(r) && ROLES.includes(r) && r !== "super_admin")];
  await saveSettings({ name, providers: providers.length ? providers : current.providers, full_agent_roles: fullAgentRoles });
  await audit({ actorId: user.id, actorEmail: user.email, action: "assistant_settings", detail: name });
  revalidatePath("/portal", "layout");
  go("view=settings&notice=saved");
}

