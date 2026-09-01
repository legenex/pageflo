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
# Plesk Git deploy hook. This is the script Plesk's "Additional deployment actions"
# field invokes. Plesk's git deploy runs in a chroot without docker, so we cannot
# do the actual work here. Instead, drop a flag file that the root cron job
# watches, and return immediately.
#
# Setup:
#   1. Plesk → mo.legenex.com → Git → Repository Settings → Deploy actions:
#        bash scripts/trigger-deploy.sh
#   2. As root, add a cron entry that runs scripts/cron-deploy.sh every minute
#      (see scripts/cron-deploy.sh header for the exact command).

# Use bash redirection (built-in, no external `touch` needed).
: > /tmp/legalos-deploy.flag 2>/dev/null || true

# Bash printf is a builtin and works without coreutils being on PATH.
printf '[trigger] deploy queued for cron pickup (PID %s)\n' "$$"
