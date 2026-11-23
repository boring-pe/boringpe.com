import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, confidentialLine, contentSecurityPolicy, isTrainingCrawler, LIMITS, retryAfter, securityHeaders, windowStart } from "../src/lib/security-calc.ts";
import { can, ROLES } from "../src/lib/rbac.ts";

test("production pages get a strict policy: no framing, no plugins, no outside scripts, no eval", () => {
  const csp = contentSecurityPolicy(false);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.match(contentSecurityPolicy(true), /unsafe-eval/, "development keeps fast refresh");

  const names = securityHeaders().map((h) => h.key);
  for (const h of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) {
    assert.ok(names.includes(h), h);
  }
});

test("training crawlers and site copiers are refused; search engines and browsers are not", () => {
  for (const ua of ["Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", "CCBot/2.0 (https://commoncrawl.org/faq/)", "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)", "Wget/1.21.4", "Mozilla/4.5 (compatible; HTTrack 3.0x)"]) {
    assert.ok(isTrainingCrawler(ua), ua);
  }
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36", null, ""]) {
    assert.ok(!isTrainingCrawler(ua), String(ua));
  }
});

test("the client address comes from the first forwarded hop, and junk is ignored", () => {
  const h = (m: Record<string, string>) => (n: string) => m[n] ?? null;
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  assert.equal(clientIp(h({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
  assert.equal(clientIp(h({ "x-forwarded-for": "<script>" })), "unknown");
  assert.equal(clientIp(h({})), "unknown");
});

test("fixed windows and Retry-After", () => {
  const t = Date.UTC(2026, 10, 23, 10, 7, 30);
  assert.equal(windowStart(t, 15 * 60), Date.UTC(2026, 10, 23, 10, 0, 0));
  assert.equal(retryAfter(t, 15 * 60), 7 * 60 + 30);
  assert.ok(LIMITS.signInFailIp.limit > LIMITS.signInFailEmail.limit, "one address may try a few emails, one email is guarded harder");
});

test("exports carry who took them", () => {
  assert.equal(confidentialLine("a@b.test", new Date("2026-11-23T10:05:00Z")), "Confidential: exported by a@b.test on 2026-11-23 10:05 UTC. Do not share outside Boring PE.");
});

test("only the Super Admin sees the Security page", () => {
  for (const r of ROLES) assert.equal(can(r, "security"), r === "super_admin", r);
});
