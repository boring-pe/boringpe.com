import { getSql } from "./db";
import { complete } from "./ai";
import { isAiProvider, titleFrom, type AiProviderId, type Block, type Msg } from "./ai-format";
import { CATEGORIES, effectiveMode, isMode, mayRunFullAgent, type Category, type Mode, type Overrides } from "./assistant-policy";
import { toolByName, toolsFor, type Tool } from "./assistant-tools";
import { ROLE_META } from "./rbac";
import type { UserRow } from "./users";
import { workspaceLabel } from "./workspace-calc";
import { workspaceContext, workspaceForNew } from "./workspaces";

export type Settings = { name: string; providers: string[]; full_agent_roles: string[] };
export type ThreadRow = { id: string; title: string; provider: string | null; workspace: string; updated_at: string };
export type MessageRow = { id: string; role: "user" | "assistant"; content: Block[]; provider: string | null; model: string | null; created_at: string };
export type ActionRow = {
  id: string; thread_id: string; tool: string; category: string; input: Record<string, unknown>; status: "proposed" | "done" | "failed" | "rejected";
  result: string | null; auto: boolean; created_at: string; tool_use_id: string;
};

/** Steps she may take in one turn before handing back, so a confused model cannot loop forever. */
const MAX_STEPS = 6;

export async function getSettings(): Promise<Settings> {
  const sql = await getSql();
  return (await sql.query<Settings>("select name, providers, full_agent_roles from assistant_settings where id"))[0] ?? { name: "Assistant", providers: [], full_agent_roles: ["super_admin"] };
}

export async function saveSettings(s: Settings) {
  const sql = await getSql();
  await sql.query("update assistant_settings set name = $1, providers = $2::text[], full_agent_roles = $3::text[], updated_at = now() where id", [
    s.name, s.providers, s.full_agent_roles,
  ]);
}

async function policyRows(scope: string): Promise<Overrides> {
  const sql = await getSql();
  const rows = await sql.query<{ category: Category; mode: Mode }>("select category, mode from assistant_policies where scope = $1", [scope]);
  return Object.fromEntries(rows.map((r) => [r.category, r.mode]));
}

export async function setPolicy(scope: string, category: Category, mode: Mode | null, by: string) {
  const sql = await getSql();
  if (mode === null) await sql.query("delete from assistant_policies where scope = $1 and category = $2", [scope, category]);
  else {
    await sql.query(
      `insert into assistant_policies (scope, category, mode, updated_by) values ($1, $2, $3, $4)
       on conflict (scope, category) do update set mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now()`,
      [scope, category, mode, by],
    );
  }
}

export async function fullAgentOn(userId: string) {
  const sql = await getSql();
  return (await sql.query<{ on: boolean }>("select assistant_full_agent as on from users where id = $1", [userId]))[0]?.on ?? false;
}

export async function setFullAgent(userId: string, on: boolean) {
  const sql = await getSql();
  await sql.query("update users set assistant_full_agent = $2 where id = $1", [userId, on]);
}

/** What she may do for this person in each category, with the parts that decided it. */
export async function policyFor(user: UserRow) {
  const [settings, roleSet, userSet, full] = await Promise.all([
    getSettings(), policyRows(`role:${user.role}`), policyRows(`user:${user.id}`), fullAgentOn(user.id),
  ]);
  const fullAgent = full && mayRunFullAgent(user.role, settings.full_agent_roles);
  const modes = Object.fromEntries(CATEGORIES.map((c) => [c.id, effectiveMode(user.role, c.id, roleSet, userSet, fullAgent)])) as Record<Category, Mode>;
  return { settings, roleSet, userSet, fullAgent, fullAgentAllowed: mayRunFullAgent(user.role, settings.full_agent_roles), modes };
}

export async function rolePolicy(role: string) {
  return policyRows(`role:${role}`);
}

// ---- conversations

export async function listThreads(userId: string) {
  const sql = await getSql();
  return sql.query<ThreadRow>(
    "select id, title, provider, workspace, updated_at::text from assistant_threads where user_id = $1 order by updated_at desc limit 50",
    [userId],
  );
}

export async function getThread(id: string, userId: string) {
  const sql = await getSql();
  return (await sql.query<ThreadRow>("select id, title, provider, workspace, updated_at::text from assistant_threads where id = $1 and user_id = $2", [id, userId]))[0] ?? null;
}

export async function threadMessages(threadId: string) {
  const sql = await getSql();
  return sql.query<MessageRow>("select id::text, role, content, provider, model, created_at::text from assistant_messages where thread_id = $1 order by id", [threadId]);
}

export async function threadActions(threadId: string) {
  const sql = await getSql();
  return sql.query<ActionRow>(
    "select id, thread_id, tool, category, input, status, result, auto, created_at::text, tool_use_id from assistant_actions where thread_id = $1 order by created_at",
    [threadId],
  );
}

export async function recentActions(userId: string, limit = 50) {
  const sql = await getSql();
  return sql.query<ActionRow>(
    "select id, thread_id, tool, category, input, status, result, auto, created_at::text, tool_use_id from assistant_actions where user_id = $1 order by created_at desc limit $2",
    [userId, limit],
  );
}

export async function setThreadProvider(id: string, userId: string, provider: string | null) {
  const sql = await getSql();
  await sql.query("update assistant_threads set provider = $3 where id = $1 and user_id = $2", [id, userId, provider && isAiProvider(provider) ? provider : null]);
}

export async function deleteThread(id: string, userId: string) {
  const sql = await getSql();
  await sql.query("delete from assistant_threads where id = $1 and user_id = $2", [id, userId]);
}

async function addMessage(threadId: string, role: "user" | "assistant", content: Block[], provider: string | null = null, model: string | null = null) {
  const sql = await getSql();
  await sql.query("insert into assistant_messages (thread_id, role, content, provider, model) values ($1, $2, $3::jsonb, $4, $5)", [
    threadId, role, JSON.stringify(content), provider, model,
  ]);
  await sql.query("update assistant_threads set updated_at = now() where id = $1", [threadId]);
}

function systemPrompt(user: UserRow, name: string, view: string, modes: Record<Category, Mode>, tools: Tool[]) {
  const now = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  const iso = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16).replace(" ", "T");
  return [
    `You are ${name}, a personal and work assistant inside the Boring PE portal. You are a woman; refer to yourself as she/her if it comes up.`,
    `You are helping ${user.name ?? user.email} (${ROLE_META[user.role].label}). They are looking at the ${workspaceLabel(view)} workspace; your tools only see that.`,
    "Boring PE builds, co-builds, owns and enables businesses; Impact Marrow is its social and economic initiative with its own fund; the Personal workspace is Rahul Mane's own.",
    `It is ${now} India time (${iso}). Money is in Indian rupees; write amounts like ₹1,25,000.`,
    "Be warm, brief and practical. Use the tools to look things up rather than guessing; never invent figures, names or records.",
    "If a tool answers that it is waiting for approval, tell them a card is waiting for their yes in this conversation. If a tool is not allowed, say so plainly and suggest what they can do themselves.",
    "For anything you cannot do with a tool, help directly: drafting, summarising, planning, thinking things through.",
    `What you may do for them: ${CATEGORIES.map((c) => `${c.label}: ${modes[c.id]}`).join("; ")}.`,
    tools.length ? "" : "You have no tools for this person; answer from the conversation alone.",
  ].filter(Boolean).join("\n");
}

/** Keeps the last stretch of the conversation, starting at one of their own messages so tool calls stay paired. */
function trim(rows: MessageRow[], keep = 40): Msg[] {
  let start = Math.max(0, rows.length - keep);
  while (start > 0 && !(rows[start].role === "user" && rows[start].content.some((b) => b.type === "text"))) start--;
  return rows.slice(start).map((r) => ({ role: r.role, content: r.content }));
}

async function runTool(user: UserRow, threadId: string, call: Extract<Block, { type: "tool_use" }>, tools: Tool[], modes: Record<Category, Mode>): Promise<Block> {
  const sql = await getSql();
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) return { type: "tool_result", tool_use_id: call.id, content: "That tool is not available to this person.", is_error: true };
  const mode = modes[tool.category];
  if (mode === "off") return { type: "tool_result", tool_use_id: call.id, content: `${tool.describe(call.input)}: not allowed for this person.`, is_error: true };
  if (mode === "ask") {
    await sql.query(
      "insert into assistant_actions (thread_id, user_id, tool_use_id, tool, category, input, status) values ($1, $2, $3, $4, $5, $6::jsonb, 'proposed')",
      [threadId, user.id, call.id, tool.name, tool.category, JSON.stringify(call.input)],
    );
    return { type: "tool_result", tool_use_id: call.id, content: `Waiting for approval: ${tool.describe(call.input)}.` };
  }
  let result: string;
  let ok = true;
  try {
    result = await tool.run(user, call.input);
  } catch (err) {
    ok = false;
    result = `Failed: ${String((err as Error).message).slice(0, 300)}`;
  }
  if (tool.category !== "read") {
    await sql.query(
      "insert into assistant_actions (thread_id, user_id, tool_use_id, tool, category, input, status, result, auto, decided_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, true, now())",
      [threadId, user.id, call.id, tool.name, tool.category, JSON.stringify(call.input), ok ? "done" : "failed", result],
    );
  }
  return { type: "tool_result", tool_use_id: call.id, content: result.slice(0, 8000), is_error: !ok };
}

/**
 * One turn: their message, then her replies and tool use until she has answered. Returns the
 * conversation id (new when none was given).
 */
export async function ask(user: UserRow, threadId: string | null, text: string, provider: string | null = null): Promise<{ threadId: string; error?: string }> {
  const sql = await getSql();
  let thread = threadId ? await getThread(threadId, user.id) : null;
  if (!thread) {
    const id = (await sql.query<{ id: string }>(
      "insert into assistant_threads (user_id, workspace, title, provider) values ($1, $2, $3, $4) returning id",
      [user.id, await workspaceForNew(), titleFrom(text), provider && isAiProvider(provider) ? provider : null],
    ))[0].id;
    thread = (await getThread(id, user.id))!;
  }
  await addMessage(thread.id, "user", [{ type: "text", text: text.slice(0, 20000) }]);

  const [{ settings, modes }, { view }] = await Promise.all([policyFor(user), workspaceContext()]);
  const tools = toolsFor(user).filter((t) => modes[t.category] !== "off");
  const system = systemPrompt(user, settings.name, view, modes, tools);
  const defs = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const history = trim(await threadMessages(thread.id));
    let answer;
    try {
      answer = await complete((thread.provider as AiProviderId | null) ?? null, system, history, defs);
    } catch (err) {
      const message = String((err as Error).message);
      await addMessage(thread.id, "assistant", [{ type: "text", text: `I could not reach an AI service just now. ${message}` }]);
      return { threadId: thread.id, error: message };
    }
    const blocks = answer.reply.blocks.length ? answer.reply.blocks : [{ type: "text" as const, text: "…" }];
    await addMessage(thread.id, "assistant", blocks, answer.provider, answer.reply.model);
    const calls = blocks.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (!calls.length) break;
    const results: Block[] = [];
    for (const c of calls) results.push(await runTool(user, thread.id, c, tools, modes));
    await addMessage(thread.id, "user", results);
  }
  return { threadId: thread.id };
}

/** Their yes or no to an action she asked about. A yes runs it now, as them, with today's permissions. */
export async function decide(user: UserRow, actionId: string, approve: boolean): Promise<string> {
  const sql = await getSql();
  const a = (await sql.query<ActionRow>(
    "select id, thread_id, tool, category, input, status, result, auto, created_at::text, tool_use_id from assistant_actions where id = $1 and user_id = $2",
    [actionId, user.id],
  ))[0];
  if (!a || a.status !== "proposed") return "gone";
  const tool = toolByName(a.tool);
  const { modes } = await policyFor(user);
  if (!approve || !tool) {
    await sql.query("update assistant_actions set status = 'rejected', decided_at = now() where id = $1", [a.id]);
    await addMessage(a.thread_id, "assistant", [{ type: "text", text: `All right, I won't: ${tool?.describe(a.input) ?? a.tool}.` }]);
    return "rejected";
  }
  // Permissions may have changed since she asked.
  if (!toolsFor(user).includes(tool) || modes[tool.category] === "off") {
    await sql.query("update assistant_actions set status = 'failed', result = $2, decided_at = now() where id = $1", [a.id, "No longer allowed."]);
    return "not-allowed";
  }
  let result: string;
  let ok = true;
  try {
    result = await tool.run(user, a.input);
  } catch (err) {
    ok = false;
    result = `Failed: ${String((err as Error).message).slice(0, 300)}`;
  }
  await sql.query("update assistant_actions set status = $2, result = $3, decided_at = now() where id = $1", [a.id, ok ? "done" : "failed", result]);
  await addMessage(a.thread_id, "assistant", [{ type: "text", text: ok ? `Done: ${result}` : result }]);
  return ok ? "done" : "failed";
}

export const cleanMode = (v: unknown): Mode | null => (isMode(v) ? v : null);
