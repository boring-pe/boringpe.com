// End-to-end check against a running server: BASE_URL=http://127.0.0.1:3100 node tests/e2e.mjs
// Needs SUPER_ADMIN_EMAILS / ADMIN_BOOTSTRAP_PASSWORD matching the server's environment.
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "admin@example.test"; // the Super Admin
const BOOT = process.env.E2E_ADMIN_PASSWORD ?? "bootstrap passphrase 123";
const ADMIN_NEW = "a brand new admin passphrase 9";
const LP = "lp@example.test";
const LP_NEW = "lp chosen passphrase 77!";
const PARTNER = "partner@example.test";
const MANAGER = "manager@example.test";
const MANAGER_NEW = "manager chosen passphrase 55!";

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
  await A.page.waitForURL(/\/portal\/console/);
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

// ---------------------------------------------------------------- Super Admin layer

// The real, signed form fields of an existing form, to replay from another session.
async function formFields(form) {
  const actionField = await form.locator('input[name^="$ACTION_ID_"]').first().getAttribute("name");
  const hidden = {};
  for (const input of await form.locator('input[type="hidden"]:not([name^="$ACTION_"])').all()) {
    hidden[await input.getAttribute("name")] = (await input.getAttribute("value")) ?? "";
  }
  assert.ok(actionField, "found a server action id");
  return { actionField, hidden };
}

await step("Super Admin lands on the console and sees all three workspaces; dashboard shows no invented figures", async () => {
  await A.page.goto("/portal");
  assert.match(A.page.url(), /\/portal\/console$/);
  // Group headings are rendered uppercase, so compare without case.
  const nav = (await A.page.locator("nav").innerText()).toLowerCase();
  for (const label of ["Super Admin", "Boring PE", "Rahul Mane · private", "Console", "Site content", "Approvals", "Personal desk"]) {
    assert.ok(nav.includes(label.toLowerCase()), label);
  }
  await A.page.goto("/portal/dashboard");
  const text = await A.page.locator("main").innerText();
  assert.ok(!/\$142,500|Patient Zero|outperforming/.test(text), "no invented figures");
  assert.ok(/Nothing to report yet/.test(text));
});

const E = await ctx();
await step("Super Admin invites an Admin; the Admin signs in and replaces the temporary password", async () => {
  await A.page.goto("/portal/access");
  await A.page.fill('input[name="email"]', MANAGER);
  await A.page.selectOption('select[name="role"]', "admin");
  await A.page.selectOption('select[name="passwordMode"]', "generate");
  await A.page.click('button:has-text("Invite")');
  await A.page.waitForSelector("code");
  const temp = (await A.page.locator("code").first().innerText()).trim();
  await login(E.page, MANAGER, temp);
  await E.page.waitForURL(/\/portal\/account/);
  await E.page.fill('input[name="current"]', temp);
  await E.page.fill('input[name="next"]', MANAGER_NEW);
  await E.page.fill('input[name="confirm"]', MANAGER_NEW);
  await E.page.click('button:has-text("Save password")');
  await E.page.waitForURL(/changed=1/);
  await login(E.page, MANAGER, MANAGER_NEW);
  await E.page.waitForURL(/\/portal\/dashboard/);
});

await step("an Admin cannot open the console, site content or the personal desk", async () => {
  for (const path of ["/portal/console", "/portal/content", "/portal/personal"]) {
    await E.page.goto(path);
    assert.match(E.page.url(), /\/portal\/dashboard$/, path);
  }
  const nav = (await E.page.locator("nav").innerText()).toLowerCase();
  assert.ok(nav.includes("boring pe"), "the Boring PE group is there");
  for (const label of ["super admin", "personal desk", "site content", "console", "rahul mane"]) {
    assert.ok(!nav.includes(label), `Admin must not see ${label}`);
  }
});

await step("an Admin can only offer the lower roles and cannot manage the Super Admin", async () => {
  await E.page.goto("/portal/access");
  const options = await E.page.locator('form select[name="role"]').first().locator("option").allInnerTexts();
  assert.deepEqual(options.map((o) => o.trim()), ["Partner", "Operator", "Founder", "Limited Partner"]);
  const superRow = E.page.locator("tr", { hasText: ADMIN });
  assert.equal(await superRow.locator("button").count(), 0);
  assert.ok(await superRow.locator("text=Super Admin only").count());
  const otherAdmin = E.page.locator("tr", { hasText: MANAGER });
  assert.equal(await otherAdmin.locator("select").count(), 0);
});

await step("an Admin cannot replay a role form to make someone Super Admin", async () => {
  const row = E.page.locator("tr", { hasText: LP });
  const { actionField, hidden } = await formFields(row.locator("form").first());
  const response = await E.page.request.post("/portal/access", {
    multipart: { [actionField]: "", ...hidden, role: "super_admin" },
    maxRedirects: 0,
  });
  assert.ok(response.status() < 500);
  await A.page.goto("/portal/access");
  const select = A.page.locator("tr", { hasText: LP }).locator("select").first();
  assert.equal(await select.inputValue(), "lp", "LP was not promoted");
  assert.ok(!/super_admin/.test(await A.page.locator("section", { hasText: "Recent changes" }).innerText()));
});

await step("approvals: an Admin asks, the Super Admin approves with a note, the Admin sees it", async () => {
  await E.page.goto("/portal/approvals");
  await E.page.selectOption('select[name="kind"]', "deal");
  await E.page.fill('input[name="title"]', "Approve first SPV");
  await E.page.fill('textarea[name="detail"]', "Terms are in the vault.");
  await E.page.click('button:has-text("Send request")');
  await E.page.waitForSelector("text=Request sent to the Super Admin.");
  await E.page.waitForSelector('li[data-approval="Approve first SPV"]');

  await A.page.goto("/portal/approvals");
  const item = A.page.locator('li[data-approval="Approve first SPV"]');
  await item.locator('input[name="note"]').fill("Go ahead");
  await item.locator('button:has-text("Approve")').click();
  await A.page.waitForSelector("text=Approved.");

  await E.page.goto("/portal/approvals");
  const done = E.page.locator('li[data-approval="Approve first SPV"]');
  assert.ok(/approved/.test(await done.innerText()));
  assert.ok(/Go ahead/.test(await done.innerText()));
  assert.equal(await done.locator("button").count(), 0, "a decided request has no controls");
});

await step("approvals: rejecting and withdrawing both work", async () => {
  for (const title of ["Pay supplier", "Draft memo"]) {
    await E.page.goto("/portal/approvals");
    await E.page.selectOption('select[name="kind"]', "payment");
    await E.page.fill('input[name="title"]', title);
    await E.page.click('button:has-text("Send request")');
    await E.page.waitForSelector(`li[data-approval="${title}"]`);
  }
  await A.page.goto("/portal/approvals");
  await A.page.locator('li[data-approval="Pay supplier"] button:has-text("Reject")').click();
  await A.page.waitForSelector("text=Rejected.");
  await E.page.goto("/portal/approvals");
  assert.ok(/rejected/.test(await E.page.locator('li[data-approval="Pay supplier"]').innerText()));
  await E.page.locator('li[data-approval="Draft memo"] button:has-text("Withdraw")').click();
  await E.page.waitForSelector("text=Request withdrawn.");
  assert.ok(/withdrawn/.test(await E.page.locator('li[data-approval="Draft memo"]').innerText()));
});

await step("an Admin cannot replay the decision form to approve their own request", async () => {
  await E.page.goto("/portal/approvals");
  await E.page.selectOption('select[name="kind"]', "other");
  await E.page.fill('input[name="title"]', "Replay target");
  await E.page.click('button:has-text("Send request")');
  await E.page.waitForSelector('li[data-approval="Replay target"]');

  await A.page.goto("/portal/approvals");
  const { actionField, hidden } = await formFields(A.page.locator('li[data-approval="Replay target"] form'));
  await E.page.request.post("/portal/approvals", {
    multipart: { [actionField]: "", ...hidden, status: "approved", note: "self" },
    maxRedirects: 0,
  });
  await A.page.goto("/portal/approvals");
  const text = await A.page.locator('li[data-approval="Replay target"]').innerText();
  assert.ok(/pending/.test(text) && !/self/.test(text), "still pending");
});

await step("site content: the Super Admin edits Boring PE and the public page follows; markup stays text", async () => {
  await A.page.goto("/portal/content?site=boringpe");
  await A.page.fill('input[name="headlineAccent"]', "Business Stack, Edited.");
  await A.page.fill('textarea[name="intro"]', "Plain words <script>alert(1)</script> here.");
  await A.page.click('button:has-text("Save and publish")');
  await A.page.waitForSelector("text=Saved.");
  let html = "";
  for (let i = 0; i < 10; i += 1) {
    html = await (await A.page.request.get("/")).text();
    if (html.includes("Business Stack, Edited.")) break;
    await A.page.waitForTimeout(500);
  }
  assert.ok(html.includes("Business Stack, Edited."), "headline updated");
  assert.ok(!html.includes("<script>alert(1)</script>"), "no raw script");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "escaped as text");
});

await step("site content: rahulmane.com shows the personal site, with an edited About", async () => {
  await A.page.goto("/portal/content?site=rahulmane");
  await A.page.fill('textarea[name="bio"]', "First paragraph.\n\nSecond paragraph.");
  await A.page.fill('input[name="contactEmail"]', "rahul@example.test");
  await A.page.click('button:has-text("Save and publish")');
  await A.page.waitForSelector("text=Saved.");
  let html = "";
  for (let i = 0; i < 10; i += 1) {
    html = await (await A.page.request.get("/", { headers: { host: "rahulmane.com" } })).text();
    if (html.includes("Second paragraph.")) break;
    await A.page.waitForTimeout(500);
  }
  assert.ok(html.includes("Rahul Mane") && html.includes("Owner, Boring PE"));
  assert.ok(html.includes("First paragraph.") && html.includes("Second paragraph."));
  assert.ok(html.includes("mailto:rahul@example.test"));
  assert.ok(html.includes("carried out through Boring PE"));
  const home = await (await A.page.request.get("/", { headers: { host: "boringpe.com" } })).text();
  assert.ok(!home.includes("First paragraph."), "boringpe.com is unaffected");
});

await step("site content: bad input is refused and an Admin cannot replay the save form", async () => {
  await A.page.goto("/portal/content?site=rahulmane");
  await A.page.fill('input[name="contactEmail"]', "not-an-email");
  await A.page.click('button:has-text("Save and publish")');
  await A.page.waitForSelector('[role="alert"]');

  await A.page.goto("/portal/content?site=boringpe");
  const form = A.page.locator("form", { has: A.page.locator('button:has-text("Save and publish")') });
  const { actionField, hidden } = await formFields(form);
  await E.page.request.post("/portal/content", {
    multipart: { [actionField]: "", ...hidden, headlineLead: "HACKED", headlineAccent: "HACKED" },
    maxRedirects: 0,
  });
  const html = await (await A.page.request.get("/")).text();
  assert.ok(!html.includes("HACKED"), "public page untouched");
});

await step("site content: restoring brings back the original wording", async () => {
  await A.page.goto("/portal/content?site=boringpe");
  await A.page.click('button:has-text("Restore the original wording")');
  await A.page.waitForSelector("text=Back to the original wording.");
  let html = "";
  for (let i = 0; i < 10; i += 1) {
    html = await (await A.page.request.get("/")).text();
    if (!html.includes("Business Stack, Edited.")) break;
    await A.page.waitForTimeout(500);
  }
  assert.ok(!html.includes("Business Stack, Edited."));
  assert.ok(html.includes("Powering the"));
});

await step("personal desk: notes are private to the Super Admin", async () => {
  await A.page.goto("/portal/personal");
  await A.page.fill('input[name="title"]', "Private plan");
  await A.page.fill('textarea[name="body"]', "For my eyes only.");
  await A.page.click('button:has-text("Save note")');
  await A.page.waitForSelector("text=Private plan");
  await A.page.locator("li", { hasText: "Private plan" }).locator('button:has-text("Pin")').click();
  await A.page.waitForSelector("text=Unpin");
  for (const page of [E.page, B.page]) {
    await page.goto("/portal/personal");
    assert.match(page.url(), /\/portal\/dashboard$/);
    assert.ok(!(await page.content()).includes("Private plan"));
  }
});

await step("the console reflects real activity: waiting requests, seats and the audit trail", async () => {
  await A.page.goto("/portal/console");
  const text = await A.page.locator("main").innerText();
  assert.ok(/1\s*request waiting for you/.test(text), "one request still waiting");
  assert.ok(/content updated/.test(text) && /approval approved/.test(text) && /approval rejected/.test(text));
  assert.ok(/Seats by role/.test(text) && /System checks/.test(text));
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
