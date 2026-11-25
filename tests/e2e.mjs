// End-to-end check against a running server: BASE_URL=http://127.0.0.1:3100 node tests/e2e.mjs
// Needs SUPER_ADMIN_EMAILS / ADMIN_BOOTSTRAP_PASSWORD matching the server's environment.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";

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

await step("LP is held to its role: portfolio and shared vault yes, deals / marrow / access / reports no", async () => {
  await B.page.goto("/portal/portfolio");
  assert.match(B.page.url(), /\/portal\/portfolio$/);
  for (const path of ["/portal/deals", "/portal/marrow", "/portal/access", "/portal/reports"]) {
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
  const nav = (await A.page.locator('nav[aria-label="Portal"]').innerText()).toLowerCase();
  for (const label of ["Super Admin", "Security", "Intelligence", "Net worth", "Verticals", "Build", "Co-Build", "Own", "Boring Studio", "Ventures", "Infrastructure", "Rahul Mane · private", "Console", "Site content", "Approvals", "Personal desk"]) {
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
  // This Admin runs both Boring PE and Impact Marrow.
  await A.page.check('input[name="workspace"][value="boring_pe"]');
  await A.page.check('input[name="workspace"][value="impact_marrow"]');
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
  const nav = (await E.page.locator('nav[aria-label="Portal"]').innerText()).toLowerCase();
  for (const group of ["intelligence", "ventures", "infrastructure"]) assert.ok(nav.includes(group), `the ${group} group is there`);
  for (const label of ["super admin", "personal desk", "site content", "console", "rahul mane"]) {
    assert.ok(!nav.includes(label), `Admin must not see ${label}`);
  }
});

await step("an Admin can only offer the lower roles and cannot manage the Super Admin", async () => {
  await E.page.goto("/portal/access");
  const options = await E.page.locator('form select[name="role"]').first().locator("option").allInnerTexts();
  assert.deepEqual(options.map((o) => o.trim()), ["Partner", "Operator", "Co-Build partner", "Founder", "Limited Partner"]);
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

// ---------------------------------------------------------------- Operations

await step("Admin adds a party and a deal under a pillar and moves it freely up to Diligence", async () => {
  await E.page.goto("/portal/deals");
  await E.page.fill('input[name="name"] >> nth=1', "Acme Supplies");
  await E.page.click('button:has-text("Add party")');
  await E.page.waitForSelector("text=Party added.");
  await E.page.fill('input[name="name"] >> nth=0', "Alpha");
  await E.page.selectOption('select[name="pillar"]', "co_build");
  await E.page.selectOption('select[name="partyId"]', { label: "Acme Supplies" });
  await E.page.fill('input[name="value"]', "1,50,000");
  await E.page.click('button:has-text("Add deal")');
  await E.page.waitForSelector("text=Deal added.");
  const row = E.page.locator('li[data-deal="Alpha"]');
  assert.ok(/Co-Build/.test(await row.innerText()) && /1,50,000/.test(await row.innerText()));
  await row.locator("select").selectOption("diligence");
  await row.locator('button:has-text("Move")').click();
  await E.page.waitForSelector("text=Stage updated.");
  assert.ok(/Diligence/.test(await E.page.locator('li[data-deal="Alpha"]').innerText()));
});

await step("a non-owner moving a deal to Closing only asks; the owner's approval then moves it", async () => {
  const row = E.page.locator('li[data-deal="Alpha"]');
  await row.locator("select").selectOption("closing");
  await row.locator('button:has-text("Move")').click();
  await E.page.waitForSelector("text=Sent to the Super Admin");
  const after = await E.page.locator('li[data-deal="Alpha"]').innerText();
  assert.ok(/Diligence/.test(after) && /awaiting approval/.test(after), "still in Diligence, move parked");
  await A.page.goto("/portal/approvals");
  await A.page.locator('li[data-approval=\'Move "Alpha" to Closing\'] button:has-text("Approve")').click();
  await A.page.waitForSelector("text=Approved.");
  await E.page.goto("/portal/deals");
  const done = await E.page.locator('li[data-deal="Alpha"]').innerText();
  assert.ok(/Closing/.test(done) && !/awaiting approval/.test(done), "moved after approval");
});

await step("a rejected stage move leaves the deal where it was; a closed deal is the owner's to move", async () => {
  let row = E.page.locator('li[data-deal="Alpha"]');
  await row.locator("select").selectOption("closed");
  await row.locator('button:has-text("Move")').click();
  await E.page.waitForSelector("text=Sent to the Super Admin");
  await A.page.goto("/portal/approvals");
  await A.page.locator('li[data-approval=\'Move "Alpha" to Closed\'] button:has-text("Reject")').click();
  await A.page.waitForSelector("text=Rejected.");
  await E.page.goto("/portal/deals");
  const text = await E.page.locator('li[data-deal="Alpha"]').innerText();
  assert.ok(/Closing/.test(text) && !/awaiting approval/.test(text));
  await A.page.goto("/portal/deals");
  row = A.page.locator('li[data-deal="Alpha"]');
  await row.locator("select").selectOption("closed");
  await row.locator('button:has-text("Move")').click();
  await A.page.waitForSelector("text=Stage updated.");
  await E.page.goto("/portal/deals");
  row = E.page.locator('li[data-deal="Alpha"]');
  await row.locator("select").selectOption("sourcing");
  await row.locator('button:has-text("Move")').click();
  await E.page.waitForSelector("text=Only the Super Admin can move a closed deal.");
});

await step("money: bad amounts are refused, money in is recorded, a payment out waits for approval", async () => {
  await E.page.goto("/portal/money");
  await E.page.waitForLoadState("networkidle");
  for (const bad of ["abc", "-5", "0"]) {
    await E.page.goto("/portal/money");
    await E.page.waitForLoadState("networkidle");
    await E.page.fill('input[name="amount"]', bad);
    await E.page.click('button:has-text("Save")');
    await E.page.waitForSelector("text=That was not valid");
  }
  await E.page.goto("/portal/money");
  await E.page.waitForLoadState("networkidle");
  await E.page.selectOption('select[name="entityId"]', { label: "Books of Impact Marrow" });
  await E.page.fill('input[name="amount"]', "2,00,000");
  await E.page.fill('input[name="memo"]', "Seed from Acme");
  await E.page.click('button:has-text("Save")');
  await E.page.waitForSelector("text=Recorded.");
  await E.page.selectOption('select[name="entityId"]', { label: "Books of Impact Marrow" });
  await E.page.selectOption('select[name="direction"]', "out");
  await E.page.selectOption('select[name="category"]', "expense");
  await E.page.fill('input[name="amount"]', "25000");
  await E.page.fill('input[name="memo"]', "Legal fees");
  await E.page.click('button:has-text("Save")');
  await E.page.waitForSelector("text=Payment sent to the Super Admin");
  const text = await E.page.locator("main").innerText();
  assert.ok(/awaiting approval/.test(text), "entry waits");
  const cards = await E.page.locator("main .grid").first().innerText();
  assert.ok(/2,00,000/.test(cards), "money in counted");
  assert.ok(/Out \(approved\)\s*₹0\.00/i.test(cards.replace(/\n/g, " ")), "unapproved payment not counted");
});

await step("the owner approving a payment makes it count; rejecting one never does", async () => {
  await E.page.selectOption('select[name="entityId"]', { label: "Books of Impact Marrow" });
  await E.page.selectOption('select[name="direction"]', "out");
  await E.page.fill('input[name="amount"]', "9999");
  await E.page.fill('input[name="memo"]', "Rejected spend");
  await E.page.click('button:has-text("Save")');
  await E.page.waitForSelector("text=Payment sent to the Super Admin");
  await A.page.goto("/portal/approvals");
  await A.page.locator('li[data-approval="Pay ₹25,000.00 (Expense)"] button:has-text("Approve")').click();
  await A.page.waitForSelector("text=Approved.");
  await A.page.locator('li[data-approval="Pay ₹9,999.00 (Investment)"] button:has-text("Reject")').click();
  await A.page.waitForSelector("text=Rejected.");
  await E.page.goto("/portal/money");
  const cards = (await E.page.locator("main .grid").first().innerText()).replace(/\n/g, " ");
  assert.ok(/Out \(approved\)\s*₹25,000\.00/i.test(cards), "only the approved payment counts");
  const list = await E.page.locator("li[data-entry='Rejected spend']").innerText();
  assert.ok(/rejected/.test(list));
});

await step("the owner's own payment counts at once, without asking anyone", async () => {
  await A.page.goto("/portal/money");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="entityId"]', { label: "Books of Impact Marrow" });
  await A.page.selectOption('select[name="direction"]', "out");
  await A.page.fill('input[name="amount"]', "1000");
  await A.page.fill('input[name="memo"]', "Owner paid");
  await A.page.click('button:has-text("Save")');
  await A.page.waitForSelector("text=Recorded.");
  assert.ok(/approved/.test(await A.page.locator("li[data-entry='Owner paid']").innerText()));
});

await step("money posts to the chosen entity's books when it counts, and never before", async () => {
  await A.page.goto("/portal/money");
  assert.ok(/in books/.test(await A.page.locator("li[data-entry='Owner paid']").innerText()));
  assert.ok(/in books/.test(await A.page.locator("li[data-entry='Seed from Acme']").innerText()));
  assert.ok(!/in books/.test(await A.page.locator("li[data-entry='Rejected spend']").innerText()));
  assert.equal(await A.page.locator('button:has-text("Post them to the books")').count(), 0);
  await A.page.goto("/portal/books?view=overview");
  await A.page.click('nav[aria-label="Entities"] a:has-text("Impact Marrow")');
  await A.page.waitForURL(/[?&]e=/);
  const tb = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Bank\s*₹1,74,000\.00/.test(tb) && /Capital\s*₹2,00,000\.00/.test(tb) && /Other expenses\s*₹25,000\.00/.test(tb), tb);
  assert.ok(/Total \(balanced\)/.test(tb));
});

await step("an LP cannot open Money, Tasks or Deals, nor replay the forms", async () => {
  for (const path of ["/portal/money", "/portal/tasks", "/portal/deals"]) {
    await B.page.goto(path);
    assert.match(B.page.url(), /\/portal\/dashboard$/, path);
  }
  await E.page.goto("/portal/money");
  const form = E.page.locator('form:has(input[name="amount"])');
  const actionField = await form.locator('input[name^="$ACTION_ID_"]').first().getAttribute("name");
  const anon = await browser.newContext({ baseURL: BASE });
  for (const request of [B.page.request, anon.request]) {
    await request.post("/portal/money", {
      multipart: { [actionField]: "", direction: "out", category: "payout", amount: "777", memo: "LP replay", date: "2026-01-01" },
      maxRedirects: 0,
    });
  }
  await anon.close();
  await A.page.goto("/portal/money");
  assert.ok(!(await A.page.content()).includes("LP replay"), "no entry was created");
});

await step("tasks: add, see overdue, mark done; the dashboard now shows real figures", async () => {
  await E.page.goto("/portal/tasks");
  await E.page.fill('input[name="title"]', "Send term sheet");
  await E.page.fill('input[name="due"]', "2020-01-01");
  await E.page.selectOption('select[name="dealId"]', { label: "Alpha" });
  await E.page.click('button:has-text("Add task")');
  await E.page.waitForSelector("text=Task added.");
  assert.ok(/overdue/.test(await E.page.locator('li[data-task="Send term sheet"]').innerText()));
  await E.page.locator('li[data-task="Send term sheet"] button:has-text("Mark done")').click();
  await E.page.waitForSelector("text=Marked done.");
  assert.ok(await E.page.locator('li[data-task="Send term sheet"] .line-through').count());
  await A.page.goto("/portal/dashboard");
  const text = (await A.page.locator("main").innerText()).replace(/\n/g, " ");
  assert.ok(/Deals\s*1/i.test(text) && /Money in\s*₹2,00,000/i.test(text) && /Paid out\s*₹26,000/i.test(text), text);
  assert.ok(!/Nothing to report yet/.test(text));
});

// ---------------------------------------------------------------- Books
async function postRows(page, memo, rows) {
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="memo"]', memo);
  for (const [i, [account, debit, credit]] of rows.entries()) {
    await page.selectOption(`select[name="account${i}"]`, { label: account });
    if (debit) await page.fill(`input[name="debit${i}"]`, debit);
    if (credit) await page.fill(`input[name="credit${i}"]`, credit);
  }
  await page.click('button:has-text("Post entry")');
}

await step("books: both entities exist; an unbalanced entry is refused, a balanced one posts", async () => {
  await A.page.goto("/portal/books?view=journal");
  const nav = await A.page.locator('nav[aria-label="Entities"]').innerText();
  assert.ok(/Boring PE/.test(nav) && /Impact Marrow/.test(nav), nav);
  await postRows(A.page, "Bad entry", [["1010 Bank", "1000", ""], ["3010 Capital", "", "900"]]);
  await A.page.waitForSelector("text=not valid or debits and credits are not equal");
  await postRows(A.page, "Capital introduced", [["1010 Bank", "1,00,000", ""], ["3010 Capital", "", "1,00,000"]]);
  await A.page.waitForSelector("text=Entry posted.");
  await A.page.goto("/portal/books?view=overview");
  const tb = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Bank\s*₹1,00,000\.00/.test(tb) && /Total \(balanced\)/.test(tb), tb);
  assert.ok(!tb.includes("Bad entry"));
});

await step("books: income and expense flow into the profit and loss and a balanced balance sheet", async () => {
  await A.page.goto("/portal/books?view=journal");
  await postRows(A.page, "Fee received", [["1010 Bank", "30,000", ""], ["4010 Management fees", "", "30,000"]]);
  await A.page.waitForSelector("text=Entry posted.");
  await A.page.goto("/portal/books?view=journal");
  await postRows(A.page, "Office rent", [["5030 Rent", "10,000", ""], ["1010 Bank", "", "10,000"]]);
  await A.page.waitForSelector("text=Entry posted.");
  await A.page.goto("/portal/books?view=reports&from=2000-01-01&to=2999-12-31");
  const text = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Net profit\s*₹20,000\.00/.test(text), text);
  assert.ok(/Total assets\s*₹1,20,000\.00/.test(text), text);
  assert.ok(/Assets equal liabilities plus equity/.test(text), text);
});

await step("books: an Admin can post but not reverse or create entities; the Super Admin reverses once", async () => {
  await E.page.goto("/portal/books?view=journal");
  await E.page.waitForLoadState("networkidle");
  assert.equal(await E.page.locator('button:has-text("Reverse this entry")').count(), 0);
  assert.equal(await E.page.locator('button:has-text("Create entity")').count(), 0);
  await postRows(E.page, "Admin posted", [["5040 Software and tools", "500", ""], ["1020 Cash", "", "500"]]);
  await E.page.waitForSelector("text=Entry posted.");
  await A.page.goto("/portal/books?view=journal");
  await A.page.locator('article:has-text("Admin posted") button:has-text("Reverse this entry")').click();
  await A.page.waitForSelector("text=Entry reversed");
  assert.equal(await A.page.locator('article:has-text("Admin posted") button:has-text("Reverse this entry")').count(), 0);
  await A.page.goto("/portal/books?view=reports&from=2000-01-01&to=2999-12-31");
  const text = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Net profit\s*₹20,000\.00/.test(text), "the reversal cancels the posting: " + text);
});

await step("books: a new SPV has its own empty books; an LP cannot open Books", async () => {
  await A.page.goto("/portal/books?view=overview");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Alpha SPV");
  await A.page.selectOption('select[name="kind"]', { label: "SPV" });
  await A.page.click('button:has-text("Create entity")');
  await A.page.waitForSelector("text=Entity created");
  assert.ok(/Alpha SPV/.test(await A.page.locator('nav[aria-label="Entities"]').innerText()));
  assert.ok(/No entries yet/.test(await A.page.locator("main").innerText()));
  await B.page.goto("/portal/books");
  assert.match(B.page.url(), /\/portal\/dashboard$/);
});

// ---------------------------------------------------------------- Portfolio and Impact Marrow
const flat = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

await step("portfolio: the owner adds a holding, invests, and an Admin marks a valuation", async () => {
  await A.page.goto("/portal/portfolio");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Acme Foods");
  await A.page.click('button:has-text("Add holding")');
  await A.page.waitForSelector("text=Holding added");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="kind"]', "invest");
  await A.page.fill('input[name="amount"]', "10,00,000");
  await A.page.fill('input[name="date"]', "2026-04-10");
  await A.page.click('button:has-text("Record")');
  await A.page.waitForSelector("text=Investment recorded");
  await A.page.goto("/portal/books?view=overview");
  assert.ok(/Investments\s*₹10,00,000\.00/.test(await flat(A.page)), "posted to Boring PE's books");

  await E.page.goto("/portal/portfolio");
  await E.page.click('a:has-text("Acme Foods")');
  await E.page.waitForLoadState("networkidle");
  const kinds = await E.page.locator('select[name="kind"] option').allInnerTexts();
  assert.ok(!kinds.some((k) => /Invest|Exit/.test(k)), kinds.join());
  await E.page.selectOption('select[name="kind"]', "valuation");
  await E.page.fill('input[name="amount"]', "15,00,000");
  await E.page.fill('input[name="date"]', "2026-09-30");
  await E.page.click('button:has-text("Record")');
  await E.page.waitForSelector("text=Valuation recorded");
  assert.ok(/MOIC\s*1\.50x/.test(await flat(E.page)), await flat(E.page));
});

await step("portfolio: an Admin cannot replay the form to invest", async () => {
  const url = E.page.url();
  // The hidden action id is only in the server-rendered HTML, so read it from there.
  const html = await (await E.page.request.get(url)).text();
  const formHtml = html.match(/<form[^>]*>(?:(?!<\/form>)[\s\S])*name="holdingId"(?:(?!<\/form>)[\s\S])*<\/form>/)[0];
  const actionField = formHtml.match(/name="(\$ACTION_ID_[^"]+)"/)[1];
  const holdingId = formHtml.match(/value="([^"]+)" name="holdingId"|name="holdingId" value="([^"]+)"/).slice(1).find(Boolean);
  await E.page.request.post(url, {
    multipart: { [actionField]: "", holdingId, kind: "invest", amount: "99999", date: "2026-05-01", memo: "replayed" },
    maxRedirects: 0,
  });
  await A.page.goto(url);
  assert.ok(!(await flat(A.page)).includes("replayed"));
});

await step("portfolio: an exit cannot recover more than cost; a full exit books the gain", async () => {
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="kind"]', "exit");
  await A.page.fill('input[name="amount"]', "12,00,000");
  await A.page.fill('input[name="costRecovered"]', "11,00,000");
  await A.page.click('button:has-text("Record")');
  await A.page.waitForSelector("text=cannot recover more cost");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="kind"]', "exit");
  await A.page.fill('input[name="amount"]', "12,00,000");
  await A.page.fill('input[name="costRecovered"]', "10,00,000");
  await A.page.check('input[name="markExited"]');
  await A.page.click('button:has-text("Record")');
  await A.page.waitForSelector("text=Exit recorded");
  const text = await flat(A.page);
  assert.ok(/Realised gain\s*₹2,00,000\.00/i.test(text) && /exited/i.test(text), text);
  await A.page.goto("/portal/books?view=reports&from=2000-01-01&to=2999-12-31");
  assert.ok(/Investment income\s*₹2,00,000\.00/.test(await flat(A.page)));
});

await step("portfolio: investing into our own SPV posts its capital and fills its cap table", async () => {
  await A.page.goto("/portal/portfolio");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Alpha SPV stake");
  await A.page.selectOption('select[name="targetEntityId"]', { label: "Into Alpha SPV (SPV)" });
  await A.page.click('button:has-text("Add holding")');
  await A.page.waitForSelector("text=Holding added");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="kind"]', "invest");
  await A.page.fill('input[name="amount"]', "80,000");
  await A.page.fill('input[name="shares"]', "8000");
  await A.page.click('button:has-text("Record")');
  await A.page.waitForSelector("text=Investment recorded");
  await E.page.goto("/portal/portfolio?view=cap");
  await E.page.waitForLoadState("networkidle");
  await E.page.fill('input[name="holderName"]', "Operator Partner");
  await E.page.selectOption('select[name="instrument"]', "sweat");
  await E.page.fill('input[name="shares"]', "2000");
  await E.page.click('button:has-text("Add shareholder")');
  await E.page.waitForSelector("text=Cap table updated");
  assert.ok(/80\.00%/.test(await E.page.locator('tr[data-holder="Boring PE"]').innerText()));
  assert.ok(/20\.00%/.test(await E.page.locator('tr[data-holder="Operator Partner"]').innerText()));
  await A.page.goto("/portal/books?view=overview");
  await A.page.click('nav[aria-label="Entities"] a:has-text("Alpha SPV")');
  await A.page.waitForURL(/[?&]e=/);
  assert.ok(/Capital\s*₹80,000\.00/.test(await flat(A.page)));
});

await step("Impact Marrow: contributions from Boring PE and Rahul personally land in the fund's books", async () => {
  await A.page.goto("/portal/marrow");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="fromEntityId"]', { label: "From Boring PE" });
  await A.page.fill('input[name="amount"]', "50,000");
  await A.page.fill('input[name="memo"]', "Q3 corpus");
  await A.page.click('button:has-text("Record contribution")');
  await A.page.waitForSelector("text=Contribution recorded");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="amount"]', "10,000");
  await A.page.click('button:has-text("Record contribution")');
  await A.page.waitForSelector('td:has-text("Rahul Mane (Personal)")');
  const text = await flat(A.page);
  assert.ok(/Contributed in total\s*₹60,000\.00/i.test(text), text);
  assert.ok(/Impact Marrow Fund · cash\s*₹60,000\.00/i.test(text), text);
  assert.ok(/Rahul Mane \(Personal\)/.test(text));
  // A personal gift now leaves Rahul's own books too.
  await A.page.goto("/portal/books");
  await A.page.goto((await A.page.locator('nav[aria-label="Entities"] a:has-text("Rahul Mane (Personal)")').getAttribute("href")));
  await A.page.waitForLoadState("networkidle");
  assert.ok(/5090 Impact contributions ₹10,000\.00/.test(await flat(A.page)), await flat(A.page));
  await E.page.goto("/portal/marrow");
  assert.equal(await E.page.locator('button:has-text("Record contribution")').count(), 0);
});

await step("an LP sees no firm holdings", async () => {
  await B.page.goto("/portal/portfolio");
  const text = await flat(B.page);
  assert.ok(!/Acme Foods/.test(text) && /Nothing is linked to you yet/.test(text), text);
});

// ---------------------------------------------------------------- Ventures and operators
const OPERATOR = "operator@example.test";
const OPERATOR_NEW = "operator chosen passphrase 31!";
const F = await ctx();

await step("ventures: the owner invites an operator who signs in", async () => {
  await A.page.goto("/portal/access");
  await A.page.fill('input[name="email"]', OPERATOR);
  await A.page.selectOption('select[name="role"]', "operator");
  await A.page.selectOption('select[name="passwordMode"]', "generate");
  await A.page.click('button:has-text("Invite")');
  await A.page.waitForSelector("code");
  const temp = (await A.page.locator("code").first().innerText()).trim();
  await login(F.page, OPERATOR, temp);
  await F.page.waitForURL(/\/portal\/account/);
  await F.page.fill('input[name="current"]', temp);
  await F.page.fill('input[name="next"]', OPERATOR_NEW);
  await F.page.fill('input[name="confirm"]', OPERATOR_NEW);
  await F.page.click('button:has-text("Save password")');
  await F.page.waitForURL(/changed=1/);
  await login(F.page, OPERATOR, OPERATOR_NEW);
  await F.page.waitForURL(/\/portal\/dashboard/);
});

await step("ventures: a Build venture inside Boring PE pays no fee; the operator's profit share is computed", async () => {
  await A.page.goto("/portal/ventures");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Boring Cafe");
  await A.page.click('button:has-text("Add venture")');
  await A.page.waitForSelector("text=Venture added");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Cafe Operator");
  await A.page.fill('input[name="percent"]', "30");
  await A.page.selectOption('select[name="userId"]', { label: OPERATOR });
  await A.page.click('button:has-text("Add operator")');
  await A.page.waitForSelector("text=Operator added");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="month"]', "2026-10");
  await A.page.fill('input[name="revenue"]', "2,00,000");
  await A.page.fill('input[name="costs"]', "1,20,000");
  await A.page.click('button:has-text("Close month")');
  await A.page.waitForSelector("text=Month closed");
  const text = (await A.page.locator('article[data-period="2026-10"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/Boring Studio fee ₹0\.00/i.test(text) && /Net to venture ₹56,000\.00/i.test(text), text);
  assert.ok(/Cafe Operator ₹24,000\.00/.test(text), text);
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="month"]', "2026-10");
  await A.page.fill('input[name="revenue"]', "1");
  await A.page.click('button:has-text("Close month")');
  await A.page.waitForSelector("text=already closed");
});

await step("ventures: a Co-Build venture in its SPV pays the fee to Boring PE; shares cannot pass 100%", async () => {
  await A.page.goto("/portal/ventures");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Alpha Co-Build");
  await A.page.selectOption('select[name="pillar"]', "co_build");
  await A.page.selectOption('select[name="entityId"]', { label: "Books of Alpha SPV" });
  await A.page.selectOption('select[name="feeType"]', "percent");
  await A.page.fill('input[name="feePercent"]', "5");
  await A.page.click('button:has-text("Add venture")');
  await A.page.waitForSelector("text=Venture added");
  for (const [name, pct, notice] of [["Alpha Operator", "20", "Operator added"], ["Too Much", "85", "more than 100%"]]) {
    await A.page.waitForLoadState("networkidle");
    await A.page.fill('input[name="name"]', name);
    await A.page.fill('input[name="percent"]', pct);
    await A.page.click('button:has-text("Add operator")');
    await A.page.waitForSelector(`text=${notice}`);
  }
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="month"]', "2026-10");
  await A.page.fill('input[name="revenue"]', "1,00,000");
  await A.page.fill('input[name="costs"]', "30,000");
  await A.page.click('button:has-text("Close month")');
  await A.page.waitForSelector("text=Month closed");
  const text = (await A.page.locator('article[data-period="2026-10"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/Boring Studio fee ₹5,000\.00/i.test(text) && /Net to venture ₹52,000\.00/i.test(text), text);
  await A.page.locator('tr[data-payout="Alpha Operator"] button:has-text("Mark paid")').click();
  await A.page.waitForSelector("text=Operator paid");
  assert.ok(/Paid/.test(await A.page.locator('tr[data-payout="Alpha Operator"]').innerText()));
  await A.page.goto("/portal/books?view=reports&from=2026-10-01&to=2026-10-31");
  const pl = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Management fees\s*₹5,000\.00/.test(pl) && /Venture revenue\s*₹2,00,000\.00/.test(pl), pl);
});

await step("ventures: an operator sees only their venture and own share; an LP cannot open Ventures", async () => {
  await F.page.goto("/portal/ventures");
  const list = (await F.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Boring Cafe/.test(list) && !/Alpha Co-Build/.test(list), list);
  assert.equal(await F.page.locator('button:has-text("Add venture")').count(), 0);
  await F.page.click('a:has-text("Boring Cafe")');
  await F.page.waitForSelector('article[data-period="2026-10"]');
  const text = (await F.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Cafe Operator ₹24,000\.00 Due/.test(text) && !/Net to venture/i.test(text), text);
  assert.equal(await F.page.locator('button:has-text("Close month")').count(), 0);
  await A.page.goto("/portal/ventures");
  const alpha = await A.page.locator('a:has-text("Alpha Co-Build")').getAttribute("href");
  await F.page.goto(alpha);
  assert.ok(/not found/.test(await F.page.locator("main").innerText()));
  await B.page.goto("/portal/ventures");
  assert.match(B.page.url(), /\/portal\/dashboard$/);
});

// ---------------------------------------------------------------- People and HR
await step("people: an Admin-managed record links the operator's login; leave balances and overlaps are enforced", async () => {
  await A.page.goto("/portal/people?view=team");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Asha Patil");
  await A.page.fill('input[name="joinDate"]', "2026-01-01");
  await A.page.fill('input[name="monthlyGross"]', "60,000");
  await A.page.fill('input[name="tdsPercent"]', "10");
  await A.page.fill('input[name="otherDeduction"]', "1,800");
  await A.page.selectOption('select[name="userId"]', { label: OPERATOR });
  await A.page.click('button:has-text("Add employee")');
  await A.page.waitForSelector("text=Employee added");

  await F.page.goto("/portal/people");
  assert.equal(await F.page.locator('nav[aria-label="People sections"]').count(), 0, "no team tab for an operator");
  assert.ok(/12 of 12/.test(await F.page.locator('[data-balance="casual"]').innerText()));
  const ask = async (kind, from, to) => {
    await F.page.goto("/portal/people");
    await F.page.waitForLoadState("networkidle");
    await F.page.selectOption('select[name="kind"]', kind);
    await F.page.fill('input[name="from"]', from);
    await F.page.fill('input[name="to"]', to);
    await F.page.click('button:has-text("Ask for leave")');
    await F.page.waitForURL(/notice=/);
    return F.page.url();
  };
  assert.match(await ask("casual", "2026-11-02", "2026-11-14"), /notice=balance/);
  assert.match(await ask("unpaid", "2026-10-05", "2026-10-07"), /notice=leave-requested/);
  assert.match(await ask("sick", "2026-10-07", "2026-10-08"), /notice=overlap/);
  await F.page.goto("/portal/people?view=team");
  assert.ok(!/Add an employee/.test(await F.page.locator("main").innerText()), "the team list stays hidden");
});

await step("people: an Admin approves the leave; the operator cannot decide leave", async () => {
  await E.page.goto("/portal/people?view=leave");
  await E.page.locator('tr[data-leave="Asha Patil 2026-10-05"] button:has-text("Approve")').click();
  await E.page.waitForSelector("text=Leave approved");
  assert.ok(/approved/i.test(await E.page.locator('tr[data-leave="Asha Patil 2026-10-05"]').innerText()));
});

await step("payroll: unpaid leave is deducted, posting books salaries, paying clears them", async () => {
  await A.page.goto("/portal/people?view=payroll");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="month"]', "2026-10");
  await A.page.click('button:has-text("Prepare")');
  await A.page.waitForSelector("text=Draft pay run ready");
  const slip = (await A.page.locator('article[data-run="Boring PE 2026-10"] tr[data-slip="Asha Patil"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/28\/31 \(3 unpaid\)/.test(slip) && /₹54,193\.55/.test(slip) && /₹46,974\.19/.test(slip), slip);
  await A.page.locator('article[data-run="Boring PE 2026-10"] button:has-text("Post to books")').click();
  await A.page.waitForSelector("text=Pay run posted");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="month"]', "2026-10");
  await A.page.click('button:has-text("Prepare")');
  await A.page.waitForSelector("text=already has a pay run");
  await E.page.goto("/portal/people?view=payroll");
  assert.equal(await E.page.locator('button:has-text("Mark salaries paid")').count(), 0);
  await A.page.locator('article[data-run="Boring PE 2026-10"] button:has-text("Mark salaries paid")').click();
  await A.page.waitForSelector("text=Salaries marked paid");
  await A.page.goto("/portal/books?view=reports&from=2026-10-01&to=2026-10-31");
  const pl = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Salaries\s*₹54,193\.55/.test(pl), pl);
});

await step("people: the operator sees their own payslip; an LP cannot open People", async () => {
  await F.page.goto("/portal/people");
  const row = (await F.page.locator('tr[data-payslip="2026-10"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/₹46,974\.19/.test(row) && /paid/i.test(row), row);
  await B.page.goto("/portal/people");
  assert.match(B.page.url(), /\/portal\/dashboard$/);
});

// ---------------------------------------------------------------- Scoped access for external people
const COBUILD = "cobuild@example.test";
const COBUILD_NEW = "cobuild chosen passphrase 42!";
const G = await ctx();
const formAction = (html, marker) => {
  const form = html.match(new RegExp(`<form[^>]*>(?:(?!</form>)[\\s\\S])*${marker}(?:(?!</form>)[\\s\\S])*</form>`))[0];
  return form.match(/name="(\$ACTION_ID_[^"]+)"/)[1];
};

await step("access: links decide exactly what an LP sees", async () => {
  const link = async (who, item) => {
    await A.page.goto("/portal/portfolio?view=access");
    await A.page.waitForLoadState("networkidle");
    await A.page.selectOption('select[name="userId"]', { label: who });
    await A.page.selectOption('select[name="item"]', { label: item });
    await A.page.click('button:has-text("Link")');
    await A.page.waitForSelector("text=Linked.");
  };
  await link(`${LP} (Limited Partner)`, "Alpha SPV");
  await link(`${LP} (Limited Partner)`, "Acme Foods");
  await B.page.goto("/portal/portfolio");
  assert.ok(/80\.00%/.test(await B.page.locator('[data-entity="Alpha SPV"] tr[data-holder="Boring PE"]').innerText()));
  assert.ok(/1\.20x/.test(await B.page.locator('tr[data-holding="Acme Foods"]').innerText()));
  assert.ok(!/Alpha SPV stake/.test(await B.page.locator("main").innerText()), "Boring PE's own holding in the SPV stays hidden");
  await A.page.goto("/portal/portfolio?view=access");
  await A.page.locator(`tr[data-scope="${LP} Acme Foods"] button:has-text("Remove")`).click();
  await A.page.waitForSelector("text=Link removed");
  await B.page.goto("/portal/portfolio");
  assert.ok(!/Acme Foods/.test(await B.page.locator("main").innerText()));
  await B.page.goto("/portal/dashboard");
  const dash = (await B.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Linked companies 1/i.test(dash) && !/Money in/i.test(dash), dash);
});

await step("access: a Co-Build partner sees only the venture linked to them", async () => {
  await A.page.goto("/portal/access");
  await A.page.fill('input[name="email"]', COBUILD);
  await A.page.selectOption('select[name="role"]', "cobuild_partner");
  await A.page.selectOption('select[name="passwordMode"]', "generate");
  await A.page.click('button:has-text("Invite")');
  await A.page.waitForSelector("code");
  const temp = (await A.page.locator("code").first().innerText()).trim();
  await login(G.page, COBUILD, temp);
  await G.page.waitForURL(/\/portal\/account/);
  await G.page.fill('input[name="current"]', temp);
  await G.page.fill('input[name="next"]', COBUILD_NEW);
  await G.page.fill('input[name="confirm"]', COBUILD_NEW);
  await G.page.click('button:has-text("Save password")');
  await G.page.waitForURL(/changed=1/);
  await login(G.page, COBUILD, COBUILD_NEW);
  await G.page.waitForURL(/\/portal\/dashboard/);
  await G.page.goto("/portal/ventures");
  assert.ok(/not linked to a venture yet/.test(await G.page.locator("main").innerText()));

  await A.page.goto("/portal/portfolio?view=access");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="userId"]', { label: `${COBUILD} (Co-Build partner)` });
  await A.page.selectOption('select[name="item"]', { label: "Alpha Co-Build" });
  await A.page.click('button:has-text("Link")');
  await A.page.waitForSelector("text=Linked.");

  await G.page.goto("/portal/ventures");
  const list = await G.page.locator("main").innerText();
  assert.ok(/Alpha Co-Build/.test(list) && !/Boring Cafe/.test(list), list);
  await G.page.click('a:has-text("Alpha Co-Build")');
  await G.page.waitForSelector('article[data-period="2026-10"]');
  const text = (await G.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Revenue ₹1,00,000\.00/.test(text) && !/Alpha Operator/.test(text) && !/Net to venture/i.test(text), text);
  for (const path of ["/portal/books", "/portal/people", "/portal/money", "/portal/deals"]) {
    await G.page.goto(path);
    assert.match(G.page.url(), /\/portal\/dashboard$/, path);
  }
});

await step("tasks: an operator sees and changes only their own tasks", async () => {
  await F.page.goto("/portal/tasks");
  await F.page.waitForLoadState("networkidle");
  const before = await F.page.locator("main").innerText();
  assert.ok(!/Send term sheet/.test(before) && !/Alpha/.test(before), before);
  const options = await F.page.locator('select[name="assigneeId"] option').allInnerTexts();
  assert.deepEqual(options.filter((o) => o !== "Unassigned").length, 1, options.join());
  await F.page.fill('input[name="title"]', "Operator task");
  await F.page.click('button:has-text("Add task")');
  await F.page.waitForSelector('li[data-task="Operator task"]');

  const aHtml = await (await A.page.request.get("/portal/tasks")).text();
  const target = aHtml.match(/data-task="Send term sheet"[\s\S]*?name="id" value="([^"]+)"/)[1];
  const fHtml = await (await F.page.request.get("/portal/tasks")).text();
  await F.page.request.post("/portal/tasks", {
    multipart: { [formAction(fHtml, 'name="done"')]: "", id: target, done: "false" },
    maxRedirects: 0,
  });
  await A.page.goto("/portal/tasks");
  assert.ok(await A.page.locator('li[data-task="Send term sheet"] .line-through').count(), "still done");
  await F.page.goto("/portal/dashboard");
  assert.ok(/Open tasks\s*1/i.test(await F.page.locator("main").innerText()));
});

// ---------------------------------------------------------------- Vault and MIS
await step("vault: shared documents reach linked people only; team-only ones never do", async () => {
  const up = async (title, name, visibility, notice) => {
    await A.page.goto("/portal/vault");
    await A.page.waitForLoadState("networkidle");
    await A.page.setInputFiles('input[name="file"]', { name, mimeType: "application/octet-stream", buffer: Buffer.from(`content of ${title}`) });
    await A.page.fill('input[name="title"]', title);
    await A.page.selectOption('select[name="link"]', { label: "Alpha SPV" });
    await A.page.selectOption('select[name="visibility"]', visibility);
    await A.page.click('button:has-text("Upload")');
    await A.page.waitForSelector(`text=${notice}`);
  };
  await up("Alpha SHA", "alpha-sha.pdf", "linked", "File added");
  await up("Board notes", "board.pdf", "firm", "File added");
  await up("Bad file", "evil.html", "firm", "Allowed types");

  await B.page.goto("/portal/vault");
  const lp = await B.page.locator("main").innerText();
  assert.ok(/Alpha SHA/.test(lp) && !/Board notes/.test(lp) && !/Bad file/.test(lp), lp);
  const href = await B.page.locator('tr[data-doc="Alpha SHA"] a').getAttribute("href");
  const res = await B.page.request.get(href);
  assert.equal(res.status(), 200);
  assert.equal(await res.text(), "content of Alpha SHA");
  assert.match(res.headers()["content-disposition"], /attachment; filename="alpha-sha\.pdf"/);

  await A.page.goto("/portal/vault");
  const privateHref = await A.page.locator('tr[data-doc="Board notes"] a').getAttribute("href");
  assert.equal((await B.page.request.get(privateHref)).status(), 404, "team-only document by direct link");
  assert.equal((await G.page.request.get(href)).status(), 404, "someone not linked to Alpha SPV");
  await G.page.goto("/portal/vault");
  assert.ok(/No files yet/.test(await G.page.locator("main").innerText()));

  await E.page.goto("/portal/vault");
  assert.equal(await E.page.locator('button:has-text("Delete")').count(), 0);
  await A.page.locator('tr[data-doc="Board notes"] summary').click();
  await A.page.locator('tr[data-doc="Board notes"] button:has-text("Delete")').click();
  await A.page.waitForSelector("text=File deleted");
});

await step("drive: folders, files kept private, moving, and folders that are not empty stay", async () => {
  await A.page.goto("/portal/vault");
  await A.page.fill('input[name="name"]', "Board");
  await A.page.click('button:has-text("Create")');
  await A.page.waitForSelector("text=Folder created.");
  await A.page.click('[data-folder="Board"]');
  await A.page.waitForURL(/f=/);
  assert.match(await A.page.locator("[data-breadcrumb]").innerText(), /All files.*Board/s);
  await A.page.fill('input[name="name"]', "2026");
  await A.page.click('button:has-text("Create")');
  await A.page.waitForSelector("text=Folder created.");
  await A.page.waitForLoadState("networkidle");
  await A.page.setInputFiles('input[name="file"]', { name: "salary-plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("private plan") });
  await A.page.fill('form:has(input[name="file"]) input[name="title"]', "Salary plan");
  await A.page.selectOption('select[name="visibility"]', "private");
  await A.page.click('button:has-text("Upload")');
  await A.page.waitForSelector("text=File added.");
  assert.equal(await A.page.locator('[data-doc="Salary plan"]').count(), 1, `in the folder: ${A.page.url()} ${await A.page.locator("main").innerText()}`.slice(0, 1500));
  const href = await A.page.locator('[data-doc="Salary plan"] a').getAttribute("href");

  await E.page.goto("/portal/vault?q=salary");
  assert.equal(await E.page.locator('[data-doc="Salary plan"]').count(), 0, "a private file never shows to others");
  assert.equal((await E.page.request.get(href)).status(), 404, "nor by direct link");

  await A.page.click('button[value="delete"]');
  await A.page.waitForSelector("text=Move or delete what is inside");
  await A.page.locator('[data-doc="Salary plan"] summary').click();
  await A.page.selectOption('[data-doc="Salary plan"] select[name="to"]', { label: "Board / 2026" });
  await A.page.click('[data-doc="Salary plan"] button:has-text("Move")');
  await A.page.waitForSelector("text=File moved.");
  await A.page.goto(await A.page.locator('[data-folder="2026"]').getAttribute("href"));
  assert.equal(await A.page.locator('[data-doc="Salary plan"]').count(), 1, `moved: ${A.page.url()}`);
  await A.page.goto("/portal/vault?q=salary");
  assert.equal(await A.page.locator('[data-doc="Salary plan"]').count(), 1, "search looks inside folders");
});

await step("MIS: group figures remove fees between our own entities; verticals and CSV agree", async () => {
  await A.page.goto("/portal/reports?from=2026-10-01&to=2026-10-31");
  const fee = (await A.page.locator('tr[data-entity-row="Fees between our entities"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/−₹5,000\.00/.test(fee), fee);
  assert.ok(/₹2,00,000\.00/.test(await A.page.locator('tr[data-vertical="build"]').innerText()));
  assert.ok(/₹1,00,000\.00/.test(await A.page.locator('tr[data-vertical="co_build"]').innerText()));
  const ent = async (name) => (await A.page.locator(`tr[data-entity-row="${name}"] td`).nth(1).innerText()).replace(/[₹,]/g, "");
  const incomes = await Promise.all(["Boring PE", "Impact Marrow", "Alpha SPV", "Impact Marrow Fund"].map(ent));
  const group = Number(await ent("Group"));
  assert.equal(Math.round(group * 100), Math.round((incomes.reduce((a, b) => a + Number(b), 0) - 5000) * 100), `${incomes} ${group}`);

  const csv = await (await A.page.request.get("/portal/reports/export?from=2026-10-01&to=2026-10-31")).text();
  assert.ok(csv.includes("Less: fees between our entities,,-5000.00,-5000.00"), csv.slice(0, 600));
  assert.ok(/\r\nGroup,,/.test(csv));

  await E.page.goto("/portal/reports");
  assert.match(E.page.url(), /\/portal\/reports/);
  for (const page of [F.page, B.page, G.page]) {
    await page.goto("/portal/reports");
    assert.match(page.url(), /\/portal\/dashboard$/);
    const res = await page.request.get("/portal/reports/export", { maxRedirects: 0 });
    assert.notEqual(res.status(), 200, "CSV is not for external people");
  }
});

// ---------------------------------------------------------------- Invoicing, GST and TDS
await step("invoicing: GSTINs are checked; an inter-state invoice charges IGST and posts on issue", async () => {
  await A.page.goto("/portal/invoices?view=settings");
  await A.page.waitForLoadState("networkidle");
  const bpe = A.page.locator('form[data-entity-gst="Boring PE"]');
  await bpe.locator('input[name="gstin"]').fill("27AAPFU0939F1ZW");
  await bpe.locator('button:has-text("Save")').click();
  await A.page.waitForSelector("text=That GSTIN or state is not valid");
  await A.page.waitForLoadState("networkidle");
  await A.page.locator('form[data-entity-gst="Boring PE"] input[name="gstin"]').fill("27AAPFU0939F1ZV");
  await A.page.locator('form[data-entity-gst="Boring PE"] button:has-text("Save")').click();
  await A.page.waitForSelector("text=Saved.");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="partyId"]', { label: "Acme Supplies" });
  await A.page.locator('input[placeholder="GSTIN (blank if unregistered)"]').fill("29AAGCB7383J1Z4");
  await A.page.locator('form:has(select[name="partyId"]) button:has-text("Save")').click();
  await A.page.waitForSelector("text=Saved.");

  await A.page.goto("/portal/invoices?view=new");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="partyId"]', { label: "To Acme Supplies (29AAGCB7383J1Z4)" });
  await A.page.selectOption('select[name="placeOfSupply"]', "29");
  await A.page.fill('input[name="desc0"]', "Advisory retainer");
  await A.page.fill('input[name="sac0"]', "998311");
  await A.page.fill('input[name="rate0"]', "1,00,000");
  await A.page.click('button:has-text("Save draft")');
  await A.page.waitForSelector("text=Draft saved");
  const doc = (await A.page.locator("[data-invoice-doc]").innerText()).replace(/\s+/g, " ");
  assert.ok(/IGST ₹18,000\.00/.test(doc) && /Total ₹1,18,000\.00/.test(doc) && !/CGST/.test(doc), doc);
  await A.page.click('button:has-text("Issue invoice")');
  await A.page.waitForSelector("text=Invoice issued");
  const issued = await A.page.locator("[data-invoice-doc]").innerText();
  assert.match(issued, /INV\/20\d\d-\d\d\/000[12]/, "numbering restarts in a new financial year, or follows the fee invoice in the same one");
  await A.page.goto("/portal/books?view=overview");
  assert.ok(/Output IGST\s*₹18,000\.00/.test((await A.page.locator("main").innerText()).replace(/\s+/g, " ")));
});

await step("invoicing: receipts take TDS, can't exceed what is owed, and settle the invoice", async () => {
  await A.page.goto("/portal/invoices");
  await A.page.locator('tr:has-text("Acme Supplies") a').first().click();
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="amount"]', "2,00,000");
  await A.page.click('button:has-text("Record receipt")');
  await A.page.waitForSelector("text=more than is still outstanding");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="amount"]', "1,08,000");
  await A.page.fill('input[name="tds"]', "10,000");
  await A.page.click('button:has-text("Record receipt")');
  await A.page.waitForSelector("text=Receipt recorded");
  assert.ok(/paid/i.test(await A.page.locator("[data-invoice-doc]").innerText()));
  await A.page.goto("/portal/books?view=overview");
  assert.ok(/TDS receivable\s*₹10,000\.00/.test((await A.page.locator("main").innerText()).replace(/\s+/g, " ")));
});

await step("invoicing: within the state it is CGST plus SGST; a cancelled invoice leaves the GST summary", async () => {
  await A.page.goto("/portal/invoices?view=new");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="partyId"]', { label: "To Acme Supplies (29AAGCB7383J1Z4)" });
  await A.page.selectOption('select[name="placeOfSupply"]', "27");
  await A.page.fill('input[name="desc0"]', "Workshop");
  await A.page.fill('input[name="rate0"]', "10,000");
  await A.page.click('button:has-text("Save draft")');
  await A.page.waitForSelector("text=Draft saved");
  const doc = (await A.page.locator("[data-invoice-doc]").innerText()).replace(/\s+/g, " ");
  assert.ok(/CGST ₹900\.00/.test(doc) && /SGST ₹900\.00/.test(doc) && !/IGST/.test(doc), doc);
  await A.page.click('button:has-text("Issue invoice")');
  await A.page.waitForSelector("text=Invoice issued");
  await A.page.click('button:has-text("Cancel invoice")');
  await A.page.waitForSelector("text=Invoice cancelled");
  const month = new Date().toISOString().slice(0, 7);
  await A.page.goto(`/portal/invoices?view=gst&month=${month}`);
  const gst = (await A.page.locator("[data-gst]").innerText()).replace(/\s+/g, " ");
  assert.ok(/Output IGST ₹18,000\.00/i.test(gst) && /Output CGST ₹0\.00/i.test(gst) && /B2B taxable value ₹1,00,000\.00/i.test(gst), gst);
});

await step("invoicing: the Boring Studio fee is a real invoice; settling it moves money in both entities' books", async () => {
  await A.page.goto("/portal/invoices?view=receivables");
  const row = (await A.page.locator('tr[data-receivable="Alpha SPV"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/₹5,000\.00/.test(row), row);
  await A.page.goto("/portal/invoices");
  await A.page.locator('tr[data-invoice="INV/2026-27/0001"] a').click();
  await A.page.waitForLoadState("networkidle");
  assert.ok(/Boring Studio fee: Alpha Co-Build, 2026-10/.test(await A.page.locator("[data-invoice-doc]").innerText()));
  assert.equal(await A.page.locator('button:has-text("Cancel invoice")').count(), 0, "fee invoices are not cancelled by hand");
  await A.page.click('button:has-text("Settle between our entities")');
  await A.page.waitForSelector("text=Settled between our entities");
  await A.page.goto("/portal/invoices?view=receivables");
  assert.equal(await A.page.locator('tr[data-receivable="Alpha SPV"]').count(), 0);
  await E.page.goto("/portal/invoices");
  assert.equal(await E.page.locator('a:has-text("GST settings")').count(), 1, "Admins manage invoicing");
  for (const page of [B.page, F.page, G.page]) {
    await page.goto("/portal/invoices");
    assert.match(page.url(), /\/portal\/dashboard$/);
  }
});

// ---------------------------------------------------------------- Bank reconciliation
await step("bank: a statement imports, matches the books, posts charges, reconciles, and never imports twice", async () => {
  const d = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
  const csv = [
    "Impact Marrow Fund - Savings,,,,,",
    "Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    `${d},NEFT BORING PE CORPUS,UTR11,,"50,000.00","50,000.00"`,
    `${d},IMPS RAHUL MANE,UTR12,,"10,000.00","60,000.00"`,
    `${d},SMS AND SERVICE CHARGES,,59.00,,"59,941.00"`,
  ].join("\n");
  const send = async () => {
    await A.page.goto("/portal/bank");
    await A.page.click('nav[aria-label="Entities"] a:has-text("Impact Marrow Fund")');
    await A.page.waitForURL(/[?&]e=/);
    await A.page.waitForLoadState("networkidle");
    await A.page.setInputFiles('input[name="file"]', { name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await A.page.click('button:has-text("Import statement")');
    await A.page.waitForSelector("text=Statement imported");
    return (await A.page.locator('[role="status"]').innerText()).replace(/\s+/g, " ");
  };
  const first = await send();
  assert.ok(/3 new lines, 0 already imported, 0 rows skipped, 2 matched automatically/.test(first), first);
  assert.ok(/matched/i.test(await A.page.locator('tr[data-bank-line="NEFT BORING PE CORPUS"]').innerText()));
  await A.page.locator('tr[data-bank-line="SMS AND SERVICE CHARGES"] button:has-text("Post")').click();
  await A.page.waitForSelector("text=Posted to the books and matched");
  const recon = (await A.page.locator("[data-recon]").innerText()).replace(/\s+/g, " ");
  assert.ok(/Difference ₹0\.00/i.test(recon) && /0 unmatched/.test(recon), recon);
  const again = await send();
  assert.ok(/0 new lines, 3 already imported/.test(again), again);
  await A.page.goto("/portal/books?view=overview");
  await A.page.click('nav[aria-label="Entities"] a:has-text("Impact Marrow Fund")');
  await A.page.waitForURL(/[?&]e=/);
  assert.ok(/Bank charges\s*₹59\.00/.test((await A.page.locator("main").innerText()).replace(/\s+/g, " ")));
  for (const page of [B.page, F.page]) {
    await page.goto("/portal/bank");
    assert.match(page.url(), /\/portal\/dashboard$/);
  }
});

// ---------------------------------------------------------------- Notifications and phones
await step("notifications: each person hears about their own things, and opening one marks it read", async () => {
  await A.page.goto("/portal/notifications");
  const a = await A.page.locator("main").innerText();
  assert.ok(/Approval needed: Pay ₹25,000\.00 \(Expense\)/.test(a), a.slice(0, 400));
  assert.ok(/Leave request: Asha Patil/.test(a));
  await E.page.goto("/portal/notifications");
  assert.ok(/Approved: Pay ₹25,000\.00 \(Expense\)/.test(await E.page.locator("main").innerText()));
  await F.page.goto("/portal/notifications");
  const f = await F.page.locator("main").innerText();
  for (const t of [/Leave approved/, /Payslip ready: 2026-10/, /Salary paid: 2026-10/, /Statement ready: Boring Cafe 2026-10/]) assert.ok(t.test(f), `${t} in ${f.slice(0, 500)}`);
  assert.ok(!/Approval needed/.test(f), "operators never see others' approvals");
  await B.page.goto("/portal/notifications");
  assert.ok(/New document shared: Alpha SHA/.test(await B.page.locator("main").innerText()));

  const bell = async () => (await F.page.locator("[data-bell]").getAttribute("aria-label")) ?? "";
  const before = await bell();
  await F.page.locator('li[data-notification="Leave approved"] a').click();
  await F.page.waitForURL(/\/portal\/people/);
  assert.notEqual(await bell(), before, "the unread count went down");
  const href = await A.page.locator("li[data-notification] a").first().getAttribute("href");
  await F.page.goto(href);
  assert.match(F.page.url(), /\/portal\/notifications$/, "someone else's notification opens nothing");
});

await step("phones: the menu is a drawer, it closes after choosing, and no page scrolls sideways", async () => {
  const M = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await M.newPage();
  await login(page, ADMIN, ADMIN_NEW);
  await page.waitForURL(/\/portal\//);
  const nav = page.locator("#portal-nav");
  const offscreen = async () => (await nav.boundingBox()).x < 0;
  assert.ok(await offscreen(), "the menu starts hidden");
  await page.click('button[aria-label="Open menu"]');
  await page.waitForTimeout(400);
  assert.ok(!(await offscreen()), "the menu opens");
  await page.click('#portal-nav a:has-text("Invoices")');
  await page.waitForURL(/\/portal\/invoices/);
  await page.waitForTimeout(400);
  assert.ok(await offscreen(), "choosing a page closes it");
  for (const path of ["/portal/dashboard", "/portal/books?view=reports", "/portal/invoices", "/portal/people?view=payroll", "/portal/ventures", "/portal/bank", "/portal/reports", "/portal/portfolio"]) {
    await page.goto(path);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(wide <= 1, `${path} scrolls sideways by ${wide}px`);
  }
  await M.close();
});

// ---------------------------------------------------------------- Fixed assets, budgets, foreign currency
const txt = async (page, sel = "main") => (await page.locator(sel).innerText()).replace(/\s+/g, " ");

await step("assets: buying, monthly depreciation once per month, and disposal all post to the books", async () => {
  await A.page.goto("/portal/assets");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Laptop");
  await A.page.fill('input[name="purchaseDate"]', "2026-04-01");
  await A.page.fill('input[name="cost"]', "1,20,000");
  await A.page.click('button:has-text("Add asset")');
  await A.page.waitForSelector("text=Asset added");
  for (const [month, notice] of [["2026-04", "Depreciation posted"], ["2026-04", "already posted"], ["2026-05", "Depreciation posted"]]) {
    await A.page.waitForLoadState("networkidle");
    await A.page.fill('input[name="month"]', month);
    await A.page.click('button:has-text("Post depreciation")');
    await A.page.waitForSelector(`text=${notice}`);
  }
  const row = await txt(A.page, 'tr[data-asset="Laptop"]');
  assert.ok(/₹6,666\.66/.test(row) && /₹1,13,333\.34/.test(row), row);
  await A.page.locator('tr[data-asset="Laptop"] input[name="proceeds"]').fill("1,00,000");
  await A.page.locator('tr[data-asset="Laptop"] button:has-text("Dispose")').click();
  await A.page.waitForSelector("text=Asset disposed");
  assert.ok(/Disposed/.test(await txt(A.page, 'tr[data-asset="Laptop"]')));
  assert.ok(/Book value ₹0\.00/i.test(await txt(A.page, "[data-asset-totals]")));
  await A.page.goto("/portal/books?view=reports&from=2026-04-01&to=2026-05-31");
  const pl = await txt(A.page);
  assert.ok(/Depreciation\s*₹6,666\.66/.test(pl), pl);
});

await step("budgets: a yearly budget spreads over months and compares with the books", async () => {
  await A.page.goto("/portal/budgets?fy=2026&to=2026-10-31");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="accountId"]', { label: "4010 Management fees" });
  await A.page.fill('input[name="annual"]', "1,20,000");
  await A.page.click('button:has-text("Save")');
  await A.page.waitForSelector("text=Budget saved");
  await A.page.goto("/portal/budgets?fy=2026&to=2026-10-31");
  const row = await txt(A.page, 'tr[data-budget="Management fees"]');
  assert.ok(/₹70,000\.00/.test(row) && /₹5,000\.00/.test(row) && /−?-?₹65,000\.00/.test(row), row);
});

await step("currency: money, journals and invoices in dollars land in rupees, with exchange gain on payment", async () => {
  await A.page.goto("/portal/money");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="entityId"]', { label: "Books of Impact Marrow" });
  await A.page.fill('input[name="amount"]', "1,000");
  await A.page.selectOption('select[name="currency"]', "USD");
  await A.page.fill('input[name="fxRate"]', "83.50");
  await A.page.fill('input[name="memo"]', "Grant from abroad");
  await A.page.click('button:has-text("Save")');
  await A.page.waitForSelector("text=Recorded.");
  const entry = await txt(A.page, "li[data-entry='Grant from abroad']");
  assert.ok(/₹83,500\.00/.test(entry) && /USD 1000\.00/.test(entry), entry);

  await A.page.goto("/portal/invoices?view=new");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="partyId"]', { label: "To Acme Supplies (29AAGCB7383J1Z4)" });
  await A.page.selectOption('select[name="currency"]', "USD");
  await A.page.fill('input[name="fxRate"]', "83");
  await A.page.fill('input[name="desc0"]', "Cross-border advisory");
  await A.page.fill('input[name="rate0"]', "1,000");
  await A.page.selectOption('select[name="gst0"]', "0");
  await A.page.click('button:has-text("Save draft")');
  await A.page.waitForSelector("text=Draft saved");
  const doc = await txt(A.page, "[data-invoice-doc]");
  assert.ok(/Total USD 1000\.00/.test(doc) && /In rupees at 83\.000000 ₹83,000\.00/.test(doc), doc);
  await A.page.click('button:has-text("Issue invoice")');
  await A.page.waitForSelector("text=Invoice issued");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="amount"]', "84,000");
  await A.page.fill('input[name="fxSettled"]', "1,000");
  await A.page.click('button:has-text("Record receipt")');
  await A.page.waitForSelector("text=Receipt recorded");
  assert.ok(/paid/i.test(await txt(A.page, "[data-invoice-doc]")));
  await A.page.goto("/portal/books?view=overview");
  assert.ok(/Exchange gain\s*₹1,000\.00/.test(await txt(A.page)));
});

// ---------------------------------------------------------------- Integrations hub, API keys, webhooks
await step("integrations: secrets are saved but never shown again; disconnecting removes them", async () => {
  await A.page.goto("/portal/integrations?view=services&p=razorpay");
  await A.page.waitForLoadState("networkidle");
  const rp = A.page.locator('details[data-provider="razorpay"]');
  await rp.locator('input[name="keyId"]').fill("rzp_test_ABCDEF123456");
  await rp.locator('input[name="keySecret"]').fill("super-secret-value-123");
  await rp.locator('input[name="webhookSecret"]').fill("hook-secret-456");
  await rp.locator('button:has-text("Save and test")').click();
  await A.page.waitForURL(/notice=/);
  const html = await A.page.content();
  assert.ok(!html.includes("super-secret-value-123") && !html.includes("hook-secret-456"), "secrets never come back to the page");
  assert.ok(html.includes("rzp_test_ABCDEF123456"), "non-secret settings do");
  assert.equal(await A.page.locator('details[data-provider="razorpay"] input[name="keySecret"]').getAttribute("placeholder"), "•••••• saved (leave blank to keep)");
  await A.page.goto("/portal/integrations?view=log");
  assert.ok(/razorpay/.test(await A.page.locator("main").innerText()));
  await A.page.goto("/portal/integrations?view=services&p=razorpay");
  await A.page.locator('details[data-provider="razorpay"] button:has-text("Disconnect")').click();
  await A.page.waitForSelector("text=Disconnected and its secrets removed");
  assert.match(await A.page.locator('details[data-provider="razorpay"] [data-status]').innerText(), /disconnected/i);
  await E.page.goto("/portal/integrations");
  assert.ok(!/\/portal\/integrations/.test(E.page.url()), "Admins cannot open integrations");
});

await step("API: keys authenticate, scopes limit them, money in posts to the books, revoking stops them", async () => {
  await A.page.goto("/portal/integrations?view=api");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="name"]', "Zapier");
  await A.page.check('input[name="scopes"][value="write:money"]');
  await A.page.click('button:has-text("Create key")');
  const key = (await A.page.locator("[data-secret]").innerText()).trim();
  assert.match(key, /^bpe_/);
  const api = await browser.newContext({ baseURL: BASE });
  const auth = { Authorization: `Bearer ${key}` };
  assert.equal((await api.request.get("/api/v1/me")).status(), 401);
  assert.equal((await api.request.get("/api/v1/me", { headers: { Authorization: "Bearer bpe_wrongwrongwrongwrongwrong" } })).status(), 401);
  const me = await (await api.request.get("/api/v1/me", { headers: auth })).json();
  assert.equal(me.key, "Zapier");
  const ents = await (await api.request.get("/api/v1/entities", { headers: auth })).json();
  assert.ok(ents.data.some((e) => e.name === "Boring PE"));
  const made = await api.request.post("/api/v1/money", { headers: auth, data: { amount: "5,000", category: "fee", memo: "Paid via API" } });
  assert.equal(made.status(), 201);
  assert.equal((await api.request.post("/api/v1/tasks", { headers: auth, data: { title: "From API" } })).status(), 403, "no write:tasks scope");
  await A.page.goto("/portal/money");
  assert.ok(/in books/.test(await A.page.locator("li[data-entry='Paid via API']").innerText()));
  await A.page.goto("/portal/integrations?view=api");
  await A.page.locator('tr[data-key="Zapier"] button:has-text("Revoke")').click();
  await A.page.waitForSelector("text=Key revoked");
  assert.equal((await api.request.get("/api/v1/me", { headers: auth })).status(), 401);
  await api.close();
});

await step("webhooks: private addresses are refused; a public endpoint gets a signing secret and its deliveries are recorded", async () => {
  await A.page.goto("/portal/integrations?view=webhooks");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="url"]', "https://169.254.169.254/latest/meta-data");
  await A.page.check('input[name="events"][value="invoice.issued"]');
  await A.page.click('button:has-text("Add endpoint")');
  await A.page.waitForSelector("text=Use a public https:// address");
  await A.page.fill('input[name="url"]', "https://hooks.example.com/boring");
  await A.page.check('input[name="events"][value="invoice.issued"]');
  await A.page.click('button:has-text("Add endpoint")');
  assert.match((await A.page.locator("[data-secret]").innerText()).trim(), /^whsec_/);
  await A.page.goto("/portal/integrations?view=webhooks");
  await A.page.locator('tr[data-webhook="https://hooks.example.com/boring"] button:has-text("Send test")').click();
  await A.page.waitForURL(/notice=ping-/);
  assert.ok(/failed|ok/.test(await A.page.locator('tr[data-webhook="https://hooks.example.com/boring"]').innerText()), "the delivery is recorded either way");
});

// ---------------------------------------------------------------- Unified inbox
await step("inbox: a mailbox connects; mail lists, opens sandboxed, searches, and replies", async () => {
  await A.page.goto("/portal/inbox?view=accounts");
  assert.ok(/Gmail \/ Google Workspace: not set up/.test(await A.page.locator("main").innerText()), "providers wait for the hub");
  await A.page.click('button:has-text("Connect test mailbox")');
  await A.page.waitForSelector("text=Mailbox connected");
  await A.page.goto("/portal/inbox");
  assert.ok(/Term sheet draft/.test(await A.page.locator("main").innerText()));
  await A.page.goto("/portal/inbox?q=statement");
  const found = await A.page.locator("main").innerText();
  assert.ok(/Statement ready/.test(found) && !/Term sheet draft/.test(found), found);
  await A.page.goto("/portal/inbox");
  await A.page.locator('li[data-mail="Term sheet draft"] a').click();
  const frame = A.page.locator("[data-mail-frame]");
  await frame.waitFor();
  const sandbox = await frame.getAttribute("sandbox");
  assert.ok(!/allow-scripts|allow-same-origin/.test(sandbox ?? ""), `sandbox: ${sandbox}`);
  assert.ok((await frame.getAttribute("srcdoc")).includes("default-src 'none'"));
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="to"]', "not-an-email");
  await A.page.fill('textarea[name="body"]', "Thanks");
  await A.page.click('button:has-text("Send reply")');
  await A.page.waitForSelector("text=Recipients must be email addresses");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('textarea[name="body"]', "Thanks, reviewing today.");
  await A.page.click('button:has-text("Send reply")');
  await A.page.waitForSelector("text=Sent.");
  assert.ok(/Re: Term sheet draft/.test(await A.page.locator("main").innerText()));
});

await step("inbox: mailboxes are private until shared, and never shared outside the team; OAuth state is bound to its starter", async () => {
  await E.page.goto("/portal/inbox");
  assert.ok(/No mailbox connected yet/.test(await E.page.locator("main").innerText()), "an Admin cannot read the owner's mail");
  await A.page.goto("/portal/inbox?view=accounts");
  await A.page.locator(`li[data-mailbox="${ADMIN}"] button:has-text("Share with team")`).click();
  await A.page.waitForSelector("text=Shared with the Boring PE team");
  await E.page.goto("/portal/inbox");
  assert.ok(/Term sheet draft/.test(await E.page.locator("main").innerText()), "shared with the team");
  await E.page.goto("/portal/inbox?view=accounts");
  assert.equal(await E.page.locator(`li[data-mailbox="${ADMIN}"] button`).count(), 0, "only the owner manages it");
  await F.page.goto("/portal/inbox");
  assert.ok(/No mailbox connected yet/.test(await F.page.locator("main").innerText()), "operators never see team mailboxes");
  await A.page.locator(`li[data-mailbox="${ADMIN}"] button:has-text("Make private")`).click();
  await A.page.waitForSelector("text=Now private to you");
  await E.page.goto("/portal/inbox");
  assert.ok(/No mailbox connected yet/.test(await E.page.locator("main").innerText()));

  await E.page.goto("/api/integrations/oauth/google/start");
  assert.match(E.page.url(), /notice=not-setup/);
  await E.page.goto("/api/integrations/oauth/google/callback?code=abc&state=forged-state-value");
  assert.match(E.page.url(), /notice=connect-failed/);
});

// ---------------------------------------------------------------- WhatsApp shared inbox
const WA_SECRET = "app-secret-xyz";
const waPost = async (payload, secret = WA_SECRET) => {
  const body = JSON.stringify(payload);
  const sig = secret === null ? {} : { "X-Hub-Signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` };
  const ctxt = await browser.newContext({ baseURL: BASE });
  const res = await ctxt.request.post("/api/webhooks/whatsapp", { data: body, headers: { "Content-Type": "application/json", ...sig } });
  await ctxt.close();
  return res.status();
};
const waText = (from, name, id, text, secondsAgo = 60) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA1", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "91 22 0000", phone_number_id: "PN123" },
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000) - secondsAgo), type: "text", text: { body: text } }],
  } }] }],
});

await step("whatsapp: Meta's checks hold: the verify handshake, signed webhooks only, duplicates ignored", async () => {
  await A.page.goto("/portal/integrations?view=services&p=whatsapp");
  await A.page.waitForLoadState("networkidle");
  const wa = A.page.locator('details[data-provider="whatsapp"]');
  for (const [k, v] of [["phoneNumberId", "PN123"], ["businessAccountId", "WABA1"], ["accessToken", "token-abc"], ["appSecret", WA_SECRET], ["verifyToken", "verify-me"]]) {
    await wa.locator(`input[name="${k}"]`).fill(v);
  }
  await wa.locator('button:has-text("Save and test")').click();
  await A.page.waitForURL(/notice=/);
  const anon = await browser.newContext({ baseURL: BASE });
  const ok = await anon.request.get("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=8675309");
  assert.equal(await ok.text(), "8675309");
  assert.equal((await anon.request.get("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status(), 403);
  await anon.close();
  assert.equal(await waPost(waText("919800000001", "Meera", "wamid.IN1", "Is the deck ready?"), null), 401, "unsigned");
  assert.equal(await waPost(waText("919800000001", "Meera", "wamid.IN1", "Is the deck ready?"), "wrong-secret"), 401, "forged");
  assert.equal(await waPost(waText("919800000001", "Meera", "wamid.IN1", "Is the deck ready?")), 200);
  assert.equal(await waPost(waText("919800000001", "Meera", "wamid.IN1", "Is the deck ready?")), 200, "a repeat delivery");
  await A.page.goto("/portal/whatsapp");
  const chat = await A.page.locator('li[data-chat="Meera"]').innerText();
  assert.ok(/Is the deck ready\?/.test(chat) && /\b1\b/.test(chat), `one unread, not two: ${chat}`);
  await A.page.goto("/portal/notifications");
  assert.ok(/WhatsApp from Meera/.test(await A.page.locator("main").innerText()));
});

await step("whatsapp: replies inside 24 hours; after that only templates; assignment routes notifications", async () => {
  await A.page.goto("/portal/whatsapp");
  await A.page.locator('li[data-chat="Meera"] a').click();
  await A.page.waitForSelector("[data-thread]");
  await A.page.fill('textarea[name="text"]', "Yes, sending it today.");
  await A.page.click('button:has-text("Send")');
  await A.page.waitForSelector("text=Sent.");
  assert.ok(/✓/.test(await A.page.locator('li[data-message="Yes, sending it today."]').innerText()));

  assert.equal(await waPost(waText("919800000002", "Old Lead", "wamid.OLD", "Hello from last week", 3 * 86400)), 200);
  await A.page.goto("/portal/whatsapp?c=919800000002");
  assert.equal(await A.page.locator('textarea[name="text"]').count(), 0, "no free text after 24 hours");
  await A.page.selectOption('select[name="template"]', "follow_up|en");
  await A.page.fill('input[name="p1"]', "Old Lead");
  await A.page.fill('input[name="p2"]', "our proposal");
  await A.page.click('button:has-text("Send template")');
  await A.page.waitForSelector("text=Sent.");
  assert.ok(/\[template follow_up\] Old Lead · our proposal/.test(await A.page.locator("[data-thread]").innerText()));

  await A.page.goto("/portal/whatsapp?c=919800000001");
  await A.page.selectOption('select[name="userId"]', { label: MANAGER });
  await A.page.click('button:has-text("Assign")');
  await A.page.waitForSelector("text=Conversation assigned");
  assert.equal(await waPost(waText("919800000001", "Meera", "wamid.IN2", "Thanks!")), 200);
  await E.page.goto("/portal/notifications");
  assert.ok(/WhatsApp from Meera/.test(await E.page.locator("main").innerText()), "the assignee hears about it");

  await A.page.goto("/portal/whatsapp?start=1");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="waId"]', "+91 98111 22233");
  await A.page.fill('input[name="name"]', "New Founder");
  await A.page.selectOption('select[name="template"]', "hello_world|en_US");
  await A.page.click('button:has-text("Send template")');
  await A.page.waitForSelector("text=Sent.");
  assert.match(A.page.url(), /c=919811122233/);
  for (const page of [F.page, B.page, G.page]) {
    await page.goto("/portal/whatsapp");
    assert.match(page.url(), /\/portal\/dashboard$/);
  }
});

// ---------------------------------------------------------------- Calendar and Razorpay
await step("calendar: a meeting is created in India time, invites attendees, and links to a deal", async () => {
  await A.page.goto("/portal/calendar");
  await A.page.waitForLoadState("networkidle");
  const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await A.page.fill('input[name="title"]', "Bad times");
  await A.page.fill('input[name="start"]', `${day}T16:00`);
  await A.page.fill('input[name="end"]', `${day}T15:00`);
  await A.page.click('button:has-text("Create and invite")');
  await A.page.waitForSelector("text=a start before the end");
  await A.page.waitForLoadState("networkidle");
  await A.page.fill('input[name="title"]', "IC review");
  await A.page.fill('input[name="start"]', `${day}T15:00`);
  await A.page.fill('input[name="end"]', `${day}T16:00`);
  await A.page.fill('input[name="attendees"]', "asha@acme.example");
  await A.page.selectOption('select[name="link"]', { label: "Deal: Alpha" });
  await A.page.click('button:has-text("Create and invite")');
  await A.page.waitForSelector("text=Meeting created");
  const ev = (await A.page.locator('li[data-event="IC review"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/03:00 pm to 04:00 pm/i.test(ev) && /Deal: Alpha/.test(ev) && /Join/.test(ev), ev);
  await F.page.goto("/portal/calendar");
  const f = await F.page.locator("main").innerText();
  assert.ok(/Connect a Google or Microsoft mailbox/.test(f) && !/IC review/.test(f), "calendars are personal");
});

await step("razorpay: a payment link settles the invoice through the gateway account and books the fee; forged or repeated events change nothing", async () => {
  const RZP = "rzp-webhook-secret";
  await A.page.goto("/portal/integrations?view=services&p=razorpay");
  await A.page.waitForLoadState("networkidle");
  const rp = A.page.locator('details[data-provider="razorpay"]');
  await rp.locator('input[name="keyId"]').fill("rzp_test_ABCDEF123456");
  await rp.locator('input[name="keySecret"]').fill("key-secret");
  await rp.locator('input[name="webhookSecret"]').fill(RZP);
  await rp.locator('button:has-text("Save and test")').click();
  await A.page.waitForURL(/notice=/);

  await A.page.goto("/portal/invoices?view=new");
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="partyId"]', { label: "To Acme Supplies (29AAGCB7383J1Z4)" });
  await A.page.selectOption('select[name="placeOfSupply"]', "27");
  await A.page.fill('input[name="desc0"]', "Retainer, online");
  await A.page.fill('input[name="rate0"]', "10,000");
  await A.page.click('button:has-text("Save draft")');
  await A.page.waitForSelector("text=Draft saved");
  await A.page.click('button:has-text("Issue invoice")');
  await A.page.waitForSelector("text=Invoice issued");
  await A.page.click('button:has-text("Create payment link")');
  await A.page.waitForSelector("text=Payment link ready");
  const url = (await A.page.locator("[data-paylink]").first().innerText()).trim();
  const linkId = url.split("/").pop();
  const invoiceUrl = A.page.url();

  const event = (id) => JSON.stringify({ entity: "event", event: "payment_link.paid", payload: {
    payment_link: { entity: { id: linkId, amount: 1180000, amount_paid: 1180000, status: "paid" } },
    payment: { entity: { id: "pay_TEST123", amount: 1180000, fee: 2832, tax: 432, method: "upi", status: "captured" } },
  }, created_at: Math.floor(Date.now() / 1000), id });
  const hook = async (body, secret, eventId) => {
    const c = await browser.newContext({ baseURL: BASE });
    const headers = { "Content-Type": "application/json", "x-razorpay-event-id": eventId };
    if (secret) headers["X-Razorpay-Signature"] = createHmac("sha256", secret).update(body).digest("hex");
    const r = await c.request.post("/api/webhooks/razorpay", { data: body, headers });
    await c.close();
    return r.status();
  };
  assert.equal(await hook(event("evt_1"), null, "evt_1"), 401, "unsigned");
  assert.equal(await hook(event("evt_1"), "wrong", "evt_1"), 401, "forged");
  assert.equal(await hook(event("evt_1"), RZP, "evt_1"), 200);
  assert.equal(await hook(event("evt_1"), RZP, "evt_1"), 200, "a repeat");
  await A.page.goto(invoiceUrl);
  assert.ok(/paid/i.test(await A.page.locator("[data-invoice-doc]").innerText()));
  await A.page.goto("/portal/books?view=overview");
  const tb = (await A.page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Payment gateway \(Razorpay\)\s*₹11,771\.68/.test(tb), tb.slice(0, 1200));
  await A.page.goto("/portal/notifications");
  assert.ok(/Paid online/.test(await A.page.locator("main").innerText()));
});

// ---------------------------------------------------------------- Design: themes, personalisation, palette
await step("design: theme, accent, density and pins are personal and stick", async () => {
  await A.page.goto("/portal/account");
  await A.page.waitForLoadState("networkidle");
  const portal = A.page.locator(".portal");
  assert.equal(await portal.getAttribute("data-theme"), "system");
  await A.page.locator('[data-appearance] label:has-text("Dark")').click();
  await A.page.locator('[data-appearance] label:has-text("Navy")').click();
  await A.page.locator('[data-appearance] label:has-text("Compact")').click();
  await A.page.click('button:has-text("Save appearance")');
  await A.page.waitForFunction(() => document.querySelector(".portal")?.getAttribute("data-accent") === "navy");
  await A.page.goto("/portal/dashboard");
  assert.deepEqual(
    [await portal.getAttribute("data-theme"), await portal.getAttribute("data-accent"), await portal.getAttribute("data-density")],
    ["dark", "navy", "compact"],
  );
  const bg = await A.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, "rgb(10, 15, 26)", "the dark palette is applied");
  await A.page.click("[data-theme-toggle]");
  await A.page.waitForFunction(() => document.querySelector(".portal")?.getAttribute("data-theme") === "system");
  await A.page.waitForTimeout(500);
  await A.page.goto("/portal/dashboard");
  assert.equal(await portal.getAttribute("data-theme"), "system", "the toggle is saved");
  assert.equal(await E.page.locator(".portal").getAttribute("data-accent") ?? "green", "green", "someone else's choice is untouched");

  await A.page.locator('#portal-nav button[aria-label="Pin Invoices"]').click();
  await A.page.waitForSelector('#portal-nav button[aria-label="Unpin Invoices"]');
  assert.ok(/pinned/i.test(await A.page.locator("#portal-nav").innerText()));
  await A.page.locator('#portal-nav button[aria-label="Unpin Invoices"]').first().click();
  await A.page.waitForFunction(() => !/Pinned/.test(document.querySelector("#portal-nav")?.textContent ?? ""));
});

await step("design: Ctrl+K jumps to pages and finds records, never ones the person cannot open", async () => {
  await A.page.goto("/portal/dashboard");
  await A.page.waitForLoadState("networkidle");
  await A.page.keyboard.press("Control+k");
  await A.page.waitForSelector("[data-palette]");
  await A.page.keyboard.type("Acme");
  await A.page.waitForSelector('[data-palette-item*="Acme Supplies"]');
  await A.page.keyboard.press("Escape");
  await A.page.click("header [data-search]");
  await A.page.keyboard.type("bank rec");
  await A.page.keyboard.press("Enter");
  await A.page.waitForURL(/\/portal\/bank/);
  const lp = await (await B.page.request.get("/portal/../api/portal/search?q=Acme")).json();
  assert.equal(lp.results.length, 0, "an LP finds no firm invoices or contacts");
  const anon = await browser.newContext({ baseURL: BASE });
  assert.equal((await anon.request.get("/api/portal/search?q=Acme")).status(), 401);
  await anon.close();
});

await step("intelligence: spending, budget and runway insights in plain words, by scope; not for an LP", async () => {
  const monthAgo = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 8) + "15"; };
  for (const [n, amount] of [[4, "20,000"], [3, "20,000"], [2, "20,000"], [1, "80,000"]]) {
    await A.page.goto("/portal/books?view=journal");
    await A.page.waitForLoadState("networkidle");
    await A.page.fill('input[name="date"]', monthAgo(n));
    await postRows(A.page, `Event costs ${n}`, [["5900 Other expenses", amount, ""], ["1010 Bank", "", amount]]);
    await A.page.waitForSelector("text=Entry posted.");
  }
  const fy = new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  await A.page.goto(`/portal/budgets?fy=${fy}`);
  await A.page.waitForLoadState("networkidle");
  await A.page.selectOption('select[name="accountId"]', { label: "4010 Management fees" });
  await A.page.fill('input[name="annual"]', "1,20,00,000");
  await A.page.click('button:has-text("Save")');
  await A.page.waitForSelector("text=Budget saved");
  await A.page.goto("/portal/intelligence");
  const spend = await txt(A.page, '[data-insight="spend:Boring PE:5900"]');
  assert.ok(/Other expenses at Boring PE jumped/.test(spend) && /against a usual ₹12,000 a month/.test(spend), spend);
  assert.equal(await A.page.locator('[data-insight="spend:Boring PE:5900"]').getAttribute("data-severity"), "warning");
  const budget = await txt(A.page, '[data-insight="budget-income:Boring PE"]');
  assert.ok(/income is [\d.]+% behind budget/.test(budget), budget);
  assert.ok(await A.page.locator('[data-insight="cash:Group"]').count(), "a group runway line");
  assert.ok(/months|Not burning/.test(await txt(A.page, '[data-kpi="runway"]')));

  await A.page.click('[data-scope="Alpha SPV"]');
  await A.page.waitForURL(/scope=e%3AAlpha/);
  assert.equal(await A.page.locator('[data-insight="spend:Boring PE:5900"]').count(), 0, "another entity's insight is filtered out");
  await A.page.goto("/portal/intelligence?area=spending");
  assert.equal(await A.page.locator('[data-insight^="budget"]').count(), 0, "area filter");

  await E.page.goto("/portal/dashboard");
  assert.ok(/What needs attention/.test(await txt(E.page, "[data-attention]")), "an Admin sees the strip on the dashboard");
  await B.page.goto("/portal/intelligence");
  assert.match(B.page.url(), /\/portal\/dashboard$/, "an LP cannot open firm insights");
  assert.equal(await B.page.locator("[data-attention]").count(), 0);
});

await step("KYC: identifiers checked, documents shared from DigiLocker by the person, then verified; entities need their owners", async () => {
  await A.page.goto("/portal/kyc?view=new");
  await A.page.fill('input[name="name"]', "Asha Patil");
  await A.page.fill('input[name="email"]', "asha@example.test");
  await A.page.click('button:has-text("Open case")');
  await A.page.waitForSelector("text=Case opened");
  const caseUrl = A.page.url();
  const check = async (kind, value) => {
    await A.page.selectOption('select[name="kind"]', kind);
    await A.page.fill('input[name="value"]', value);
    const before = await A.page.locator(`[data-check^="${kind}:"]`).count();
    await A.page.click('form:has(select[name="kind"]) button:has-text("Check")');
    await A.page.waitForFunction(([k, n]) => document.querySelectorAll(`[data-check^="${k}:"]`).length > n, [kind, before]);
  };
  await check("pan", "ABCPE1234F");
  assert.equal(await A.page.locator('[data-check="pan:review"]').count(), 1, await flat(A.page));
  await check("aadhaar", "123456789012");
  assert.equal(await A.page.locator('[data-check="aadhaar:fail"]').count(), 1, await flat(A.page));
  assert.ok(await A.page.locator('[data-decision] button[value="verify"]').isDisabled(), "cannot verify yet");

  // The person opens the link without any portal seat and shares from DigiLocker.
  await A.page.click('button:has-text("Email a link")');
  const link = (await txt(A.page, "[data-kyc-link]")).trim();
  const P = await ctx();
  await P.page.goto(link);
  assert.match(await flat(P.page), /Verify Asha Patil/);
  await P.page.check('input[name="consent"]');
  await P.page.click('button:has-text("Continue to DigiLocker")');
  await P.page.waitForURL(/verify\/finished\?r=ok/);
  await P.page.goto(link);
  assert.match(await flat(P.page), /no longer works/, "a link works once");
  await P.context.close();

  await A.page.goto(caseUrl.replace(/&notice=[^&]*/, ""));
  for (const k of ["digilocker:pass", "pan:pass", "aadhaar:pass"]) assert.ok(await A.page.locator(`[data-check="${k}"]`).count() >= 1, `${k}: ${await flat(A.page)}`);
  assert.ok(!/\b[2-9]\d{11}\b/.test(await flat(A.page)), "no full Aadhaar number anywhere");
  await A.page.click('[data-decision] button[value="verify"]');
  await A.page.waitForSelector("text=Verified. The re-KYC date");
  assert.match(await txt(A.page, "[data-case-status]"), /Verified/);

  // A company needs its beneficial owners verified too.
  await A.page.goto("/portal/kyc?view=new");
  await A.page.selectOption('select[name="subjectType"]', "entity");
  await A.page.fill('input[name="name"]', "Acme Foods Private Limited");
  await A.page.click('button:has-text("Open case")');
  await A.page.waitForSelector("text=Case opened");
  await check("pan", "AAACA1234C");
  await A.page.click('[data-review="pan"] button[value="pass"]');
  await A.page.waitForSelector("text=Review saved.");
  await check("cin", "U72900MH2020PTC123456");
  await A.page.click('[data-review="cin"] button[value="pass"]');
  await A.page.waitForSelector("text=Review saved.");
  await A.page.fill('[data-owners] input[name="name"]', "Ravi Kumar");
  await A.page.fill('[data-owners] input[name="share"]', "60");
  await A.page.click('[data-owners] button:has-text("Add owner")');
  await A.page.waitForSelector("text=Beneficial owner added");
  assert.match(await txt(A.page, '[data-required="owners"]'), /Not yet/);
  assert.ok(await A.page.locator('[data-decision] button[value="verify"]').isDisabled(), "owners first");

  await B.page.goto("/portal/kyc");
  assert.doesNotMatch(B.page.url(), /\/portal\/kyc/, "an LP cannot open KYC");
});

await step("assistant: she acts within each person's limits, asks before money, and never shows firm data to an LP", async () => {
  const say = async (page, text) => {
    await page.fill('textarea[name="text"]', text);
    await page.click('button[aria-label="Send"]');
    await page.waitForURL(/\/portal\/assistant\?t=/);
    await page.waitForLoadState("networkidle");
  };
  await A.page.goto("/portal/assistant");
  assert.equal((await txt(A.page, "[data-assistant-name]")).trim(), "Assistant");
  await say(A.page, "Add a task: Call Acme about renewal");
  assert.match(await txt(A.page, "[data-messages]"), /Done\. Task added: Call Acme about renewal/);
  assert.equal(await A.page.locator('[data-action="done"]').count(), 1, "tasks happen on her own for the owner");
  await A.page.goto("/portal/tasks");
  assert.ok(/Call Acme about renewal/.test(await flat(A.page)));

  await A.page.goto("/portal/assistant");
  await say(A.page, "pay 1,500 for courier charges");
  assert.equal(await A.page.locator('[data-action="proposed"]').count(), 1, "money waits for a yes");
  await A.page.click('[data-action="proposed"] button:has-text("Approve")');
  await A.page.waitForSelector("text=Approved and done.");
  assert.match(await txt(A.page, "[data-messages]"), /Done: Recorded ₹1,500\.00/);

  // An Admin: no personal notes at all, and she can be told to ask first for tasks.
  await E.page.goto("/portal/assistant?view=settings");
  assert.match(await txt(E.page, '[data-mode="notes"]'), /Not allowed/);
  await E.page.selectOption('select[name="mode_tasks"]', "ask");
  await E.page.click('[data-my-policy] button:has-text("Save")');
  await E.page.waitForSelector("text=Saved.");
  assert.match(await txt(E.page, '[data-mode="tasks"]'), /Ask first/);
  await E.page.goto("/portal/assistant");
  await say(E.page, "note: the Super Admin's secret");
  assert.match(await txt(E.page, "[data-messages]"), /not available/);
  await say(E.page, "Add a task: Prepare the board deck");
  await E.page.click('[data-action="proposed"] button:has-text("Decline")');
  await E.page.waitForSelector("text=Declined. Nothing was done.");
  await E.page.goto("/portal/tasks");
  assert.ok(!/Prepare the board deck/.test(await flat(E.page)), "a declined action never happens");
  await A.page.goto("/portal/personal");
  assert.ok(!/secret/.test(await flat(A.page)));

  // An LP can talk to her, but she has no firm figures to give them.
  await B.page.goto("/portal/assistant");
  await say(B.page, "How are we doing on cash?");
  assert.ok(!/Cash now/.test(await txt(B.page, "[data-messages]")), "no firm figures for an LP");

  // The owner names her; the header follows.
  await A.page.goto("/portal/assistant?view=settings");
  await A.page.fill('[data-assistant-settings] input[name="name"]', "Maya");
  await A.page.click('[data-assistant-settings] button:has-text("Save")');
  await A.page.waitForSelector("text=Saved.");
  assert.match(await txt(A.page, "[data-ask]"), /Ask Maya/);
  await A.page.fill('[data-assistant-settings] input[name="name"]', "Assistant");
  await A.page.click('[data-assistant-settings] button:has-text("Save")');
  await A.page.waitForSelector("text=Saved.");
});

await step("workspaces: Personal, Boring PE and Impact Marrow each show their own; Personal is the owner's alone", async () => {
  const switchTo = async (page, view) => {
    await page.goto("/portal/dashboard");
    await page.click("[data-workspace-switcher] summary");
    await page.click(`[data-workspace="${view}"]`);
    await page.waitForURL(/\/portal\/dashboard$/);
    await page.waitForLoadState("networkidle");
  };
  await switchTo(A.page, "personal");
  assert.equal((await txt(A.page, "[data-workspace-current]")).trim(), "Personal");
  const nav = await A.page.locator('nav[aria-label="Portal"]').innerText();
  assert.ok(/Personal desk/.test(nav) && /Books/.test(nav), nav);
  assert.ok(!/Deal Pipeline|Ventures\n/.test(nav), "no ventures or deals in Personal");
  await A.page.goto("/portal/books");
  const entities = await A.page.locator('nav[aria-label="Entities"]').innerText();
  assert.ok(/Rahul Mane \(Personal\)/.test(entities) && !/Boring PE|Impact Marrow/.test(entities), entities);
  const personalId = new URL(await A.page.locator('nav[aria-label="Entities"] a').first().getAttribute("href"), "http://x").searchParams.get("e");

  await switchTo(A.page, "impact_marrow");
  await A.page.goto("/portal/books");
  const marrow = await A.page.locator('nav[aria-label="Entities"]').innerText();
  assert.ok(/Impact Marrow Fund/.test(marrow) && !/Boring PE|Alpha SPV|Personal/.test(marrow), marrow);

  // The Admin runs Boring PE and Impact Marrow, never Personal: not offered, not reachable by link or form.
  await E.page.goto("/portal/dashboard");
  await E.page.click("[data-workspace-switcher] summary");
  const offered = await E.page.locator("[data-workspace]").evaluateAll((els) => els.map((e) => e.getAttribute("data-workspace")));
  assert.deepEqual(offered, ["boring_pe", "impact_marrow", "all"]);
  await E.page.goto(`/portal/workspace/personal`);
  assert.notEqual((await txt(E.page, "[data-workspace-current]")).trim(), "Personal");
  await E.page.goto(`/portal/books?e=${personalId}&view=journal`);
  assert.ok(!/Rahul Mane \(Personal\)/.test(await flat(E.page)), "personal books never show to an Admin");
  await E.page.evaluate((id) => { for (const i of document.querySelectorAll('input[name="entityId"]')) i.value = id; }, personalId);
  await postRows(E.page, "Sneaky", [["5900 Other expenses", "1", ""], ["1010 Bank", "", "1"]]);
  await E.page.waitForLoadState("networkidle");
  assert.ok(!/Entry posted\./.test(await flat(E.page)), "a replayed form cannot post into Personal");
  await E.page.goto("/portal/access");
  assert.match(await txt(E.page, `[data-workspaces="${MANAGER}"]`), /Boring PE, Impact Marrow/);

  // Back to all workspaces together.
  await A.page.goto("/portal/workspace/all");
  await A.page.waitForURL(/\/portal\/dashboard$/);
  assert.ok(await A.page.locator("[data-workspace-cash]").count() === 3, "the combined dashboard shows each workspace's cash");
});

// RFC 6238 code for a base32 secret, as an authenticator app would show it.
function totp(secretB32, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const bytes = [];
  for (const ch of secretB32) { value = (value << 5) | alphabet.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", Buffer.from(bytes)).update(msg).digest(); const o = h[19] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

await step("two-step sign-in: set up with an authenticator, asked at sign-in, recovery codes, trusted browser, required by role", async () => {
  await A.page.goto("/portal/account");
  await A.page.click('button:has-text("Set up two-step sign-in")');
  const secret = (await txt(A.page, "[data-totp-secret]")).trim();
  await A.page.fill('#two-step input[name="code"]', "000000");
  await A.page.click('#two-step button:has-text("Turn on")');
  await A.page.waitForSelector("text=That code did not match");
  await A.page.fill('#two-step input[name="code"]', totp(secret));
  await A.page.click('#two-step button:has-text("Turn on")');
  await A.page.waitForSelector("[data-recovery-codes]");
  const codes = (await A.page.locator("[data-recovery-codes] span").allInnerTexts()).map((c) => c.trim());
  assert.equal(codes.length, 10);

  // A fresh browser: password alone is not enough.
  const S = await ctx();
  await login(S.page, ADMIN, ADMIN_NEW);
  await S.page.waitForURL(/\/portal\/two-factor/);
  await S.page.goto("/portal/dashboard");
  assert.match(S.page.url(), /two-factor/, "no page opens before the code");
  const api = await S.page.request.get("/api/portal/search?q=acme");
  assert.equal(api.status(), 401, "nor does the API");
  await S.page.fill('input[name="code"]', "123456");
  await S.page.click('button:has-text("Continue")');
  await S.page.waitForSelector("text=That code did not work");
  await S.page.fill('input[name="code"]', codes[0].toLowerCase());
  await S.page.check('input[name="trust"]');
  await S.page.click('button:has-text("Continue")');
  await S.page.waitForURL(/\/portal\/(console|dashboard)/);
  // Signing in again from the trusted browser skips the code; a used recovery code is spent.
  await S.page.click('button:has-text("Sign out")');
  await S.page.waitForURL(/\/portal\/login/);
  await login(S.page, ADMIN, ADMIN_NEW);
  await S.page.waitForURL(/\/portal\/(console|dashboard)/);
  await S.context.close();
  const T = await ctx();
  await login(T.page, ADMIN, ADMIN_NEW);
  await T.page.waitForURL(/\/portal\/two-factor/);
  await T.page.fill('input[name="code"]', codes[0]);
  await T.page.click('button:has-text("Continue")');
  await T.page.waitForSelector("text=That code did not work");
  await T.context.close();

  // The Super Admin requires it for Admins: the Admin is sent to set it up first.
  await A.page.goto("/portal/access");
  await A.page.check('[data-two-step-roles] input[value="admin"]');
  await A.page.click('[data-two-step-roles] button:has-text("Save")');
  await A.page.waitForSelector("text=Two-step sign-in requirement saved");
  await E.page.goto("/portal/books");
  assert.match(E.page.url(), /\/portal\/account\?enroll=1/);
  assert.match(await flat(E.page), /Your role requires two-step sign-in/);
  await A.page.goto("/portal/access");
  await A.page.uncheck('[data-two-step-roles] input[value="admin"]');
  await A.page.click('[data-two-step-roles] button:has-text("Save")');
  await A.page.waitForSelector("text=Two-step sign-in requirement saved");
  await E.page.goto("/portal/books");
  assert.match(E.page.url(), /\/portal\/books/);
});

await step("password vault: sealed logins, shared by role, every look logged; private ones stay private", async () => {
  const add = async (title, secret, shareWithAdmin) => {
    await A.page.goto("/portal/secrets");
    const form = 'form:has(input[name="title"])';
    await A.page.fill(`${form} input[name="title"]`, title);
    await A.page.fill(`${form} input[name="username"]`, "boringpe");
    await A.page.fill(`${form} input[name="secret"]`, secret);
    if (shareWithAdmin) {
      await A.page.check('input[name="share"][value="roles"]');
      await A.page.check('input[name="roles"][value="admin"]');
    }
    await A.page.click('form:has(input[name="title"]) button:has-text("Save")');
    await A.page.waitForSelector("text=Saved and sealed.");
  };
  await add("HDFC NetBanking", "s3cret-bank-pass", true);
  await add("Rahul personal email", "my-own-pass", false);
  assert.ok(!/s3cret-bank-pass/.test(await A.page.content()), "never in the page until asked for");
  await E.page.goto("/portal/secrets");
  const list = await flat(E.page);
  assert.ok(/HDFC NetBanking/.test(list) && !/Rahul personal email/.test(list), list);
  await E.page.click('[data-secret="HDFC NetBanking"] [data-reveal]');
  assert.equal((await txt(E.page, "[data-secret-value]")).trim(), "s3cret-bank-pass");
  await E.page.goto("/portal/secrets");
  assert.match(await txt(E.page, '[data-secret="HDFC NetBanking"]'), /last opened/);
  await B.page.goto("/portal/secrets");
  assert.doesNotMatch(B.page.url(), /\/portal\/secrets/, "an LP cannot open the vault");
});

await step("encrypted backup: a strong passphrase is required and the file is sealed", async () => {
  await A.page.goto("/portal/console");
  await A.page.fill('[data-backup] input[name="passphrase"]', "short");
  await A.page.evaluate(() => document.querySelector('[data-backup] input[name="passphrase"]').removeAttribute("minlength"));
  await A.page.click('[data-backup] button:has-text("Download backup")');
  await A.page.waitForSelector("text=Use at least 12 characters");
  await A.page.fill('[data-backup] input[name="passphrase"]', "monsoon ledger 2026");
  await A.page.check('[data-backup] input[name="files"]');
  const [download] = await Promise.all([A.page.waitForEvent("download"), A.page.click('[data-backup] button:has-text("Download backup")')]);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(path);
  assert.equal(buf.subarray(0, 6).toString(), "BPBAK1");
  assert.ok(!buf.includes(Buffer.from(ADMIN)), "nothing readable inside");
  await writeFile(process.env.E2E_BACKUP_OUT ?? "/tmp/e2e-backup.bpbak", buf);
});

await step("everyday use: getting started, + New, breadcrumbs, shortcuts, guides and activity", async () => {
  await A.page.goto("/portal/dashboard");
  if (await A.page.locator("[data-getting-started]").count()) {
    assert.match(await txt(A.page, "[data-getting-started] [data-guide-progress]"), /\d of \d/);
  }
  await A.page.click("[data-new-menu] summary");
  const offered = await A.page.locator("[data-new-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-new-item")));
  assert.ok(offered.includes("Invoice") && offered.includes("KYC case") && offered.includes("Invite someone"), offered.join(", "));
  await A.page.click('[data-new-item="Invoice"]');
  await A.page.waitForURL(/\/portal\/invoices\?view=new/);
  assert.match(await txt(A.page, "[data-crumbs]"), /Infrastructure.*Invoices/s);

  await B.page.goto("/portal/dashboard");
  if (await B.page.locator("[data-new-menu]").count()) {
    await B.page.click("[data-new-menu] summary");
    const lp = await B.page.locator("[data-new-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-new-item")));
    assert.ok(!lp.includes("Invoice") && !lp.includes("Invite someone"), lp.join(", "));
  }

  await A.page.goto("/portal/dashboard");
  await A.page.waitForLoadState("networkidle");
  await A.page.keyboard.press("?");
  await A.page.waitForSelector("[data-shortcuts]");
  await A.page.keyboard.press("Escape");
  assert.equal(await A.page.locator("[data-shortcuts]").count(), 0);
  await A.page.keyboard.press("g");
  await A.page.keyboard.press("b");
  await A.page.waitForURL(/\/portal\/books/);

  await A.page.goto("/portal/guides");
  assert.match(await txt(A.page, '[data-guide="bill"] [data-guide-progress]'), /\d of 6|Done/);
  assert.equal(await A.page.locator('[data-guide="setup"]').count(), 1, "the owner sees setup");
  await E.page.goto("/portal/guides");
  assert.equal(await E.page.locator('[data-guide="setup"]').count(), 0, "setup is the owner's");
  await B.page.goto("/portal/guides");
  assert.doesNotMatch(B.page.url(), /\/portal\/guides/);

  await A.page.goto("/portal/activity?area=files");
  const files = await txt(A.page, "[data-activity]");
  assert.ok(/Document added/.test(files) && !/Journal posted/.test(files), files.slice(0, 300));
  await E.page.goto("/portal/activity");
  assert.match(await txt(E.page, "[data-activity]"), /Backup downloaded/);
  await B.page.goto("/portal/activity");
  assert.doesNotMatch(B.page.url(), /\/portal\/activity/);
});

await step("net worth: every level from all three together down to each unit, counted once", async () => {
  await A.page.goto("/portal/networth?n=all");
  assert.equal(await A.page.getAttribute("[data-networth]", "data-networth"), "all");
  for (const name of ["All of it together", "Rahul Mane", "Boring PE", "Impact Marrow", "Rahul Mane (Personal)", "Alpha SPV"]) {
    assert.ok(await A.page.locator(`tr[data-level-label="${name}"]`).count() >= 1, name);
  }
  for (const k of ["networth", "market", "assets", "net"]) assert.match(await txt(A.page, `[data-kpi="${k}"]`), /₹/, k);
  assert.ok(await A.page.locator("[data-trend] svg circle").count() === 12, "twelve months of net worth");
  assert.equal(await A.page.locator("[data-breakdown] [data-part]").count(), 3, "all three make up the whole");

  // Down a level, then to a single unit.
  await A.page.click('[data-breakdown] [data-part="Boring PE"] a');
  await A.page.waitForURL(/n=ws%3Aboring_pe/);
  assert.match(await txt(A.page, "[data-level-name]"), /^Boring PE$/);
  await A.page.click('tr[data-level-label="Alpha SPV"] a');
  await A.page.waitForURL((u) => /[?&]n=/.test(u.href) && !/ws%3A/.test(u.href));
  assert.match(await txt(A.page, "[data-level-name]"), /Alpha SPV/);
  assert.match(await txt(A.page, 'nav[aria-label="Level"]'), /All of it together.*Boring PE.*Alpha SPV/);

  const csv = await A.page.request.get("/portal/networth/export");
  assert.equal(csv.status(), 200);
  assert.match(await csv.text(), /All of it together[\s\S]*Rahul Mane[\s\S]*Impact Marrow/);

  // An Admin sees the firm and the fund, never Rahul's own.
  await E.page.goto("/portal/networth");
  assert.equal(await E.page.locator('tr[data-level-label="Rahul Mane (Personal)"]').count(), 0);
  assert.ok(await E.page.locator('tr[data-level-label="Boring PE"]').count() >= 1);
  await B.page.goto("/portal/networth");
  assert.doesNotMatch(B.page.url(), /\/portal\/networth/, "an LP cannot open net worth");
});

await step("verticals: Build, Co-Build, Own and Boring Studio each have a page; records carry their vertical", async () => {
  await A.page.goto("/portal/verticals/studio");
  assert.equal(await A.page.locator("[data-all-verticals] [data-row]").count(), 4);
  assert.match(await txt(A.page, '[data-kpi="fees"]'), /Boring Studio fees/i);
  assert.match(await txt(A.page, '[data-list="ventures"]'), /Alpha Co-Build/, "Boring Studio manages every venture");

  await A.page.goto("/portal/verticals/co-build");
  assert.match(await txt(A.page, '[data-list="ventures"]'), /Alpha Co-Build/);
  await A.page.goto("/portal/verticals/build");
  assert.doesNotMatch(await txt(A.page, '[data-list="ventures"]'), /Alpha Co-Build/, "a Co-Build venture is not under Build");

  // The Boring Studio fee invoice belongs to Boring Studio, since Boring PE issues it.
  await A.page.goto("/portal/invoices?vertical=enable");
  assert.ok(await A.page.locator("[data-invoice]").count() > 0, "Boring PE's own invoices are Boring Studio's");
  await A.page.goto("/portal/invoices?vertical=own");
  assert.match(await flat(A.page), /No invoices yet/);

  await A.page.goto("/portal/tasks");
  await A.page.fill('input[name="title"]', "Review the Q3 valuations");
  await A.page.selectOption('select[name="vertical"]', "own");
  await A.page.click('button:has-text("Add task")');
  await A.page.waitForLoadState("networkidle");
  await A.page.goto("/portal/tasks?vertical=own");
  assert.match(await flat(A.page), /Review the Q3 valuations/);
  await A.page.goto("/portal/verticals/own");
  assert.match(await txt(A.page, '[data-list="tasks"]'), /Review the Q3 valuations/);

  await B.page.goto("/portal/verticals/studio");
  assert.doesNotMatch(B.page.url(), /\/portal\/verticals/, "an LP cannot open the verticals");
});

await step("public site: every menu item is its own page with the shared menu and footer", async () => {
  const pages = [["/build", "Build"], ["/co-build", "Co-Build"], ["/own", "Own"], ["/studio", "Studio"], ["/impact-marrow", "Impact Marrow"], ["/media", "Media"], ["/about", "About Us"]];
  const p = B.page;
  await p.goto("/");
  for (const [href, label] of pages) {
    await p.click(`nav[aria-label="Site"] a[href="${href}"] >> visible=true`);
    await p.waitForURL((u) => u.pathname === href);
    assert.equal(await p.locator("h1").first().innerText(), label === "Studio" ? "Boring Studio" : label);
    assert.ok(await p.locator("[data-structure-map]").count(), "the map of Boring PE");
    assert.ok(await p.locator("section").first().locator("svg[data-illustration]").count(), "an illustration in the opening");
    assert.equal(await p.getAttribute(`nav[aria-label="Site"] a[aria-current="page"] >> visible=true`, "href"), href);
    assert.match(await p.title(), new RegExp(`^${label} · Boring PE`));
    assert.ok(await p.locator("footer").count(), "shared footer");
  }
  // On a laptop every page is in the bar; on a phone the menu opens, closes on Escape and after a choice.
  await p.setViewportSize({ width: 1100, height: 800 });
  await p.goto("/own");
  assert.ok(await p.locator('nav[aria-label="Site"] ul[data-bar] a[href="/about"]').isVisible(), "links in the bar at laptop width");
  await p.setViewportSize({ width: 390, height: 800 });
  const button = p.locator('nav[aria-label="Site"] button[aria-controls="site-menu"]');
  await button.click();
  assert.equal(await button.getAttribute("aria-expanded"), "true");
  await p.keyboard.press("Escape");
  assert.equal(await button.getAttribute("aria-expanded"), "false");
  await button.click();
  await p.click('#site-menu a[href="/media"]');
  await p.waitForURL(/\/media$/);
  assert.ok(await p.locator("#site-menu").isHidden(), "closes after a choice");
  await p.setViewportSize({ width: 1280, height: 800 });

  // The home page's cards lead to the pages.
  await p.goto("/");
  await p.click('a[href="/co-build"]:has-text("Read more")');
  await p.waitForURL(/\/co-build$/);
  const map = await (await p.request.get("/sitemap.xml")).text();
  for (const [href] of pages) assert.ok(map.includes(`https://boringpe.com${href}</loc>`), href);
});

await step("llms.txt describes Boring PE from the site's own wording", async () => {
  const r = await A.page.request.get("/llms.txt");
  assert.equal(r.status(), 200);
  assert.match(r.headers()["content-type"] ?? "", /text\/plain/);
  const t = await r.text();
  assert.match(t, /^# Boring PE\n\n> /);
  assert.match(t, /\[Co-Build\]\(https:\/\/boringpe\.com\/co-build\)/);
  const gpt = await A.page.request.get("/llms.txt", { headers: { "User-Agent": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)" } });
  assert.equal(gpt.status(), 200, "assistants' search fetchers can read it");
});

await step("security: headers, crawler blocking, rate limits, watermark, exports logged, Security page", async () => {
  // Strict headers on the public site and the portal.
  const home = await A.page.request.get("/");
  const h = home.headers();
  assert.match(h["content-security-policy"] ?? "", /frame-ancestors 'none'/);
  assert.match(h["strict-transport-security"] ?? "", /max-age=63072000/);
  assert.equal(h["x-frame-options"], "DENY");
  assert.ok(h["permissions-policy"]?.includes("camera=()"));
  assert.equal(h["x-powered-by"], undefined, "no framework fingerprint");
  const portal = (await A.page.request.get("/portal/dashboard")).headers();
  assert.match(portal["x-robots-tag"] ?? "", /noindex/);
  assert.equal(portal["cache-control"], "no-store");
  assert.equal(portal["referrer-policy"], "no-referrer");

  // Training crawlers and copiers are refused; search engines are not.
  const bot = await A.page.request.get("/", { headers: { "User-Agent": "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" } });
  assert.equal(bot.status(), 403);
  const google = await A.page.request.get("/", { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
  assert.equal(google.status(), 200);
  const robots = await (await A.page.request.get("/robots.txt")).text();
  assert.match(robots, /User-Agent: GPTBot[\s\S]*Disallow: \//i);
  assert.match(await (await A.page.request.get("/.well-known/security.txt")).text(), /^Contact: mailto:/m);
  assert.match(await (await A.page.request.get("/")).text(), /name="robots" content="noai, noimageai"/);

  // Every portal page carries the viewer's email as a watermark.
  await A.page.goto("/portal/dashboard");
  assert.match((await A.page.getAttribute("[data-watermark]", "data-watermark")) ?? "", /admin@example\.test/);

  // Exports are stamped and logged.
  const csv = await (await A.page.request.get("/portal/networth/export")).text();
  assert.match(csv, /Confidential: exported by admin@example\.test/);

  // Guessing API keys is stopped.
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await A.page.request.get("/api/v1/me", { headers: { Authorization: "Bearer bp_wrong_" + i } })).status();
  assert.equal(last, 429);

  // The Security page: settings, blocked requests, data taken out, events.
  await A.page.goto("/portal/security");
  assert.ok(await A.page.locator("[data-security]").count());
  assert.match(await txt(A.page, '[data-list="blocked"]'), /API calls without a valid key/);
  assert.match(await txt(A.page, '[data-list="exports"]'), /admin@example\.test/);
  assert.match(await txt(A.page, '[data-list="events"]'), /Blocked for too many requests/);
  assert.match(await txt(A.page, '[data-list="events"]'), /Exported/);
  for (const p of [E.page, B.page]) {
    await p.goto("/portal/security");
    assert.doesNotMatch(p.url(), /\/portal\/security/, "only the Super Admin");
  }

  // The emergency brake signs out everyone but the Super Admin.
  await A.page.check('input[name="confirm"]');
  await A.page.click('button:has-text("Sign everyone else out")');
  await A.page.waitForURL(/n=out/);
  await E.page.goto("/portal/dashboard");
  assert.match(E.page.url(), /\/portal\/login/);
  await A.page.goto("/portal/dashboard");
  assert.match(A.page.url(), /\/portal\/dashboard/);
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
