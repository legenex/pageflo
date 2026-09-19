# Blockers

## B-W00-01 Production SSH from this Codespace (not a red gate)

Status: open, non-blocking for W00. Blocks later ordinary Plesk releases until repaired.

Evidence: `ssh legalos` failed with `Could not resolve hostname legalos`. No `~/.ssh/config` in this Codespace. Host-level `systemctl` / `journalctl` inspection is UNPROVEN.

Public check that did run: `https://os.legenex.com/api/legalos/health` returned 200 `{"ok":true,"app":"legalos"}` on 2026-09-19.

Tried: `legalos` SSH alias as documented in `CLAUDE.md`.

Not a human interruption. Continue application work. Record UNPROVEN rather than claiming a production release.

## B-W00-02 `app.pageflo.io` DNS from this environment (not a red gate)

Status: open, observational.

Evidence: `curl https://app.pageflo.io/api/pageflo/health` failed with `Could not resolve host: app.pageflo.io`. `pageflo.io` resolved to `192.64.119.75`, not `51.81.202.161`. `os.legenex.com` resolved to `51.81.202.161` and served health.

Do not perform a DNS change. Application support for `app.pageflo.io` remains. Verify from a resolver that can see the record before claiming app-host health.
