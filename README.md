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
| Ventures | `/portal/ventures` | Build and Co-Build ventures, operators on revenue or profit share, monthly close posting revenue, costs, operator payables and the Business House fee. |
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
