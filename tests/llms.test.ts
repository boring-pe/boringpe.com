import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLlmsTxt } from "../src/lib/llms-calc.ts";
import { defaultsFor } from "../src/lib/content-fields.ts";

test("llms.txt follows the format: a title, a summary, then sections of links", () => {
  const txt = buildLlmsTxt(defaultsFor("boringpe"));
  const lines = txt.split("\n");
  assert.equal(lines[0], "# Boring PE");
  assert.match(lines[2], /^> Boring PE is a private enterprise/);
  for (const h of ["## How Boring PE works", "## For founders", "## Related", "## Optional"]) assert.ok(lines.includes(h), h);
  for (const a of ["#build", "#co-build", "#own", "#studio", "#impact-marrow"]) assert.ok(txt.includes(`https://boringpe.com/${a}`), a);
  assert.match(txt, /mailto:hello@boringpe\.com/);
  assert.doesNotMatch(txt, /\n\n\n/);
});

test("it uses the site's own wording, and stray markup cannot break it", () => {
  const c = { ...defaultsFor("boringpe"), buildBody: "We build\n\n## not a heading <script>", contactEmail: "" };
  const txt = buildLlmsTxt(c);
  assert.match(txt, /\[Build\]\(https:\/\/boringpe\.com\/#build\): We build ## not a heading script/);
  assert.doesNotMatch(txt, /mailto:/, "no contact line without an email");
});
