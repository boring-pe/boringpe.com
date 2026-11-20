// End-to-end check against a running server: BASE_URL=http://127.0.0.1:3100 node tests/e2e.mjs
// Needs ADMIN_EMAILS / ADMIN_BOOTSTRAP_PASSWORD matching the server's environment.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "admin@example.test";
const BOOT = process.env.E2E_ADMIN_PASSWORD ?? "bootstrap passphrase 123";
const ADMIN_NEW = "a brand new admin passphrase 9";
const LP = "lp@example.test";
const LP_NEW = "lp chosen passphrase 77!";
const PARTNER = "partner@example.test";

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("PASS", name);
  } catch (error) {
    results.push(["FAIL", name]);
    console.log("FAIL", name, "\n  ", String(error.message).split("\n")[0]);
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = async () => {
  const context = await browser.newContext({ baseURL: BASE });
  return { context, page: await context.newPage() };
};

async function login(page, email, password) {
  await page.goto("/portal/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Sign in")');
}

const A = await ctx();

await step("unauthenticated portal pages redirect to login", async () => {
  for (const path of ["/portal", "/portal/dashboard", "/portal/access", "/portal/account"]) {
    await A.page.goto(path);
    assert.match(A.page.url(), /\/portal\/login$/, path);
  }
});

await step("the old bp_role=admin cookie no longer opens anything", async () => {
  await A.context.addCookies([{ name: "bp_role", value: "admin", url: BASE }]);
  await A.page.goto("/portal/access");
  assert.match(A.page.url(), /\/portal\/login$/);
});

await step("login page: no social buttons without keys, security headers set", async () => {
  const response = await A.page.goto("/portal/login");
  assert.equal(await A.page.locator('button:has-text("Google")').count(), 0);
  assert.equal(await A.page.locator('button:has-text("LinkedIn")').count(), 0);
  assert.match(response.headers()["x-robots-tag"] ?? "", /noindex/);
  assert.equal(response.headers()["x-frame-options"], "DENY");
  const robots = await A.page.request.get("/robots.txt");
  assert.match(await robots.text(), /Disallow: \/portal/);
});

await step("wrong password and unknown email give the same message", async () => {
  await login(A.page, ADMIN, "definitely wrong password");
  await A.page.waitForSelector('[role="alert"]');
  const one = await A.page.locator('[role="alert"]').innerText();
  await login(A.page, "nobody@example.test", "definitely wrong password");
  await A.page.waitForSelector('[role="alert"]');
  const two = await A.page.locator('[role="alert"]').innerText();
  assert.equal(one, two);
  assert.match(A.page.url(), /\/portal\/login/);
});

await step("bootstrap admin is forced to choose a new password before anything else", async () => {
  await login(A.page, ADMIN, BOOT);
  await A.page.waitForURL(/\/portal\/account/);
  await A.page.goto("/portal/access");
  assert.match(A.page.url(), /\/portal\/account$/);
  await A.page.goto("/portal/dashboard");
  assert.match(A.page.url(), /\/portal\/account$/);
});

await step("changing the password ends the session; old password fails, new one works", async () => {
  await A.page.fill('input[name="current"]', BOOT);
  await A.page.fill('input[name="next"]', ADMIN_NEW);
  await A.page.fill('input[name="confirm"]', ADMIN_NEW);
  await A.page.click('button:has-text("Save password")');
  await A.page.waitForURL(/\/portal\/login\?changed=1/);
  await login(A.page, ADMIN, BOOT);
  await A.page.waitForSelector('[role="alert"]');
  await login(A.page, ADMIN, ADMIN_NEW);
  await A.page.waitForURL(/\/portal\/dashboard/);
});

let lpTemp = "";
await step("admin invites an LP with a temporary password and a partner without one", async () => {
  await A.page.goto("/portal/access");
  await A.page.fill('input[name="email"]', LP);
  await A.page.selectOption('select[name="role"]', "lp");
  await A.page.selectOption('select[name="passwordMode"]', "generate");
  await A.page.click('button:has-text("Invite")');
  await A.page.waitForSelector("code");
  lpTemp = (await A.page.locator("code").first().innerText()).trim();
  assert.equal(lpTemp.length, 16);
  await A.page.fill('input[name="email"]', PARTNER);
  await A.page.selectOption('select[name="role"]', "partner");
  await A.page.selectOption('select[name="passwordMode"]', "none");
  await A.page.click('button:has-text("Invite")');
  await A.page.waitForSelector(`text=${PARTNER} can now sign in`);
  await A.page.reload();
  await A.page.waitForSelector(`text=${LP}`);
  await A.page.waitForSelector(`text=${PARTNER}`);
  assert.ok(await A.page.locator("text=invited").count());
});

const B = await ctx();
await step("LP signs in with the temporary password and must replace it", async () => {
  await login(B.page, LP, lpTemp);
  await B.page.waitForURL(/\/portal\/account/);
  await B.page.fill('input[name="current"]', lpTemp);
  await B.page.fill('input[name="next"]', LP_NEW);
  await B.page.fill('input[name="confirm"]', LP_NEW);
  await B.page.click('button:has-text("Save password")');
  await B.page.waitForURL(/changed=1/);
  await login(B.page, LP, LP_NEW);
  await B.page.waitForURL(/\/portal\/dashboard/);
});

await step("LP is held to its role: portfolio yes, deals / vault / access no", async () => {
  await B.page.goto("/portal/portfolio");
  assert.match(B.page.url(), /\/portal\/portfolio$/);
  for (const path of ["/portal/deals", "/portal/vault", "/portal/marrow", "/portal/access"]) {
    await B.page.goto(path);
    assert.match(B.page.url(), /\/portal\/dashboard$/, path);
  }
  assert.equal(await B.page.locator('a[href="/portal/access"]').count(), 0);
  assert.equal(await B.page.locator('a[href="/portal/deals"]').count(), 0);
});

await step("an LP (and an anonymous caller) cannot replay admin server actions", async () => {
  // Take the real, signed form fields of the admin's own role form for the partner, then replay them
  // from the LP session and from a session-less client, asking for admin.
  await A.page.goto("/portal/access");
  const row = A.page.locator("tr", { hasText: PARTNER });
  const form = row.locator("form").first();
  const actionField = await form.locator('input[name^="$ACTION_ID_"]').first().getAttribute("name");
  const userId = await form.locator('input[name="userId"]').getAttribute("value");
  assert.ok(actionField && userId, "found the action id and the target user id");

  const attempt = (request) =>
    request.post("/portal/access", {
      multipart: { [actionField]: "", userId, role: "admin" },
      maxRedirects: 0,
    });
  await attempt(B.page.request);
  const anonymous = await browser.newContext({ baseURL: BASE });
  await attempt(anonymous.request);
  await anonymous.close();

  await A.page.goto("/portal/access");
  const select = A.page.locator("tr", { hasText: PARTNER }).locator("select").first();
  assert.equal(await select.inputValue(), "partner", "partner was not promoted");
  const log = await A.page.locator("section", { hasText: "Recent changes" }).innerText();
  assert.ok(!/role changed/.test(log), "no role change was recorded");
});

await step("switching a seat off ends that person's live session at once", async () => {
  await A.page.goto("/portal/access");
  const row = A.page.locator("tr", { hasText: LP });
  await row.locator('button:has-text("Switch off")').click();
  await A.page.waitForSelector("text=Seat switched off");
  await B.page.goto("/portal/dashboard");
  assert.match(B.page.url(), /\/portal\/login/);
  await login(B.page, LP, LP_NEW);
  await B.page.waitForSelector('[role="alert"]');
  assert.match(B.page.url(), /\/portal\/login/);
});

await step("switching back on lets them sign in again", async () => {
  const row = A.page.locator("tr", { hasText: LP });
  await row.locator('button:has-text("Switch on")').click();
  await A.page.waitForSelector("text=Seat switched back on");
  await login(B.page, LP, LP_NEW);
  await B.page.waitForURL(/\/portal\/dashboard/);
});

await step("five wrong passwords lock the seat, even for the right password", async () => {
  const C = await ctx();
  for (let i = 0; i < 5; i += 1) {
    await login(C.page, LP, `wrong password attempt ${i}`);
    await C.page.waitForSelector('[role="alert"]');
  }
  await login(C.page, LP, LP_NEW);
  await C.page.waitForSelector('[role="alert"]');
  assert.match(C.page.url(), /\/portal\/login/);
  await C.context.close();
});

await step("an invited partner with no password cannot be signed in by guessing", async () => {
  const D = await ctx();
  await login(D.page, PARTNER, "any password at all 123");
  await D.page.waitForSelector('[role="alert"]');
  await D.context.close();
});

await step("admin can reset a password and the new temporary one is shown once", async () => {
  await A.page.goto("/portal/access");
  const row = A.page.locator("tr", { hasText: PARTNER });
  await row.locator('button:has-text("Reset password")').click();
  await A.page.waitForSelector("tr:has-text('partner@example.test') code");
  const pw = (await row.locator("code").innerText()).trim();
  assert.equal(pw.length, 16);
  await A.page.reload();
  assert.equal(await A.page.locator("code").count(), 0);
});

await step("an admin cannot demote or switch off their own seat", async () => {
  await A.page.goto("/portal/access");
  const me = A.page.locator("tr", { hasText: ADMIN });
  assert.equal(await me.locator('button:has-text("Switch off")').count(), 0);
  assert.equal(await me.locator("select").count(), 0);
});

await step("sign out clears the session", async () => {
  await A.page.click('button:has-text("Sign out")');
  await A.page.waitForURL(/\/portal\/login/);
  await A.page.goto("/portal/dashboard");
  assert.match(A.page.url(), /\/portal\/login$/);
});

await browser.close();
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
