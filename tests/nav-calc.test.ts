import { test } from "node:test";
import assert from "node:assert/strict";
import { activeHref, parseFolds, rowMatches } from "../src/lib/nav-calc.ts";

test("the lit menu item is the longest link above the page", () => {
  const hrefs = ["/portal/dashboard", "/portal/verticals", "/portal/verticals/build", "/portal/books"];
  assert.equal(activeHref("/portal/verticals/build", hrefs), "/portal/verticals/build");
  assert.equal(activeHref("/portal/verticals/build/alpha", hrefs), "/portal/verticals/build");
  assert.equal(activeHref("/portal/verticals", hrefs), "/portal/verticals");
  assert.equal(activeHref("/portal/booksy", hrefs), null, "a name that only starts the same is not a match");
  assert.equal(activeHref("/portal/account", hrefs), null);
});

test("a row matches every word typed, in any order and case, and the chosen tag", () => {
  assert.ok(rowMatches("Send term sheet Alpha manager@example.test", ["open"], "alpha SHEET", null));
  assert.ok(!rowMatches("Send term sheet", ["open"], "sheet beta", null));
  assert.ok(rowMatches("Send term sheet", ["open", "overdue"], "", "overdue"));
  assert.ok(!rowMatches("Send term sheet", ["done"], "", "overdue"));
  assert.ok(rowMatches("anything", [], "   ", null), "spaces alone filter nothing");
});

test("folded groups come back only as known ids", () => {
  assert.deepEqual(parseFolds("super%2Cventures%2Cnope", ["super", "ventures"]), ["super", "ventures"]);
  assert.deepEqual(parseFolds(undefined, ["super"]), []);
  assert.deepEqual(parseFolds("<script>", ["super"]), []);
  assert.deepEqual(parseFolds("%E0%A4%A", ["super"]), [], "a broken cookie folds nothing");
});
