# Releasing PageFlo

One command, on the server, in the app directory:

    scripts/release.sh

`--dry-run` prints the plan and touches nothing. `--no-backup` skips the dump
and is for a scratch host only.

---

## Why there is a script

The documented deploy was eight commands: fetch, deploy, stop, install,
importmap, build, **start**, status — and then, separately, from memory, only if
you noticed the release contained one, `pnpm payload migrate`.

That order cannot work. New code declares a column; the service starts before
the migration that creates it; Payload's `SELECT` enumerates every column a
collection declares, so the process **throws at boot** rather than degrading a
page. The last release hit exactly that on `funnel_lp_deployments.quiz_id`, and
was recovered by transcribing migration SQL into `psql` by hand — which is how a
schema and a migration ledger stop agreeing about what has been applied.

The order below is the one that works, and nothing in it depends on somebody
remembering a step.

| | step | why here |
|---|---|---|
| 1 | preflight | app dir, `pnpm`, `.env`, is the service running |
| 2 | **backup** | before any DDL, and the dump is size-checked — see below |
| 3 | fetch + deploy | both, always; `--deploy` alone redeploys the last fetch |
| 4 | **stop** | the running process holds `.next/`, and this opens the window in which code and schema may disagree |
| 5 | install + build | the build touches no database, so a failure here leaves the schema untouched |
| 6 | **migrate** | service down, so nothing is serving against a half-applied schema |
| 7 | **verify** | `pnpm verify:schema` reads every collection and global — exactly what a boot does |
| 8 | start | only now |
| 9 | health | a real HTTP request to `/api/legalos/health`, 30 attempts |

## The health gate is a liveness route, not `self-check`

`self-check` answers a different question — *did this request reach PageFlo for
the right **tenant**?* — and returns **404** for a host with no `Domains` row.
`os.legenex.com` is the control plane and deliberately has no such row, so
pointing the gate there made a **successful** release exit 1 at its last stage,
after the migrations had applied and the service was up and serving. The trap
then printed the `payload migrate:down` guidance, urging an operator to reverse
a release that had worked. Measured on production 2026-08-14.

`/api/legalos/health` proves the two things a release actually asks about — the
new build is serving, and it can reach the database it was just migrated
against — and depends on no host mapping, so no future `Domains` change can turn
the gate red again.

**The gate deliberately still uses the `/api/legalos/*` path.** The canonical
route is `/api/pageflo/health` and `/api/legalos/health` is a re-export of it,
so both answer on the current build. The legacy path is the one that also
answers on every OLDER build, which is exactly the situation a rollback puts the
health gate in. Pointing the gate at the new path would make it fail on the
build you are rolling back to. `LEGALOS_HEALTH_URL` overrides it per host.

## The backup is size-checked, and that is not paranoia

The system `pg_dump` is version 15 against a 16.x server and produces a
**20-byte empty file with a zero exit status**. A dump under a kilobyte fails the
release. Override the binary with `LEGALOS_PG_DUMP` if the container name
changes.

## The migrate stage answers a prompt, and that is deliberate

`payload migrate` asks a question. `@payloadcms/drizzle`'s `migrate()` prompts —

> you've run Payload in dev mode … data loss will occur. Would you like to
> proceed? (y/N)

— whenever any `payload_migrations` row carries `batch = -1`, the marker a
dev-mode auto-push leaves behind. Production has exactly one such row and always
will: it is a record of history, not a thing to clean up. **No flag suppresses
it.** `--force-accept-warning` is wired only to `migrate:create` and
`migrate:fresh`.

Unanswered, it blocks forever **with the service already stopped**, and prints
nothing to say why. That happened on 2026-08-14 and cost ~25 minutes of downtime
before the cause was found; the database was untouched, because it blocks before
any DDL.

So the script pipes `y` into it, and bounds the stage with `timeout 900`. That
is safe here rather than merely convenient: every migration in `src/migrations/`
is hand-written idempotent (`IF NOT EXISTS` house style), the size-checked
backup is taken *before* this stage, and `verify:schema` on the next line
refuses to start the service if the outcome disagrees with the code.

`printf`, not `yes` — `yes` dies of SIGPIPE and, under `pipefail`, its 141 would
fail the stage even when the migration succeeded.

## Rollback

The script prints the rollback for the stage it failed at, so it is never
improvised.

* **Failed before `migrate`** — the database is untouched. Redeploy the previous
  SHA and start.
* **Failed at or after `migrate`** —

      cd /var/www/vhosts/legenex.com/os.legenex.com
      pnpm payload migrate:down        # ONCE. It reverses the batch.

  `migrate:down` reverses the last **batch**, and a release's migrations are one
  batch, so one command undoes exactly this release.
  `scripts/test-release-ordering.mts` asserts that rather than assuming it.
* **A down migration itself fails** — restore the dump from step 2. That is what
  it is for.

**Never edit `payload_migrations` by hand.** Ending that practice is the point
of this script.

## Verifying without releasing

    pnpm verify:schema     # read-only, safe on production

Reads one row from every collection and every global. Exit 0 clean, 1 on a
mismatch, 2 if it could not connect. Run it any time you want to know whether
the running code and the live database still agree.

## Proving the order, not asserting it

    pnpm test:release      # needs a postgres it can create databases on

Builds a scratch database at **the previous release's schema** — the committed
migration set minus this release's files — and then asserts, in the order a
release makes the claims:

1. the new code **fails** `verify:schema` against the previous schema (if this
   passed, the ordering would not matter and the whole exercise would be
   theatre);
2. after migrating, it **passes**, with nothing started;
3. `migrate:down` reverses it and the code correctly refuses again;
4. re-running `migrate` is a no-op, and the ledger records each migration once.

It also asserts that `src/migrations/index.ts` lists exactly the files on disk,
in order — see below.

## `src/migrations/index.ts` is a cross-check, not the chain

`CLAUDE.md` says that array "is what runs, not the directory listing". **That is
the wrong way round.** Payload's `readMigrationFiles` reads the migration
directory, sorts by filename, and explicitly skips `index.ts`. So:

* a file dropped into `src/migrations/` **runs**, registered or not;
* deleting three lines from `index.ts` disables **nothing**.

The list is still worth keeping — it is the one place the intended chain is
written down in order — and `pnpm test:release` fails if it and the directory
disagree. A list that agrees with reality is a cross-check; a list that is merely
believed to be authoritative is a trap.

## Staging a long migration

`PAGEFLO_MIGRATION_DIR` (legacy `LEGALOS_MIGRATION_DIR`, still read) points the
migrator at a different set of files, so a release can be applied as far as a
known point rather than all at once:

    PAGEFLO_MIGRATION_DIR=/path/to/subset pnpm payload migrate

This is also how `pnpm test:release` builds the previous release's schema
exactly, from this repository alone.

## Environment

Every value the script uses is overridable, and the defaults are production's.

| variable | default |
|---|---|
| `LEGALOS_APP_DIR` | `/var/www/vhosts/legenex.com/os.legenex.com` |
| `LEGALOS_PLESK_DOMAIN` | `os.legenex.com` |
| `LEGALOS_PLESK_REPO` | `legalos.git` |
| `LEGALOS_SERVICE` | `legalos-dev` |
| `LEGALOS_HEALTH_URL` | `http://127.0.0.1:3000/api/legalos/health` |
| `LEGALOS_BACKUP_DIR` | `/root/legalos-backups` |
| `LEGALOS_PG_DUMP` | `docker exec molegenexcom-postgres-1 pg_dump` |

Every one of these names is a **compatibility identifier** and is deliberately
not renamed: they address live infrastructure that exists under those names on
the host. See `docs/INFRASTRUCTURE.md`, "Compatibility identifiers".

## The PageFlo domain cutover

Three hosts reach the same application through the same Plesk reverse proxy:

| Host | Behaviour |
|---|---|
| `pageflo.io` | the public product site |
| `www.pageflo.io` | 308 to the apex |
| `app.pageflo.io` | the console and authentication |
| `os.legenex.com` | unchanged, and the rollback path |

Classification happens in `src/lib/pageflo/hosts.ts` **before** any `Domains`
lookup, so a tenant row can never claim one of them. It is driven entirely by
`PAGEFLO_MARKETING_HOST`, `PAGEFLO_APP_HOST` and `PAGEFLO_LEGACY_APP_HOSTS`.

Two environment facts decide whether a cutover works, and both fail silently:

1. **`PAGEFLO_SERVER_URL` must be the canonical console origin.** It feeds
   Payload's CSRF allowlist, transactional email links and every absolute admin
   URL.
2. **The CSRF allowlist must contain the origin the browser actually sends.**
   `src/payload.config.ts` derives it from the three host variables above, with
   and without `www.`, so setting the hosts is enough. When it is wrong, Payload
   returns `user = null` and every server action fails as "unauthenticated" with
   nothing anywhere naming CSRF.

`PAGEFLO_LEGACY_HOST_REDIRECT` is the last switch to flip, not the first. While
it is `false`, `os.legenex.com` serves exactly as it does today, which is what
makes it a rollback path. Setting it to `true` turns that host into a 308 and
removes the rollback path, so flip it only after the new hosts are verified.
