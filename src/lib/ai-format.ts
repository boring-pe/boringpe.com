// Pure: one message format for the assistant, converted to and from each AI service's own.

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: Block[] };
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type Reply = { blocks: Block[]; model: string };

export const AI_PROVIDERS = [
  { id: "ai_anthropic", name: "Anthropic Claude", style: "anthropic" },
  { id: "ai_openai", name: "OpenAI", style: "openai" },
  { id: "ai_gemini", name: "Google Gemini", style: "openai" },
  { id: "ai_custom", name: "Your own or another AI (OpenAI-compatible)", style: "openai" },
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"] | "mock";
export const isAiProvider = (v: unknown): v is AiProviderId => v === "mock" || AI_PROVIDERS.some((p) => p.id === v);
export const aiProviderName = (id: string) => (id === "mock" ? "Test assistant" : AI_PROVIDERS.find((p) => p.id === id)?.name ?? id);

// ---- Anthropic Messages API: the internal format is already its format.

export function toAnthropic(system: string, messages: Msg[], tools: ToolDef[], model: string) {
  return { model, max_tokens: 2048, system, messages, ...(tools.length ? { tools } : {}) };
}

export function fromAnthropic(body: { content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]; model?: string }, model: string): Reply {
  const blocks: Block[] = [];
  for (const c of body.content ?? []) {
    if (c.type === "text" && c.text) blocks.push({ type: "text", text: c.text });
    if (c.type === "tool_use" && c.id && c.name) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: (c.input ?? {}) as Record<string, unknown> });
  }
  return { blocks, model: body.model ?? model };
}

// ---- OpenAI Chat Completions (also Gemini's and most self-hosted servers' compatible endpoints).

type OaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAI(system: string, messages: Msg[], tools: ToolDef[], model: string) {
  const out: OaMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    const text = m.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
    if (m.role === "assistant") {
      const calls = m.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}),
      });
    } else {
      for (const r of m.content) if (r.type === "tool_result") out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
      if (text) out.push({ role: "user", content: text });
    }
  }
  return {
    model,
    messages: out,
    ...(tools.length ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
  };
}

export function fromOpenAI(
  body: { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]; model?: string },
  model: string,
): Reply {
  const msg = body.choices?.[0]?.message;
  const blocks: Block[] = [];
  if (msg?.content) blocks.push({ type: "text", text: msg.content });
  for (const c of msg?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(c.function.arguments || "{}");
    } catch {
      input = {};
    }
    blocks.push({ type: "tool_use", id: c.id, name: c.function.name, input });
  }
  return { blocks, model: body.model ?? model };
}

/** A short title for a conversation from its first message. */
export function titleFrom(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 57)}…` : one || "New conversation";
}
