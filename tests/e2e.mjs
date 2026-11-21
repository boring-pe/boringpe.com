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
  await A.page.waitForSelector('td:has-text("Rahul Mane (personal)")');
  const text = await flat(A.page);
  assert.ok(/Contributed in total\s*₹60,000\.00/i.test(text), text);
  assert.ok(/Impact Marrow Fund · cash\s*₹60,000\.00/i.test(text), text);
  assert.ok(/Rahul Mane \(personal\)/.test(text));
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
  assert.ok(/Business House fee ₹0\.00/i.test(text) && /Net to venture ₹56,000\.00/i.test(text), text);
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
  assert.ok(/Business House fee ₹5,000\.00/i.test(text) && /Net to venture ₹52,000\.00/i.test(text), text);
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
  await up("Alpha SHA", "alpha-sha.pdf", "linked", "Document added");
  await up("Board notes", "board.pdf", "firm", "Document added");
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
  assert.ok(/No documents/.test(await G.page.locator("main").innerText()));

  await E.page.goto("/portal/vault");
  assert.equal(await E.page.locator('button:has-text("Delete")').count(), 0);
  await A.page.locator('tr[data-doc="Board notes"] button:has-text("Delete")').click();
  await A.page.waitForSelector("text=Document deleted");
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

await step("invoicing: the Business House fee is a real invoice; settling it moves money in both entities' books", async () => {
  await A.page.goto("/portal/invoices?view=receivables");
  const row = (await A.page.locator('tr[data-receivable="Alpha SPV"]').innerText()).replace(/\s+/g, " ");
  assert.ok(/₹5,000\.00/.test(row), row);
  await A.page.goto("/portal/invoices");
  await A.page.locator('tr[data-invoice="INV/2026-27/0001"] a').click();
  await A.page.waitForLoadState("networkidle");
  assert.ok(/Business House fee: Alpha Co-Build, 2026-10/.test(await A.page.locator("[data-invoice-doc]").innerText()));
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
