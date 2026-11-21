"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import { isApiScope, providerById, WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/integration-catalog";
import {
  addWebhook, createApiKey, disconnect, logEvent, pingWebhook, removeWebhook, revokeApiKey, saveIntegration, testIntegration,
} from "@/lib/integrations";
import { oneLine } from "@/lib/ops-fields";
import { audit } from "@/lib/users";

function back(view: string, notice: string, extra = ""): never {
  redirect(`/portal/integrations?view=${view}&notice=${notice}${extra}`);
}

export async function saveService(formData: FormData) {
  const user = await requireSuperAdmin();
  const provider = String(formData.get("provider") ?? "");
  const p = providerById(provider);
  if (!p) back("services", "invalid");
  const values: Record<string, string> = {};
  for (const f of p.fields) values[f.key] = String(formData.get(f.key) ?? "");
  const missing = await saveIntegration(provider, values, user.id);
  await logEvent(provider, "saved", missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : "Settings saved", user.email);
  await audit({ actorId: user.id, actorEmail: user.email, action: "integration_saved", detail: provider });
  if (missing.length) back("services", "missing", `&p=${provider}`);
  const t = await testIntegration(provider);
  await logEvent(provider, "test", t.ok, t.message, user.email);
  back("services", t.ok ? "connected" : "test-failed", `&p=${provider}`);
}

export async function serviceAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const provider = String(formData.get("provider") ?? "");
  if (!providerById(provider)) back("services", "invalid");
  if (formData.get("what") === "disconnect") {
    await disconnect(provider, user.id);
    await logEvent(provider, "disconnected", true, "Credentials removed", user.email);
    await audit({ actorId: user.id, actorEmail: user.email, action: "integration_disconnected", detail: provider });
    back("services", "disconnected", `&p=${provider}`);
  }
  const t = await testIntegration(provider);
  await logEvent(provider, "test", t.ok, t.message, user.email);
  back("services", t.ok ? "test-ok" : "test-failed", `&p=${provider}`);
}

export type Created = { secret?: string; error?: string };

/** Returns the new key to the page once; it is stored only as a hash. */
export async function newApiKey(_prev: Created, formData: FormData): Promise<Created> {
  const user = await requireSuperAdmin();
  const name = oneLine(formData.get("name"), 80);
  const scopes = formData.getAll("scopes").filter(isApiScope);
  if (name.length < 2 || scopes.length === 0) return { error: "Give the key a name and at least one permission." };
  const secret = await createApiKey(name, scopes, user.id);
  await logEvent("api", "key_created", true, name, user.email);
  await audit({ actorId: user.id, actorEmail: user.email, action: "api_key_created", detail: name });
  return { secret };
}

export async function newWebhook(_prev: Created, formData: FormData): Promise<Created> {
  const user = await requireSuperAdmin();
  const url = String(formData.get("url") ?? "").trim();
  const events = formData.getAll("events").filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(String(e)));
  if (events.length === 0) return { error: "Choose at least one event." };
  const secret = await addWebhook(url, events, user.id);
  if (!secret) return { error: "Use a public https:// address (not localhost or a private network)." };
  await logEvent("webhooks", "endpoint_added", true, url, user.email);
  await audit({ actorId: user.id, actorEmail: user.email, action: "webhook_added", detail: url });
  return { secret };
}

export async function keyAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!(await revokeApiKey(id))) back("api", "invalid");
  await logEvent("api", "key_revoked", true, id, user.email);
  back("api", "revoked");
}

export async function webhookAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (formData.get("what") === "remove") {
    if (!(await removeWebhook(id))) back("webhooks", "invalid");
    await logEvent("webhooks", "endpoint_removed", true, id, user.email);
    back("webhooks", "removed");
  }
  const ok = await pingWebhook(id);
  await logEvent("webhooks", "ping", ok, id, user.email);
  back("webhooks", ok ? "ping-ok" : "ping-failed");
}
