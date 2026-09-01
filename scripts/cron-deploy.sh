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
# Root cron job. Watches for /tmp/legalos-deploy.flag (created by Plesk's git
# deploy hook via scripts/trigger-deploy.sh). When the flag exists, removes it
# and runs the real deploy.
#
# Install (one-time, run as root on the server):
#   crontab -e
# Add this line (runs every minute, only does work when the flag exists):
#   * * * * * /var/www/vhosts/legenex.com/mo.legenex.com/scripts/cron-deploy.sh
#
# Logs to /var/log/legalos-deploy.log. View with:
#   tail -f /var/log/legalos-deploy.log

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

FLAG=/tmp/legalos-deploy.flag
LOG=/var/log/legalos-deploy.log
PROJECT_DIR=/var/www/vhosts/legenex.com/mo.legenex.com

# Quick exit if no work to do — keeps cron silent 99% of the time.
[ -f "$FLAG" ] || exit 0

# Atomically claim the flag so concurrent cron runs don't double-deploy.
LOCK_DIR=/tmp/legalos-deploy.lock
mkdir "$LOCK_DIR" 2>/dev/null || exit 0
trap 'rmdir "$LOCK_DIR"' EXIT

rm -f "$FLAG"

cd "$PROJECT_DIR"

{
  echo ""
  echo "===================================================================="
  echo "Cron deploy run at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "===================================================================="
  bash scripts/deploy.sh
  echo "Exit: $?"
} >> "$LOG" 2>&1
