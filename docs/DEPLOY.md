> # SUPERSEDED: DO NOT FOLLOW
>
> This document describes the **retired** deployment model: Docker Compose for
> the application, `scripts/deploy.sh` driven by a cron flag, and the host
> `mo.legenex.com`. None of that is true.
>
> - `mo.legenex.com` is no longer a Plesk domain. The control plane is
>   `os.legenex.com`.
> - The application runs under the `legalos-dev` systemd unit, not Docker. Only
>   the `postgres` and `redis` services of `docker-compose.yml` are used.
> - There is no deploy cron and no `/var/log/legalos-deploy.log`.
>   `scripts/deploy.sh`, `scripts/cron-deploy.sh` and
>   `scripts/trigger-deploy.sh` are dead.
> - Releasing is `scripts/release.sh` after a Plesk fetch and deploy.
>
> **Current truth: `AGENTS.md` section 6, `docs/release-runbook.md`,
> `docs/INFRASTRUCTURE.md`.**
>
> Retained because two sections are still the only written record of their
> subject: the enum-migration workaround for Postgres inside a Payload
> transaction, and the original one-time Plesk Git and API setup. Read those
> for history. Do not run anything here.

---

# Deploying LegalOS

Server: `mo.legenex.com` (51.81.202.161) — Plesk + Docker Compose on Debian 12.

---

## TL;DR — the steady state

```bash
git push
```

Within ~3 min the change is live at https://mo.legenex.com.

That's the whole flow. Everything below is for understanding it, verifying it, or recovering when it breaks.

---

## How a push reaches production

```
┌────────────┐  git push   ┌────────────────┐
│  Your PC   │ ──────────► │  GitHub        │
└────────────┘              └───────┬────────┘
                                    │ webhook
                                    ▼
                            ┌───────────────────────────┐
                            │ Plesk Git extension       │
                            │ pulls into doc root,      │
                            │ runs deploy action:       │
                            │   bash scripts/           │
                            │     trigger-deploy.sh     │
                            └───────┬───────────────────┘
                                    │ touches flag
                                    ▼
                            /tmp/legalos-deploy.flag
                                    │
                                    │ root cron polls every minute
                                    ▼
                            ┌───────────────────────────┐
                            │ scripts/cron-deploy.sh    │
                            │ (root, full PATH)         │
                            │ runs scripts/deploy.sh    │
                            └───────┬───────────────────┘
                                    │
                                    ▼
        docker compose build → up -d → migrate → curl health-check
                                    │
                                    ▼
                    ✓ Live at https://mo.legenex.com
```

The split exists because **Plesk's git deploy hook runs in a chroot** with no `docker`, no `dirname`, no `date`. So the hook can only do bash-builtin work (drop a flag), and the real deploy runs from a separate cron context that has a normal PATH.

---

## Verifying a deploy landed

After `git push`, wait ~2 min then:

**1. Confirm the new commit is checked out — easiest signal:**

Open https://mo.legenex.com/admin and look at the **version pill in the bottom-right corner**:

```
● build N  •  just now
```

- Green dot = production build with SHA baked in.
- Number increments by 1 per commit (uses `git rev-list --count HEAD`).
- Click the pill → opens the deployed commit on GitHub.
- Hovering shows the full SHA and build timestamp.

If the pill still shows the OLD build number after a deploy, the new image didn't ship — see troubleshooting below.

Alternatively check the raw stamp:
```
https://mo.legenex.com/.git-sha
```
Should match `git rev-parse HEAD` from your laptop.

**2. Tail the deploy log (in Plesk SSH Terminal):**
```bash
tail -f /var/log/legalos-deploy.log
```
You're looking for a recent banner:
```
====================================================================
Cron deploy run at 2026-05-14T...
====================================================================
[deploy ...] ✓ deploy complete. Visit https://mo.legenex.com/admin
Exit: 0
```

**3. Hard-refresh your browser** (Ctrl+Shift+R). Next.js caches aggressively.

---

## Local preview before pushing

Postgres + Redis run locally via Docker. The Next.js dev server runs on the host with hot reload.

```powershell
# Start once (already running if containers from a prior session are still up)
docker compose up -d postgres redis

# Start dev server (auto-reloads on save)
pnpm dev
```

Open http://localhost:3000/admin (or 3001 if 3000 is in use). Edit any file → save → browser refreshes within ~1s. Only `git push` when you're happy.

Local DB has all 3 seeded Sites and 9 legal templates from `pnpm seed`. Login: `team@legenex.com` + `SUPER_ADMIN_PASSWORD` from your local `.env`.

---

## Manual deploy (escape hatch)

When the automation is stuck or you want to skip cron and go straight to deploying:

```bash
# In Plesk → Tools & Settings → SSH Terminal
cd /var/www/vhosts/legenex.com/mo.legenex.com
bash scripts/deploy.sh
```

Output streams to your terminal directly. Takes 1-3 min. On success the last line is:
```
[deploy ...] ✓ deploy complete. Visit https://mo.legenex.com/admin
```

---

## One-time setup (already done — for reference)

If the server is ever rebuilt, replay these in order:

### 1. Pull the bare repo
```bash
git --git-dir=/var/www/vhosts/legenex.com/git/legalos.git fetch origin main
git --git-dir=/var/www/vhosts/legenex.com/git/legalos.git \
    --work-tree=/var/www/vhosts/legenex.com/mo.legenex.com checkout -f main
```

### 2. Create `.env` from `.env.example`
```bash
cd /var/www/vhosts/legenex.com/mo.legenex.com
cp .env.example .env
nano .env   # fill in production values
```

> **No placeholders.** Every value must be a real, working value or left blank. `<your-server-ip>`, `<paste here>`, `CHANGEME`, etc. left in `.env` will be rejected by `deploy.sh` at boot. If you don't know a value yet, leave the key empty (`KEY=`) — code branches on emptiness, not placeholder text. This applies to **every section** of `.env`, not just "required" ones; a half-filled `PLESK_API_URL` silently breaks custom-domain provisioning even though the app boots.

Required (deploy.sh blocks without them):
- `PAYLOAD_SECRET` — long random string, never reuse from dev
- `DATABASE_URI` — `postgres://legalos:<pwd>@postgres:5432/legalos`
- `NEXT_PUBLIC_SERVER_URL` — `https://mo.legenex.com`
- `LEGALOS_FALLBACK_HOST` — `mo.legenex.com`
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`

### 3. First-time setup (builds image, migrates, seeds)
```bash
bash scripts/first-time-setup.sh
```

### 4. Install the cron (runs deploys triggered by Plesk hook)
```bash
crontab -l 2>/dev/null > /tmp/cron.bak
echo '* * * * * /var/www/vhosts/legenex.com/mo.legenex.com/scripts/cron-deploy.sh' >> /tmp/cron.bak
crontab /tmp/cron.bak
crontab -l   # verify
```

### 5. Wire Plesk's Git extension
- Plesk → Websites & Domains → mo.legenex.com → **Git**
- Repository Settings → **Additional deployment actions**: `bash scripts/trigger-deploy.sh`
- Save

### 6. Add Plesk REST API for tenant domain auto-provisioning (required for custom-domain feature)
- Plesk → Extensions → install **Keychain for API Secret Keys**
- Open it → **Add Secret Key** → IP `127.0.0.1` → copy the key
- Add to `.env`:
  ```bash
  PLESK_API_URL=https://51.81.202.161:8443
  PLESK_API_KEY=<paste here>
  PLESK_PROXY_TARGET=http://127.0.0.1:3000
  PLESK_OWNER_LOGIN=admin
  PLESK_OWNER_EMAIL=team@legenex.com
  PLESK_IP_ADDRESS=51.81.202.161
  # Plesk serves its API on 8443 with a cert issued for mo.legenex.com.
  # When the app container connects via the IP (above), the cert hostname
  # doesn't match and Node fetch rejects. Traffic stays on the host
  # (container → docker bridge → host loopback to :8443), so skipping
  # verification for Plesk calls only is the standard same-host pattern.
  PLESK_INSECURE_SKIP_TLS_VERIFY=true
  ```
- Restart: `docker compose restart app`

---

## Troubleshooting

### "deploy didn't update anything"
The container only rebuilds when `deploy.sh` runs. A bare `git pull` doesn't restart Docker. Check:
- `tail -50 /var/log/legalos-deploy.log` — no recent run = automation broke
- `crontab -l` (as root) — confirm the cron line is there
- Plesk → Git → Repository Settings — confirm deploy action is `bash scripts/trigger-deploy.sh`
- Force a deploy: `bash scripts/deploy.sh`

### "ERROR: required env vars missing or empty in .env"
deploy.sh requires `PAYLOAD_SECRET`, `DATABASE_URI`, `NEXT_PUBLIC_SERVER_URL`, `LEGALOS_FALLBACK_HOST`. To recover values from the running container:
```bash
docker compose exec app printenv | grep -E "^(PAYLOAD_SECRET|DATABASE_URI|NEXT_PUBLIC_SERVER_URL|LEGALOS_FALLBACK_HOST)="
```
Paste them back into `.env`, then re-run `bash scripts/deploy.sh`.

### "fatal: not a git repository" in the doc root
Expected. Plesk uses a separate bare repo at `/var/www/vhosts/legenex.com/git/legalos.git/`. Git commands in the doc root won't work. Use:
```bash
git --git-dir=/var/www/vhosts/legenex.com/git/legalos.git log -1 --oneline
```
Or check `cat .git-sha` for the deployed commit.

### Browser still shows old version after successful deploy
- Hard-refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- Check `https://mo.legenex.com/.git-sha` — if it matches your latest commit, the server is updated and it's purely a browser-cache issue
- If `.git-sha` is stale, deploy didn't actually run — check the log

### "duplicate location" or 403 on the public URL
nginx/Apache config conflict in Plesk. Custom directives panel: use **Apache** `ProxyPass` (not nginx `location`) — Plesk sometimes inserts its own nginx blocks that conflict.

### Migration fails during deploy
```bash
docker compose logs --tail=200 app
```
Common cause: a migration was committed but `src/payload-types.ts` or the schema diverged. Locally regenerate:
```bash
pnpm payload migrate:create <fix-name>
git add src/migrations/ && git commit && git push
```

### Migration fails with "unsafe use of new value '<x>' of enum type"
Postgres forbids `ALTER TYPE ... ADD VALUE` inside a transaction, and Payload v3 wraps every migration's `up()` in one — with no per-migration opt-out in 3.83. **Don't use `db.execute(sql\`ALTER TYPE ... ADD VALUE ...\`)` in a migration.**

Bypass the wrapper by reaching into the raw pg pool on a fresh connection:
```ts
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
type PgClient = { query: (sql: string) => Promise<unknown>; release: () => void }
type Pool = { connect: () => Promise<PgClient> }

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  const pool = (payload.db as unknown as { pool: Pool }).pool
  const client = await pool.connect()
  try {
    await client.query(`ALTER TYPE "public"."enum_foo" ADD VALUE IF NOT EXISTS 'bar' BEFORE 'baz';`)
  } finally {
    client.release()
  }
}
```
Each `client.query` auto-commits on its own connection, so the new enum value is visible by the time anything else references it. See `src/migrations/20260518_134859_site_status_draft.ts` for a working example.

### Plesk webhook doesn't pull on `git push`
Sometimes the GitHub → Plesk webhook silently doesn't fire (we don't know the exact cause yet — possibly a Plesk-side throttle or token issue). Symptoms: `.git-sha` and version pill stay on an old commit hours after pushing.

Force a pull + deploy from SSH:
```bash
git --git-dir=/var/www/vhosts/legenex.com/git/legalos.git fetch || true
git --git-dir=/var/www/vhosts/legenex.com/git/legalos.git \
    --work-tree=/var/www/vhosts/legenex.com/mo.legenex.com checkout -f main

# Verify your latest commit is now on disk:
git --git-dir=/var/www/vhosts/legenex.com/git/legalos.git \
    --work-tree=/var/www/vhosts/legenex.com/mo.legenex.com log -1 --oneline

# Run the deploy
cd /var/www/vhosts/legenex.com/mo.legenex.com && bash scripts/deploy.sh
```

Alternatively in the Plesk web UI: **Websites & Domains → mo.legenex.com → Git → Pull Updates**. That re-runs the trigger-deploy hook.

---

## Files involved (so you know what to edit)

| File | Purpose |
|---|---|
| `scripts/trigger-deploy.sh` | Plesk's chroot-safe trigger; only drops the flag |
| `scripts/cron-deploy.sh` | Root cron entry; polls flag, runs deploy.sh |
| `scripts/deploy.sh` | The real deploy: build, up, migrate, health-check |
| `scripts/first-time-setup.sh` | One-time bootstrap on a fresh server |
| `Dockerfile` | App image build |
| `docker-compose.yml` | Service definitions (app, postgres, redis) |
| `src/migrations/` | Database migrations (committed; deploy.sh applies them) |
