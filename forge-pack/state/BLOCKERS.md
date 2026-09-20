# Blockers

## B-W42-01 TLS for app.pageflo.io and preview.pageflo.io (host access)

Status: open. DNS is proven. TLS is not.

Evidence 2026-09-20: `app.pageflo.io`, `pageflo.io`, `preview.pageflo.io`, `test.preview.pageflo.io` resolve to `51.81.202.161`. `curl https://app.pageflo.io` fails certificate name mismatch (SNI presents `crashclaim.co`). `https://os.legenex.com/api/legalos/health` 200. `https://test.preview.legenex.com` TLS valid.

Tried: `ssh root@51.81.202.161` BatchMode, Permission denied (publickey). No `legalos` alias, no `legalos_deploy` key, PLESK_API_KEY empty.

Repair: run `scripts/provision-pageflo-hosts.sh` as root on the Plesk host. HTTP-01 can cover `pageflo.io`, `www.pageflo.io`, `app.pageflo.io`, `preview.pageflo.io`, `test.preview.pageflo.io`.

## B-W42-02 Wildcard TLS `*.preview.pageflo.io` needs DNS-01 CNAME (human gate)

Status: open, red gate.

Wildcard issuance needs `_acme-challenge.preview.pageflo.io` CNAME to acme-dns, matching `preview.legenex.com`. Operator created A records only. Do not add DNS records from this agent.

Until then, Brand preview on `{slug}.preview.pageflo.io` can resolve in the app (alias to existing legenex rows) but browsers will reject TLS.

## B-W00-01 Production SSH from this Codespace (not a red gate)

Status: open, non-blocking for W00. Blocks later ordinary Plesk releases until repaired.

Evidence: `ssh legalos` failed with `Could not resolve hostname legalos`. No `~/.ssh/config` in this Codespace. Host-level `systemctl` / `journalctl` inspection is UNPROVEN.

Public check that did run: `https://os.legenex.com/api/legalos/health` returned 200 `{"ok":true,"app":"legalos"}` on 2026-09-19.

Tried: `legalos` SSH alias as documented in `CLAUDE.md`.

Not a human interruption. Continue application work. Record UNPROVEN rather than claiming a production release.

## B-W00-02 `app.pageflo.io` DNS from this environment

Status: closed 2026-09-20. All listed PageFlo names resolve to `51.81.202.161`. Remaining gap is TLS, see B-W42-01.
