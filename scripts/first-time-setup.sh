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
# Run ONCE on the Plesk server, after the very first git pull. Brings up the
# stack, waits for Postgres, and runs the seed.
#
# Usage on the server:
#   cd /path/to/project
#   bash scripts/first-time-setup.sh

# Set PATH explicitly so this works even when invoked from Plesk's stripped
# deploy runner (no PATH inherited).
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

log() { echo "[setup $(date -u +%H:%M:%S)] $*"; }

if [ ! -f .env ]; then
  log "ERROR: .env is missing. Copy .env.example to .env and fill in production values first."
  log "  cp .env.example .env"
  log "  nano .env"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: Docker is not installed on this host."
  log "Install with: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

log "Building images..."
docker compose build

log "Starting containers..."
docker compose up -d

log "Waiting for Postgres..."
for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-legalos}" >/dev/null 2>&1; then
    log "✓ Postgres ready"
    break
  fi
  if [ "$i" = "60" ]; then
    log "✗ Postgres did not come up in 60s. Check 'docker compose logs postgres'."
    exit 1
  fi
  sleep 1
done

log "Running database migrations (creates tables on a fresh DB)..."
docker compose exec -T app pnpm payload migrate

log "Waiting for app on 127.0.0.1:3000..."
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:3000/; then
    log "✓ app responding (took ${i}s)"
    break
  fi
  if [ "$i" = "60" ]; then
    log "✗ app did not start. Logs:"
    docker compose logs --tail=80 app
    exit 1
  fi
  sleep 1
done

log "Seeding initial templates + Sites..."
docker compose exec -T app pnpm seed

log "✓ first-time setup complete."
log ""
log "Next steps:"
log "  1. In Plesk, ensure mo.legenex.com reverse-proxies to http://127.0.0.1:3000"
log "  2. Visit https://mo.legenex.com/cms/login and log in with SUPER_ADMIN_EMAIL"
log "  3. In Plesk Git extension, set scripts/deploy.sh as the deployment action"
log "     so future pushes auto-deploy without re-running this script."
