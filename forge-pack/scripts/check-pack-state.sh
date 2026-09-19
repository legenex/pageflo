#!/usr/bin/env bash
set -euo pipefail
required=(
  "forge-pack/00-intake/DISCOVERY.md"
  "forge-pack/01-product/REQUIREMENTS.md"
  "forge-pack/03-plan/WORK-UNITS.yaml"
  "forge-pack/05-execution/STALL-POLICY.md"
  "forge-pack/06-qa/ACCEPTANCE-MATRIX.md"
  "forge-pack/state/HANDOFF.md"
)
for f in "${required[@]}"; do
  test -s "$f" || { echo "missing or empty: $f"; exit 1; }
done
echo "forge pack state: OK"
