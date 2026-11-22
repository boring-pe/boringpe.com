import assert from "node:assert/strict";
import { test } from "node:test";
import { fromAnthropic, fromOpenAI, titleFrom, toOpenAI, type Msg } from "../src/lib/ai-format.ts";

const convo: Msg[] = [
  { role: "user", content: [{ type: "text", text: "Add a task to call Acme" }] },
  { role: "assistant", content: [{ type: "text", text: "On it." }, { type: "tool_use", id: "t1", name: "create_task", input: { title: "Call Acme" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Task added." }] },
];

test("a conversation with tool calls converts to the OpenAI shape", () => {
  const body = toOpenAI("Be brief.", convo, [{ name: "create_task", description: "d", input_schema: { type: "object" } }], "m");
  assert.deepEqual(body.messages[0], { role: "system", content: "Be brief." });
  assert.deepEqual(body.messages[2], {
    role: "assistant", content: "On it.",
    tool_calls: [{ id: "t1", type: "function", function: { name: "create_task", arguments: '{"title":"Call Acme"}' } }],
  });
  assert.deepEqual(body.messages[3], { role: "tool", tool_call_id: "t1", content: "Task added." });
  assert.equal(body.tools?.[0].function.name, "create_task");
});

test("replies from either service come back as the same blocks", () => {
  const a = fromAnthropic({ content: [{ type: "text", text: "Hi" }, { type: "tool_use", id: "x", name: "n", input: { a: 1 } }] }, "m");
  const o = fromOpenAI({ choices: [{ message: { content: "Hi", tool_calls: [{ id: "x", function: { name: "n", arguments: '{"a":1}' } }] } }] }, "m");
  assert.deepEqual(a.blocks, o.blocks);
  assert.deepEqual(fromOpenAI({ choices: [{ message: { content: null, tool_calls: [{ id: "y", function: { name: "n", arguments: "not json" } }] } }] }, "m").blocks,
    [{ type: "tool_use", id: "y", name: "n", input: {} }], "bad arguments never crash");
});

test("conversation titles are short", () => {
  assert.equal(titleFrom("  What is   our runway? "), "What is our runway?");
  assert.equal(titleFrom("x".repeat(80)).length, 58);
});
