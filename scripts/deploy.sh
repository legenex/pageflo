#!/usr/bin/env bash
#
# ===========================================================================
# RETIRED - DO NOT RUN. Kept as historical reference only.
# ===========================================================================
#
# This script belongs to the Docker Compose + cron deploy model that PageFlo
# (still named LegalOS in code) stopped using. Nothing invokes it: there is no
# deploy cron on the host, no /var/log/legalos-deploy.log, no Plesk deployment
# action pointing here, and the `app` service in docker-compose.yml has not run
# for months. It also targets `mo.legenex.com`, which is no longer a Plesk
# domain.
#
# Running it against production would try to build and start the retired app
# container against the live database, on a host that also runs Buzz and
# Hermes. That is why it refuses rather than merely warning.
#
# The current release path is `scripts/release.sh` after a Plesk fetch and
# deploy. See AGENTS.md section 6 and docs/release-runbook.md.
#
# Retained rather than deleted because these four scripts are the only written
# record of how the previous deployment model worked, which phase 9 needs when
# it rebuilds host bring-up. See docs/EXECUTION-PLAN.md.

if [ "${LEGALOS_ALLOW_RETIRED_SCRIPT:-}" != "1" ]; then
  echo "REFUSED: this script is retired. See AGENTS.md section 6 for the current release path." >&2
  echo "         Override only for archaeology: LEGALOS_ALLOW_RETIRED_SCRIPT=1" >&2
  exit 78
fi
# Plesk Git extension runs this as the "Additional deployment actions" command
# after every pull. Idempotent. Safe to run repeatedly.
#
# Setup in Plesk: Websites & Domains → mo.legenex.com → Git → Deploy actions:
#   bash scripts/deploy.sh
#
# Plesk's git deploy runner uses an extremely stripped-down environment with no
# PATH and no access to standard coreutils (dirname, date, etc.). This script
# avoids all external command dependencies in its bootstrap by using only bash
# built-ins, then explicitly sets PATH before invoking docker / curl / etc.

# 1. Restore PATH so docker, curl, git, etc. work.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

set -euo pipefail

# 2. Resolve project root using bash parameter expansion (no `dirname` call).
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
cd "$SCRIPT_DIR/.."
PROJECT_DIR="$PWD"

# 3. Timestamped log helper using bash printf %()T (no `date` call).
log() {
  local ts
  printf -v ts '%(%H:%M:%S)T' -1 2>/dev/null || ts="--:--:--"
  echo "[deploy $ts] $*"
}

log "Project root: $PROJECT_DIR"

# Single-flight guard. If a previous deploy is still running, bail.
LOCK_FILE="/tmp/legalos-deploy.lock"
if [ -f "$LOCK_FILE" ] && kill -0 "$(cat "$LOCK_FILE")" 2>/dev/null; then
  log "another deploy is in progress (PID $(cat "$LOCK_FILE")). Exiting."
  exit 0
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Stamp the current commit SHA so the admin UI footer + /admin/system can
# report what's running. The SHA is passed into the Docker build as an arg
# (see docker-compose.yml + Dockerfile) so the image carries it as an env var.
#
# On Plesk the work tree has no .git directory — the bare repo lives at
# ../git/<repo>.git and checkouts use `git --work-tree=...`. We resolve the
# git dir in this order so the same script works locally and on Plesk:
#   1. .git in the work tree (normal local checkout)
#   2. $GIT_DIR env var (if Plesk's git extension sets it during deploy)
#   3. ../git/*.git (Plesk's bare-repo convention)
resolve_git_dir() {
  if [ -d .git ]; then echo .git; return; fi
  if [ -n "${GIT_DIR:-}" ] && [ -d "$GIT_DIR" ]; then echo "$GIT_DIR"; return; fi
  for d in ../git/*.git; do
    if [ -d "$d" ]; then echo "$d"; return; fi
  done
}
GIT_DIR_RESOLVED="$(resolve_git_dir || true)"
if [ -n "$GIT_DIR_RESOLVED" ]; then
  git --git-dir="$GIT_DIR_RESOLVED" rev-parse HEAD > .git-sha 2>/dev/null || true
  log "Stamped .git-sha: $(head -c 12 .git-sha 2>/dev/null) (from $GIT_DIR_RESOLVED)"
else
  log "WARN: could not locate a git dir — version pill will fall back to 'unknown'"
fi
export LEGALOS_GIT_SHA="$(cat .git-sha 2>/dev/null || echo unknown)"
if [ -n "$GIT_DIR_RESOLVED" ]; then
  LEGALOS_BUILD_NUMBER="$(git --git-dir="$GIT_DIR_RESOLVED" rev-list --count HEAD 2>/dev/null || echo 0)"
else
  LEGALOS_BUILD_NUMBER=0
fi
export LEGALOS_BUILD_NUMBER
printf -v LEGALOS_BUILD_TIME '%(%Y-%m-%dT%H:%M:%SZ)T' -1 2>/dev/null || LEGALOS_BUILD_TIME="unknown"
export LEGALOS_BUILD_TIME

if [ ! -f .env ]; then
  log "ERROR: .env is missing. Copy .env.example to .env and fill in production values before re-running."
  exit 1
fi

# Quick sanity check that critical env vars are set.
required_vars=(PAYLOAD_SECRET DATABASE_URI NEXT_PUBLIC_SERVER_URL LEGALOS_FALLBACK_HOST)
missing=()
for v in "${required_vars[@]}"; do
  if ! grep -qE "^${v}=.+" .env; then
    missing+=("$v")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  log "ERROR: required env vars missing or empty in .env: ${missing[*]}"
  exit 1
fi

# Reject placeholder values anywhere in .env. A half-filled PLESK_API_URL (e.g.
# 'https://<your-server-ip>:8443') silently breaks tenant-domain provisioning
# while the app boots fine — exactly the failure mode this guard prevents.
# Patterns matched: <...> angle-bracket placeholders, CHANGEME / CHANGE-ME,
# 'paste here' / 'paste-here', and uppercase TODO/FIXME markers in values.
placeholder_lines="$(grep -nE '^[A-Z_][A-Z_0-9]*=.*(<[^>]+>|CHANGE[-_ ]?ME|paste[- ]?here|TODO|FIXME)' .env || true)"
if [ -n "$placeholder_lines" ]; then
  log "ERROR: placeholder values left in .env — replace with real values or leave blank:"
  printf '%s\n' "$placeholder_lines" | while IFS= read -r line; do log "  $line"; done
  exit 1
fi

# Build + restart. Docker handles incremental rebuilds via layer cache.
log "Building app image..."
docker compose build app

log "Starting / restarting containers..."
docker compose up -d --remove-orphans

# Apply any new migrations before the app starts serving traffic.
# Idempotent: payload migrate tracks applied migrations in payload_migrations.
log "Running database migrations..."
docker compose exec -T app pnpm payload migrate || {
  log "✗ migrate failed. Tailing logs..."
  docker compose logs --tail=50 app
  exit 1
}

# Wait for app to be healthy before declaring success.
log "Waiting for app on 127.0.0.1:3000..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:3000/; then
    log "✓ app responding (took ${i}s)"
    break
  fi
  if [ "$i" = "30" ]; then
    log "✗ app did not respond within 30s. Tailing logs..."
    docker compose logs --tail=50 app
    exit 1
  fi
  sleep 1
done

# Prune dangling images so disk doesn't fill up over months.
log "Pruning old images (>24h, untagged)..."
docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true

log "✓ deploy complete. Visit https://mo.legenex.com/admin"
