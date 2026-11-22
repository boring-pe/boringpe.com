# Running the Boring Portal on your own servers

The portal runs today on Vercel with a Neon database. Everything in this folder lets you run the
same code on infrastructure you control, for example a server in an Indian data centre, so the
data never leaves machines you choose.

## What you get

| Piece | What it does |
| --- | --- |
| `Dockerfile` | Builds the portal into one container. Migrations run each time it starts. |
| `docker-compose.yml` | The portal, its own Postgres 16 (not exposed to the internet), Caddy for HTTPS, and a nightly backup job. |
| `Caddyfile` | Automatic HTTPS certificates and security headers for your domain. |
| `backup.sh` | Nightly `pg_dump`, compressed and encrypted (AES-256, PBKDF2), kept 30 days in `deploy/backups`. |
| `.env.example` | Every setting the server needs. |

## Where to run it

Any Linux server with Docker works. To keep data in India, pick a Mumbai, Pune, Hyderabad,
Chennai or Delhi region: for example AWS (ap-south-1 Mumbai, ap-south-2 Hyderabad), Azure (Central
India, Pune), Google Cloud (asia-south1 Mumbai, asia-south2 Delhi), or Indian providers such as E2E
Networks, CtrlS or Yotta. 2 vCPUs, 4 GB RAM and 50 GB disk is plenty to start.

## Steps

1. Point a DNS A record (e.g. `portal.boringpe.com`) at the server.
2. Install Docker, then copy this repository onto the server.
3. `cd deploy && cp .env.example .env` and fill every value. Generate secrets with
   `openssl rand -base64 32`. Keep `BACKUP_PASSPHRASE` somewhere apart from the server.
4. `docker compose up -d --build`. Caddy fetches the certificate; the portal is at your domain.
5. Sign in with the bootstrap password, set your own password and two-step sign-in, then remove
   `ADMIN_BOOTSTRAP_PASSWORD` from `.env` and run `docker compose up -d` again.
6. In Integrations, set the callback and webhook addresses shown there with your new domain.

## Moving from Vercel and Neon

1. In the portal on Vercel: Console → Encrypted backup. Tick "Include vault files", choose a
   passphrase, download the `.bpbak` file.
2. On the new server, once the stack is up (migrations have run):
   ```sh
   docker compose cp ../path/to/boring-portal-YYYY-MM-DD.bpbak portal:/tmp/b.bpbak
   docker compose exec -e BACKUP_PASSPHRASE='…' portal node scripts/restore-backup.mjs /tmp/b.bpbak --replace
   ```
   It loads everything in one transaction, parents before children; on any error nothing changes.
3. Use the same `AUTH_SECRET` and `INTEGRATIONS_KEY` as on Vercel, or saved integration keys and
   vault passwords cannot be unsealed and must be entered again.
4. Move DNS to the new server.

## Restoring a nightly dump

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE \
  -in backups/portal-YYYY-MM-DDTHHMM.sql.gz.enc | gunzip | docker compose exec -T db psql -U portal -d portal
```

## Keeping it safe

- Only ports 80 and 443 are open; Postgres has no public port.
- Copy `deploy/backups` off the server regularly (another region, or an encrypted drive).
- Update with `git pull && docker compose up -d --build`; migrations apply on start.
- `PORTAL_TEST_MODE` must never be set on a real server.
