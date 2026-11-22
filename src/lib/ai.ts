import { credentials, logEvent } from "./integrations";
import { getSql } from "./db";
import { testMode } from "./test-mode";
import {
  AI_PROVIDERS, fromAnthropic, fromOpenAI, toAnthropic, toOpenAI, type AiProviderId, type Msg, type Reply, type ToolDef,
} from "./ai-format";

const ENDPOINT: Record<string, string> = {
  ai_openai: "https://api.openai.com/v1/chat/completions",
  ai_gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

/** AI services that are set up, in the order the portal tries them. */
export async function readyProviders(): Promise<AiProviderId[]> {
  const sql = await getSql();
  const [settings, rows] = await Promise.all([
    sql.query<{ providers: string[] }>("select providers from assistant_settings where id"),
    sql.query<{ provider: string }>("select provider from integrations where provider like 'ai_%' and status <> 'disconnected'"),
  ]);
  const connected = new Set(rows.map((r) => r.provider));
  const order = [...(settings[0]?.providers ?? []), ...AI_PROVIDERS.map((p) => p.id)];
  const list = [...new Set(order)].filter((p): p is AiProviderId => connected.has(p));
  return testMode() ? [...list, "mock"] : list;
}

/** One call to one service. Throws on failure so the caller can try the next. */
export async function callProvider(provider: AiProviderId, system: string, messages: Msg[], tools: ToolDef[]): Promise<Reply> {
  if (provider === "mock") return mockReply(messages);
  const c = await credentials(provider);
  if (!c?.model) throw new Error("Not set up.");
  const spec = AI_PROVIDERS.find((p) => p.id === provider)!;
  const signal = AbortSignal.timeout(60_000);
  if (spec.style === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(toAnthropic(system, messages, tools, c.model)),
    });
    if (!res.ok) throw new Error(`${spec.name} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return fromAnthropic(await res.json(), c.model);
  }
  const url = provider === "ai_custom" ? `${String(c.baseUrl).replace(/\/+$/, "")}/chat/completions` : ENDPOINT[provider];
  const res = await fetch(url, {
    method: "POST", signal,
    headers: { "content-type": "application/json", ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify(toOpenAI(system, messages, tools, c.model)),
  });
  if (!res.ok) throw new Error(`${spec.name} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return fromOpenAI(await res.json(), c.model);
}

/**
 * Tries the chosen service first, then the others in order, so one service being down or out of
 * credit does not stop the assistant. Returns which one answered.
 */
export async function complete(preferred: AiProviderId | null, system: string, messages: Msg[], tools: ToolDef[]) {
  const ready = await readyProviders();
  const order = preferred && ready.includes(preferred) ? [preferred, ...ready.filter((p) => p !== preferred)] : ready;
  if (order.length === 0) throw new Error("No AI service is set up. Add one under Integrations → AI assistant.");
  const errors: string[] = [];
  for (const p of order) {
    try {
      return { provider: p, reply: await callProvider(p, system, messages, tools) };
    } catch (err) {
      const message = String((err as Error).message ?? err);
      errors.push(`${p}: ${message}`);
      await logEvent(p, "assistant", false, message, null).catch(() => {});
    }
  }
  throw new Error(`Every AI service failed. ${errors.join(" · ")}`.slice(0, 600));
}

/** A tiny check that a service answers, for the Integrations page. */
export async function pingProvider(provider: AiProviderId) {
  try {
    const r = await callProvider(provider, "Reply with the single word: ready", [{ role: "user", content: [{ type: "text", text: "Are you there?" }] }], []);
    return { ok: true, message: `Answered with ${r.model}.` };
  } catch (err) {
    return { ok: false, message: String((err as Error).message).slice(0, 300) };
  }
}

// ---- Test mode only: a predictable stand-in that uses the same tools a real model would.

function mockReply(messages: Msg[]): Reply {
  const last = messages.at(-1);
  const result = last?.content.find((b) => b.type === "tool_result");
  if (result && result.type === "tool_result") return { model: "mock", blocks: [{ type: "text", text: `Done. ${result.content}` }] };
  const text = last?.content.map((b) => (b.type === "text" ? b.text : "")).join(" ") ?? "";
  const id = `mock_${messages.length}`;
  const task = text.match(/task[:\s]+(.+)/i);
  if (task) return { model: "mock", blocks: [{ type: "text", text: "Adding that task." }, { type: "tool_use", id, name: "create_task", input: { title: task[1].trim() } }] };
  const note = text.match(/note[:\s]+(.+)/i);
  if (note) return { model: "mock", blocks: [{ type: "tool_use", id, name: "add_note", input: { title: note[1].trim(), body: "" } }] };
  const pay = text.match(/pay\s+([\d,]+)\s+for\s+(.+)/i);
  if (pay) return { model: "mock", blocks: [{ type: "tool_use", id, name: "record_money", input: { direction: "out", category: "expense", amount: pay[1], memo: pay[2].trim() } }] };
  if (/cash|runway|how are we/i.test(text)) return { model: "mock", blocks: [{ type: "tool_use", id, name: "business_snapshot", input: {} }] };
  return { model: "mock", blocks: [{ type: "text", text: `You said: ${text}` }] };
}
