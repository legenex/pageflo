#!/usr/bin/env bash
#
# One release of LegalOS, in the only order that is safe.
#
#   scripts/release.sh              # full release
#   scripts/release.sh --dry-run    # print the plan, touch nothing
#   scripts/release.sh --no-backup  # skip the dump (for a scratch host only)
#
# Run it ON THE SERVER, from the app directory.
#
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
# ---------------------------------------------------------------------------
#
# The documented deploy was: fetch, deploy, stop, install, importmap, build,
# START, and then — separately, from memory, only if you noticed the release
# contained one — `pnpm payload migrate`.
#
# That order cannot work. New code declares a column; the service starts before
# the migration that creates it; Payload's SELECT enumerates every declared
# column, so the process throws at boot rather than degrading. The last release
# hit exactly this on `funnel_lp_deployments.quiz_id` and was recovered by
# transcribing migration SQL into psql by hand, which is how a schema and a
# migration ledger stop agreeing.
#
# So: MIGRATE WHILE THE SERVICE IS DOWN, VERIFY, then start. Nothing here needs
# a person to remember a step, and nothing here edits `payload_migrations`.
#
# ---------------------------------------------------------------------------
# WHAT IT GUARANTEES
# ---------------------------------------------------------------------------
#
#   * A database backup exists before any DDL runs, and its path is printed.
#   * The service is DOWN for the whole window in which the schema and the code
#     can disagree.
#   * `pnpm verify:schema` reads every collection and every global before the
#     service starts. A mismatch stops the release rather than the boot.
#   * A failure at any step leaves a rollback that is stated rather than
#     improvised: the previous checkout is restored and, if this release applied
#     migrations, they are reversed with `payload migrate:down` — never by hand.
#   * The health check is a real HTTP request to a real route.
#
# It is idempotent in the sense that matters: re-running it after a successful
# release fetches nothing new, migrates nothing, and restarts the service.

set -Eeuo pipefail

APP_DIR="${LEGALOS_APP_DIR:-/var/www/vhosts/legenex.com/os.legenex.com}"
DOMAIN="${LEGALOS_PLESK_DOMAIN:-os.legenex.com}"
REPO_NAME="${LEGALOS_PLESK_REPO:-legalos.git}"
SERVICE="${LEGALOS_SERVICE:-legalos-dev}"
# A LIVENESS route, deliberately not `self-check`. `self-check` answers "did
# this request reach LegalOS for the right TENANT?" and returns 404 for a host
# with no Domains row — which `os.legenex.com`, the control-plane host, does not
# have and should not have. Pointed here, the gate returned 404 on a release
# that had SUCCEEDED, and the trap below then advised `migrate:down` on it.
# Measured on production 2026-08-14. See src/app/api/legalos/health/route.ts.
HEALTH_URL="${LEGALOS_HEALTH_URL:-http://127.0.0.1:3000/api/legalos/health}"
BACKUP_DIR="${LEGALOS_BACKUP_DIR:-/root/legalos-backups}"
# The system pg_dump is version 15 against a 16.x server and produces a 20-byte
# empty file WITH A ZERO EXIT STATUS. Use the container's binary; that silent
# success is why this is a variable and not an assumption.
PG_DUMP="${LEGALOS_PG_DUMP:-docker exec molegenexcom-postgres-1 pg_dump}"

# ---------------------------------------------------------------------------
# Run from a copy, never from inside the deployment target.
#
# Stage 3 checks the new revision out over APP_DIR — including this file. Bash
# does not read a script into memory; it reads it lazily by byte offset, so a
# checkout that rewrites scripts/release.sh in place while it is executing can
# hand bash the middle of the new file as its next command. The window is
# between stage 3 and the end of the run, which is every stage that touches the
# database.
#
# Copying to /tmp and re-exec'ing costs nothing and closes it for good, rather
# than depending on whether git or rsync happened to write via rename this time.
SELF="$(readlink -f "$0")"
case "$SELF" in
  "$APP_DIR"/*)
    if [ "${LEGALOS_RELEASE_REEXEC:-0}" != "1" ]; then
      COPY="$(mktemp /tmp/legalos-release.XXXXXXXX.sh)"
      cat "$SELF" > "$COPY"
      chmod +x "$COPY"
      printf '   running from %s (a copy; stage 3 overwrites %s)\n' "$COPY" "$SELF"
      LEGALOS_RELEASE_REEXEC=1 exec "$COPY" "$@"
    fi
    ;;
esac

DRY_RUN=0
DO_BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-backup) DO_BACKUP=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 64 ;;
  esac
done

log()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mRELEASE FAILED: %s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf '   [dry-run] %s\n' "$*"; else eval "$@"; fi; }

# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------
#
# Set as the release proceeds, so the trap always knows exactly how far it got.
# Nothing is guessed: MIGRATIONS_APPLIED is counted from the ledger before and
# after, so `migrate:down` reverses this release and not somebody else's.

STAGE="preflight"
MIGRATIONS_BEFORE=""
MIGRATIONS_APPLIED=0
SERVICE_WAS_RUNNING=0

migration_count() {
  # Read from the ledger the migrator itself writes. Never edited by hand, here
  # or anywhere else - that is the practice this script exists to end.
  #
  # `migrate:status` renders its table with box-drawing separators (│, U+2502)
  # and ANSI colour, NOT the ASCII `|` an earlier version grepped for - so that
  # grep matched zero rows on every database and MIGRATIONS_APPLIED was always
  # 0. The cost was hidden until a failure: on_failure then printed "no
  # migration was applied, the database is untouched" and withheld the
  # migrate:down guidance even when a batch HAD been applied - the opposite of
  # what this script exists to tell an operator. Strip the colour, then count
  # rows whose Ran column is exactly "Yes" as a whitespace-delimited field, so
  # the count depends on neither the separator glyph nor the locale. Migration
  # names are timestamped and never equal "Yes".
  ( cd "$APP_DIR" && pnpm --silent payload migrate:status 2>/dev/null \
      | sed -E 's/\x1b\[[0-9;]*m//g' \
      | awk '{ for (i = 1; i <= NF; i++) if ($i == "Yes") { c++; break } } END { print c + 0 }' ) || echo 0
}

on_failure() {
  local code=$?
  [ "$code" = 0 ] && return 0
  printf '\n\033[31m-- failure during: %s --\033[0m\n' "$STAGE" >&2

  if [ "$MIGRATIONS_APPLIED" -gt 0 ]; then
    printf '   %s migration(s) were applied by this release, as ONE batch.\n' "$MIGRATIONS_APPLIED" >&2
    # `migrate:down` reverses the last BATCH, not the last file, and a release's
    # migrations are one batch. So exactly one command undoes exactly this
    # release - asserted in scripts/test-release-ordering.mts rather than
    # assumed, because the other reading (one command per migration) is what an
    # earlier draft of this script told an operator to do.
    printf '   To reverse them:  cd %s && pnpm payload migrate:down    # once, it reverses the batch\n' "$APP_DIR" >&2
    printf '   Do NOT edit payload_migrations by hand. That is what this script exists to end.\n' >&2
    printf '   The backup taken above is the fallback if a down migration itself fails.\n' >&2
  else
    printf '   No migration was applied, so the database is untouched.\n' >&2
  fi

  if [ "$SERVICE_WAS_RUNNING" = 1 ]; then
    printf '   The service was running before this release and is currently STOPPED.\n' >&2
    printf '   To restore the previous version:\n' >&2
    printf '     cd %s && plesk ext git --deploy -domain %s -name %s   # after resetting the bare repo to the previous SHA\n' "$APP_DIR" "$DOMAIN" "$REPO_NAME" >&2
    printf '     pnpm install && pnpm generate:importmap && pnpm build && systemctl start %s\n' "$SERVICE" >&2
  fi
  exit "$code"
}
trap on_failure EXIT

# ---------------------------------------------------------------------------

log "Preflight"
cd "$APP_DIR" || die "app directory $APP_DIR does not exist"
command -v pnpm >/dev/null || die "pnpm is not on PATH"
[ -f package.json ] || die "$APP_DIR does not look like the app (no package.json)"
[ -f .env ] || die "$APP_DIR/.env is missing; the migrator has no database to reach"
if systemctl is-active --quiet "$SERVICE"; then SERVICE_WAS_RUNNING=1; fi
note "app dir      $APP_DIR"
note "service      $SERVICE ($([ "$SERVICE_WAS_RUNNING" = 1 ] && echo running || echo stopped))"
note "health       $HEALTH_URL"
[ "$DRY_RUN" = 1 ] && note "DRY RUN: nothing below will be executed"

log "Backup"
STAGE="backup"
if [ "$DO_BACKUP" = 1 ]; then
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_PATH="$BACKUP_DIR/legalos-$STAMP.sql.gz"
  run "$PG_DUMP -U legalos legalos | gzip > '$BACKUP_PATH'"
  if [ "$DRY_RUN" = 0 ]; then
    SIZE=$(stat -c %s "$BACKUP_PATH" 2>/dev/null || echo 0)
    # A dump under a kilobyte is the pg_dump version mismatch producing an empty
    # file with a zero exit status. An untested backup is a hope; an EMPTY one
    # is worse, because it looks like a backup.
    [ "$SIZE" -gt 1024 ] || die "the backup at $BACKUP_PATH is $SIZE bytes - check LEGALOS_PG_DUMP"
    note "backup       $BACKUP_PATH ($SIZE bytes)"
  fi
else
  note "SKIPPED by --no-backup"
fi

log "Fetch and deploy"
STAGE="fetch/deploy"
# Both, in this order, always. `--deploy` alone redeploys whatever was last
# fetched, which looks exactly like a successful deploy of nothing.
run "plesk ext git --fetch -domain '$DOMAIN' -name '$REPO_NAME'"
run "plesk ext git --deploy -domain '$DOMAIN' -name '$REPO_NAME'"

log "Stop the service"
STAGE="stop"
# BEFORE the build, because the running process holds .next/, and before the
# migration, because this is the window in which the code and the schema are
# allowed to disagree. Nothing serves traffic inside it.
run "systemctl stop '$SERVICE' || true"

log "Install and build"
STAGE="build"
run "pnpm install --frozen-lockfile"
run "pnpm generate:importmap"
run "pnpm build"
note "the build touches no database; a failure here leaves the schema untouched"

log "Migrate"
STAGE="migrate"
if [ "$DRY_RUN" = 0 ]; then MIGRATIONS_BEFORE="$(migration_count)"; fi
run "pnpm payload migrate"
if [ "$DRY_RUN" = 0 ]; then
  MIGRATIONS_AFTER="$(migration_count)"
  MIGRATIONS_APPLIED=$(( MIGRATIONS_AFTER - MIGRATIONS_BEFORE ))
  note "applied      $MIGRATIONS_APPLIED (ledger $MIGRATIONS_BEFORE -> $MIGRATIONS_AFTER)"
fi

log "Verify the schema against the code"
STAGE="verify"
# The step the previous release did not have. Reads one row from every
# collection and every global - exactly what a boot does - so a mismatch stops
# the release here instead of taking the service down when it starts.
run "pnpm verify:schema"

log "Start the service"
STAGE="start"
run "systemctl start '$SERVICE'"

log "Health check"
STAGE="health"
if [ "$DRY_RUN" = 0 ]; then
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      note "healthy after ${attempt}s"
      break
    fi
    [ "$attempt" = 30 ] && die "the service did not answer $HEALTH_URL within 30s"
    sleep 1
  done
  systemctl is-active --quiet "$SERVICE" || die "$SERVICE is not active"
fi

trap - EXIT
log "Released"
note "service      $(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)"
[ "$DO_BACKUP" = 1 ] && [ "$DRY_RUN" = 0 ] && note "backup       ${BACKUP_PATH:-none}"
note "Hard-refresh the browser: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)"
