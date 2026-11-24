# Boring PE

Public site and the invite-only Boring Portal. Next.js 16, Auth.js, Postgres (Neon).

- `/` public site
- `/portal/*` the portal (also served at `portal.boringpe.com`), behind sign-in

## Access model

Nobody can sign up. People are invited under **Portal → Access**.

**Super Admin** is the owner (Rahul Mane) and sits above everything: the console, approvals,
site content for both sites, access for every seat, and a private personal desk nobody else can
open. All commercial activity runs through Boring PE; the personal desk is separate.
Below that: Admin (runs access for the lower roles only), Partner, Operator, Founder, Limited
Partner. An Admin cannot create, change or switch off another Admin or the Super Admin.

| Area | Who |
|---|---|
| Console, Site content, Personal desk | Super Admin only |
| Approvals: decide | Super Admin only |
| Approvals: ask | Admin, Partner, Operator |
| Access | Admin (lower roles) and Super Admin (all) |
| Dashboard, Portfolio, Deals, Vault, Marrow | per role, see `src/lib/rbac.ts` |

Every protected page and server action re-checks the user in the database (`src/lib/dal.ts`), so
role changes, switch-offs and "end sessions" apply on the very next request. `src/proxy.ts` only
routes and does a cheap cookie check; it is not the security boundary.

**Site content** (Super Admin → Site content) edits the wording of two public pages, stored in the
database over defaults kept in `src/lib/content-fields.ts`: `boringpe.com` (`/`) and
`rahulmane.com` (served at `/sites/rahulmane`, and at `/` when the host is `rahulmane.com`).
Text only, so nothing entered there can inject markup.

Sign-in methods (each shows on the login page only when its keys are set):

| Method | Needs |
|---|---|
| Email + password | nothing; admin gives a temporary password at invite time, replaced at first sign-in |
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Redirect URI: `https://portal.boringpe.com/api/auth/callback/google` |
| LinkedIn | `AUTH_LINKEDIN_ID`, `AUTH_LINKEDIN_SECRET`; enable "Sign In with LinkedIn using OpenID Connect". Redirect URI: `https://portal.boringpe.com/api/auth/callback/linkedin` |
| Email link | `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` (Resend) |

Google, LinkedIn and email links only work for an email that is already invited (or listed in
`SUPER_ADMIN_EMAILS`), and OAuth requires the provider to report the email as verified. Passwords are
scrypt-hashed; 5 wrong attempts lock a seat for 15 minutes.

## Set up

1. Create a Neon project and copy the pooled connection string.
2. In Vercel set the variables in `.env.example` (at least `AUTH_SECRET`, `AUTH_URL`,
   `DATABASE_URL`, `SUPER_ADMIN_EMAILS`, and `ADMIN_BOOTSTRAP_PASSWORD` for the first sign-in).
3. Deploy. `npm run build` applies pending files in `migrations/` first.
4. Sign in as the first `SUPER_ADMIN_EMAILS` address with the bootstrap password, choose a new one,
   then **remove `ADMIN_BOOTSTRAP_PASSWORD`**. Invite everyone else from the Access screen.

Locally, leave `DATABASE_URL` empty: an embedded Postgres is created in `.data/` and migrated
automatically.

```bash
cp .env.example .env.local   # set AUTH_SECRET, SUPER_ADMIN_EMAILS, ADMIN_BOOTSTRAP_PASSWORD
npm run dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                      # unit tests: passwords, roles, operations
# End to end (needs a production build running on :3100 with a clean database):
npm run build && PGLITE_DIR=$(mktemp -d) AUTH_SECRET=test AUTH_URL=http://127.0.0.1:3100 \
  SUPER_ADMIN_EMAILS=admin@example.test ADMIN_BOOTSTRAP_PASSWORD="bootstrap passphrase 123" \
  npx next start -p 3100 &
node tests/e2e.mjs
```

## Operations

Deals, money and tasks live under the Boring PE group. Every deal belongs to one of the four
pillars (Build, Own, Co-Build, Enable). Rules, all enforced on the server:

- Moving a deal to Closing or Closed, by anyone but the Super Admin, creates an approval and parks
  the move; the stage changes only when the Super Admin approves. Only the Super Admin can move a
  closed deal.
- Money in is recorded as it happens. A payment out by anyone but the Super Admin waits for
  approval and is not counted until then. Rejected and withdrawn payments never count.
- Money and Deals are open to the Super Admin, Admin and Partner; Tasks also to Operators.

## Workspaces

The portal has three workspaces: **Personal** (Rahul Mane's own books, investments, mail, notes and
tasks), **Boring PE** (the firm, its SPVs and ventures) and **Impact Marrow** (Impact Marrow and its
fund). Every entity, task, mailbox and vault document belongs to one of them. The switcher at the top
of the menu changes what every page shows; **All workspaces** shows them together, with each
workspace's cash on the dashboard.

- The Super Admin enters all three. Personal is never given to anyone else.
- Other seats are given Boring PE, Impact Marrow or both on the Access page; their role applies in each.
- Money that crosses workspaces is entered once and lands in both books: gifts into Impact Marrow
  (from Personal or Boring PE), and holdings where Personal invests into a Boring PE entity.
- The database refuses a journal posting by anyone outside the entity's workspace, whatever page
  or form it came from (`migrations/0020_workspaces.sql`).

## Security and data privacy

Both websites (boringpe.com, rahulmane.com) and the portal are hardened against attack, data leakage
and copying. The Super Admin's **Security** page (`/portal/security`) shows the state at a glance.

**Against attack**
- Strict browser headers on every response (`src/lib/security-calc.ts`, applied in `next.config.ts`):
  a Content-Security-Policy with no third-party scripts, no plugins and no framing; HSTS with
  preload; `nosniff`; a Permissions-Policy that turns off camera, microphone, location, payment and
  tracking; `Cross-Origin-Opener-Policy`; no `X-Powered-By`.
- Rate limits in fixed windows (`src/lib/rate-limit.ts`, table `rate_limits` in
  `migrations/0027_security.sql`). Addresses and emails are stored only as keyed hashes.
  - wrong passwords: 30 per address and 10 per email every 15 minutes, on top of each account's own lock;
  - sign-in links: 5 an hour per inbox;
  - API: 120 calls a minute per key, 20 a minute per address without a valid key;
  - webhooks: 300 a minute per address; KYC consent journeys: 20 an hour per address;
  - exports and backups: 30 an hour per person; file downloads: 300 an hour.
- The first request over a limit is written to the audit log.

**Against data leakage**
- Every portal page carries a faint watermark with the viewer's email and the date, on screen and in
  print, so a leaked screenshot or printout can be traced.
- Sign-out after 30 minutes without activity in any portal tab, with a minute's warning.
- Every CSV export, backup and file download is logged with who took what; CSVs end with a
  "Confidential: exported by …" line.
- Portal responses are never cached, indexed or sent with a referrer.
- The Security page lists seats without two-step sign-in, locked accounts, what was blocked in the
  last day, who took data out in the last week, and security events. **Sign everyone else out**
  ends every other session at once.

**Against copying**
- AI-training crawlers and site copiers (GPTBot, CCBot, ClaudeBot, Bytespider, HTTrack, wget and
  others) are disallowed in `robots.txt` and refused with a 403 at the edge. Search engines and the
  assistants' live search fetchers can still read the public pages.
- Pages carry `noai, noimageai` and a copyright notice; images cannot be embedded by other sites
  (`Cross-Origin-Resource-Policy`), and no page can be framed.
- `/.well-known/security.txt` says how to report a problem.
- `/llms.txt` ([llmstxt.org](https://llmstxt.org)) gives AI assistants a short guide to Boring PE, built from the
  site's live wording (`src/lib/llms-calc.ts`), so edits under Site content show up there too.

## Net worth

`/portal/networth` (in the menu under Intelligence) tracks net worth, assets, liabilities, income,
expenses and investments at every level, straight from the books:

1. **All of it together**: Rahul Mane, Boring PE and Impact Marrow.
2. **Each workspace**: Rahul Mane (Personal), Boring PE, Impact Marrow.
3. **Each unit** under its parent, as deep as the parents go: Boring PE, its SPVs and ventures,
   Impact Marrow and its fund, Rahul's personal books.

- Balances are at the end date; income and expenses cover the period (the financial year to date by
  default). Each level also shows twelve months of net worth, income and expenses, and what makes it up.
- **Net worth** is assets less liabilities as booked. **At market value** counts investments at their
  latest valuation instead of their cost.
- A level counts money that moves inside it once: a stake one unit holds in another unit inside the
  level is dropped (that company's own books carry it), Boring Studio fees are neither income nor
  expense when Boring PE is inside, and a gift between two units inside is not an expense.
- Download CSV gives every level. Super Admin, Admin and Partner seats can open it, and each sees only
  the workspaces they have; Rahul Mane's level is the Super Admin's alone.

## Verticals

The Boring PE workspace is organised by its four verticals, each with its own page under **Verticals**
in the menu:

| Vertical | Page | What it covers |
| --- | --- | --- |
| Build | `/portal/verticals/build` | Ventures Boring PE builds and runs. |
| Co-Build | `/portal/verticals/co-build` | Ventures built with an operator on revenue or profit share. |
| Own | `/portal/verticals/own` | Holdings and stakes, with current value and cost still held. |
| Boring Studio (Enable) | `/portal/verticals/studio` | Manages all of Boring PE's activities, Build, Co-Build and Own, and the portal and business operations behind them. Not a separate legal entity: it is the Boring PE workspace itself. |

- Each page shows this financial year's figures, the vertical's ventures or holdings, open deals,
  invoices, open tasks and matching insights. Boring Studio also compares every vertical side by side
  and earns the Boring Studio fee each venture pays.
- Invoices, money entries and tasks carry a vertical. When none is chosen it comes from the entity:
  Boring PE's own books belong to Boring Studio, a venture's company takes the venture's vertical, a
  holding's company takes the holding's, and a task takes its deal's (`migrations/0025_verticals.sql`).
- The invoice, money and task lists filter by vertical (`?vertical=build|co_build|own|enable`).
- Super Admin, Admin and Partner seats see the verticals.

## Assistant

`/portal/assistant` is a chat assistant ("she") for work and personal things, open to every seat.
She runs on whichever AI services are set up under Integrations → AI assistant (Anthropic Claude,
OpenAI, Google Gemini, or any OpenAI-compatible server, including one you host yourself), tried in
the order set on her settings page, moving to the next if one fails. Each conversation can be
pinned to one service.

She acts only through the portal's own tools, as the person using her, inside their role and the
workspace on view. For each kind of work (looking things up, notes, tasks, email, calendar,
WhatsApp, money) she is either not allowed, asks first (an Approve / Decline card in the
conversation), or acts on her own:

- the Super Admin sets this per role; each person can make her more careful for themselves;
- roles the Super Admin chooses may switch on **full agent**: on her own wherever the role allows;
- money always waits for a yes, whatever is set; every action she takes or asks about is logged.

The rules are in `src/lib/assistant-policy.ts` (pure, unit-tested); the tools in `src/lib/assistant-tools.ts`.

## KYC

`/portal/kyc` (Super Admin, Admins, partners; decisions by the Super Admin and Admins) verifies
people and legal entities. Each case moves requested → in progress → ready for review → verified
or rejected, and comes back as **Re-KYC due** on a date set by risk (2 years high, 8 medium,
10 low, following the RBI's risk-based periods).

- **Identifiers** are checked here first (PAN format and holder type, Aadhaar Verhoeff check
  digit, GSTIN checksum, CIN / LLPIN, IFSC, Udyam), then by a **KYC provider** when one is set up
  under Integrations → KYC. Provider answers wait for a reviewer to confirm.
- **DigiLocker / Entity Locker**: the case sends a one-time link (7 days). The person or entity
  opens `/portal/verify/<token>` with no portal seat, consents, and signs in on the government site
  (OAuth with PKCE). Their name, issued documents and, for people, e-Aadhaar come back; PAN, GSTIN,
  CIN and Aadhaar from the locker pass on their own when the name matches (80%+).
- **Entities** need every beneficial owner (10%+) verified as a person case of their own.
- **Aadhaar**: only the last four digits are ever stored or shown; provider answers are scrubbed of
  full numbers and document files before they are saved.
- Direct DigiLocker / Entity Locker access needs approval as a requester; until then use the KYC
  provider and documents. Register `<portal>/api/kyc/callback` as the callback URL.

## Private infrastructure

- **Two-step sign-in** (Account → Two-step sign-in): an authenticator-app code (RFC 6238) after any
  sign-in method, ten single-use recovery codes, and "trust this browser for 30 days" (each trusted
  browser listed and revocable). Wrong codes count toward the 5-try lock. The Super Admin can require
  it per role (Access); those seats must set it up before anything else opens. Until the second step
  is done, no page or API answers.
- **Password vault** (`/portal/secrets`): logins and keys sealed with AES-256-GCM, private or shared
  with chosen roles inside a workspace; shown for 30 seconds on request, every look logged.
- **Encrypted backup** (Console): the whole database as one file sealed with a passphrase
  (scrypt + AES-256-GCM). `scripts/restore-backup.mjs` loads it into any Postgres in one transaction.
- **Self-hosting kit** (`deploy/`): Dockerfile, Docker Compose with Postgres 16, Caddy (HTTPS) and
  nightly encrypted dumps, for running everything on your own servers in India. See
  `deploy/SELF-HOSTING.md`.

## Everyday use

- **+ New** (header, or press `N`): start an invoice, money entry, journal entry, task, deal,
  meeting, file, KYC case, password or invite, offered only where your role allows.
- **Breadcrumbs** above every page: workspace › group › page.
- **Keyboard shortcuts**: `Ctrl/⌘ K` search, `N` new, `G` then a letter to go (D dashboard,
  A assistant, S insights, B books, I invoices, M money, T tasks, V vault, K KYC, G guides), `?` for the list.
- **Guides** (`/portal/guides`): step-by-step workflows (set up the portal, bill and get paid, close
  the month, bring on a person, invest, run a venture) that tick themselves off from what is already
  in the portal. The owner's dashboard shows "Getting started" until setup is done.
- **Activity** (`/portal/activity`, Super Admin and Admins): every audited action, filterable by
  person and area.
- **Drive**: the BIDU Vault has folders per workspace, "only me" files, moving and search.

## The Business Stack

The portal is the infrastructure and intelligence every Boring PE venture runs on. The menu
follows that shape:

| Group | Pages |
| --- | --- |
| Intelligence | Dashboard, Insights, MIS reports, Budgets, Portfolio |
| Ventures | Ventures, Deal Pipeline, Impact Marrow, Tasks, Approvals |
| Infrastructure | Books, Invoices, Bank reconciliation, Money, Fixed assets, People & payroll, BIDU Vault, Inbox, Calendar, WhatsApp, Integrations, Access |

**Insights** (`/portal/intelligence`, Super Admin, Admins and partners) turns the records into
plain-language findings for the whole group, each entity and each venture: cash runway from the
average burn of the last three whole months, overdue receivables by customer, income behind or
spending over budget this financial year, venture revenue falls, losses and unclosed months, and
expense accounts that jumped well above their usual month. The rules live in
`src/lib/insights-calc.ts` (pure, unit-tested); the most pressing ones also show on the dashboard.

## ERP modules

| Module | Where | What it does |
| --- | --- | --- |
| Books | `/portal/books` | Double-entry books per entity (Boring PE, Impact Marrow, its fund, SPVs, ventures). Balanced, immutable entries enforced in the database; corrections by reversal. Trial balance, P&L, balance sheet. |
| Portfolio | `/portal/portfolio` | Holdings across asset classes, invest / income / exit / valuation posting to the holder's books, MOIC; cap tables; access links for external people. |
| Ventures | `/portal/ventures` | Build and Co-Build ventures, operators on revenue or profit share, monthly close posting revenue, costs, operator payables and the Boring Studio fee. |
| People | `/portal/people` | Employees per entity, leave with yearly balances, pay runs (draft, post, pay) posting to the books; self-service "My record". |
| Impact Marrow | `/portal/marrow` | Contributions from Boring PE or Rahul personally into the Impact Marrow Fund's books. |
| BIDU Vault | `/portal/vault` | Documents up to 4 MB stored in Postgres, team-only or shared with people linked to an SPV, venture or holding; always downloaded, never rendered. |
| MIS reports | `/portal/reports` | Group P&L with fees between our own entities removed, month-by-month trend, verticals, people, Impact Marrow; CSV export. |

Money that leaves the firm (investing, exits, contributions, operator payouts, salaries) is recorded only by the Super Admin.
External roles (LP, founder, operator, Co-Build partner) see only what is linked to them.

## Integrations

Set up under **Integrations** (Super Admin). Each card shows the redirect or webhook URL to paste into the provider.

| Service | What it powers | Needs |
| --- | --- | --- |
| Resend | Sign-in links, invites, notification email | API key, from address |
| Google Workspace | Gmail in **Inbox**, Google Calendar in **Calendar** | OAuth client (Gmail API + Calendar API enabled) |
| Microsoft 365 | Outlook mail and calendar | Azure app registration |
| Zoho Mail | Zoho mail in **Inbox** | Zoho API client |
| WhatsApp Cloud API | **WhatsApp** shared inbox | Phone number ID, WABA ID, system-user token, app secret, verify token |
| Razorpay | Payment links on invoices; paid links post to the books | Key ID, key secret, webhook secret (`payment_link.paid`) |

- Credentials are encrypted with AES-256-GCM. Set **`INTEGRATIONS_KEY`** (any long random string) in Vercel; without it `AUTH_SECRET` is used, and rotating that would make stored credentials unreadable.
- Public API: `/api/v1/*` with keys from Integrations → API keys. Outgoing webhooks are signed `X-BoringPE-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")`.
- Incoming webhooks: `/api/webhooks/whatsapp` (Meta signature) and `/api/webhooks/razorpay` (Razorpay signature, de-duplicated by event id).
- **`PORTAL_TEST_MODE=1`** gives a pretend mailbox, calendar, WhatsApp and Razorpay for the browser tests only. **Never set it in production.**
