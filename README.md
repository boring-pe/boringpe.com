# Boring PE

Public site and the invite-only Boring Portal. Next.js 16, Auth.js, Postgres (Neon).

- `/` public site
- `/portal/*` the portal (also served at `portal.boringpe.com`), behind sign-in

## Access model

Nobody can sign up. An admin invites people under **Portal → Access**, gives each a role
(admin, partner, operator, founder, LP) and can switch a seat off at any time. Every
protected page and server action re-checks the user in the database (`src/lib/dal.ts`), so
role changes, switch-offs and "end sessions" apply on the very next request. `src/proxy.ts`
only does routing and a cheap cookie check; it is not the security boundary.

Sign-in methods (each shows on the login page only when its keys are set):

| Method | Needs |
|---|---|
| Email + password | nothing; admin gives a temporary password at invite time, replaced at first sign-in |
| Google | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Redirect URI: `https://portal.boringpe.com/api/auth/callback/google` |
| LinkedIn | `AUTH_LINKEDIN_ID`, `AUTH_LINKEDIN_SECRET`; enable "Sign In with LinkedIn using OpenID Connect". Redirect URI: `https://portal.boringpe.com/api/auth/callback/linkedin` |
| Email link | `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` (Resend) |

Google, LinkedIn and email links only work for an email that is already invited (or listed in
`ADMIN_EMAILS`), and OAuth requires the provider to report the email as verified. Passwords are
scrypt-hashed; 5 wrong attempts lock a seat for 15 minutes.

## Set up

1. Create a Neon project and copy the pooled connection string.
2. In Vercel set the variables in `.env.example` (at least `AUTH_SECRET`, `AUTH_URL`,
   `DATABASE_URL`, `ADMIN_EMAILS`, and `ADMIN_BOOTSTRAP_PASSWORD` for the first sign-in).
3. Deploy. `npm run build` applies pending files in `migrations/` first.
4. Sign in as the first `ADMIN_EMAILS` address with the bootstrap password, choose a new one,
   then **remove `ADMIN_BOOTSTRAP_PASSWORD`**. Invite everyone else from the Access screen.

Locally, leave `DATABASE_URL` empty: an embedded Postgres is created in `.data/` and migrated
automatically.

```bash
cp .env.example .env.local   # set AUTH_SECRET, ADMIN_EMAILS, ADMIN_BOOTSTRAP_PASSWORD
npm run dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                      # unit tests: passwords, roles
# End to end (needs a production build running on :3100 with a clean database):
npm run build && PGLITE_DIR=$(mktemp -d) AUTH_SECRET=test AUTH_URL=http://127.0.0.1:3100 \
  ADMIN_EMAILS=admin@example.test ADMIN_BOOTSTRAP_PASSWORD="bootstrap passphrase 123" \
  npx next start -p 3100 &
node tests/e2e.mjs
```
