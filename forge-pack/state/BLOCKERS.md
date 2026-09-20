# Blockers

## B-W42-01 TLS for app.pageflo.io and preview.pageflo.io (host access)

Status: open. DNS is proven. ACME CNAME is proven. TLS is not. Not a human gate; blocked only by missing SSH key in this environment. The host script on main is now safe to run once SSH exists.

Evidence 2026-09-20: `pageflo.io`, `www.pageflo.io`, `app.pageflo.io`, `preview.pageflo.io`, `test.preview.pageflo.io`, `testbrand.preview.pageflo.io`, `random-check.preview.pageflo.io` resolve to `51.81.202.161`. HTTPS SNI still presents `crashclaim.co`. `https://os.legenex.com/api/legalos/health` 200.

Repair: from GX10-01, `ssh pageflo` as root, after Plesk fetch/deploy of current main, run `scripts/provision-pageflo-hosts.sh`. HTTP-01 for apex/www/app. DNS-01 via existing acme-dns for `preview.pageflo.io` and `*.preview.pageflo.io`. Confirm the issued cert SAN contains `*.preview.pageflo.io` using an arbitrary hostname, not only `test.preview.pageflo.io`.

## B-W42-02 Wildcard TLS `*.preview.pageflo.io` DNS-01 CNAME

Status: closed 2026-09-20. Google DNS shows `_acme-challenge.preview.pageflo.io` CNAME `7bd5dcb7-ec33-4647-af4e-042ab69c40b9.auth.acme-dns.io.`, matching `preview.legenex.com`. Remaining work is host-side issuance, see B-W42-01.

## B-W00-01 Production SSH from this Codespace (not a red gate)

Status: open. This session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, hostname `codespaces-d8809b`, user `codespace`, not GX10-01. `~/.ssh/config` has Host `pageflo` pointing at `IdentityFile ~/.ssh/pageflo_deploy`, but that key file is absent. `ssh -o BatchMode=yes pageflo` returns Permission denied (publickey). No SSH agent. `CODESPACES=true`.

Blocks ordinary Plesk releases and host cert provisioning until this work runs on GX10-01, where the key is configured. Continue application work. Record UNPROVEN rather than claiming a production release.

Public check that did run: `https://os.legenex.com/api/legalos/health` returned 200 `{"ok":true,"app":"legalos"}` on 2026-09-20.

## B-W00-02 `app.pageflo.io` DNS from this environment

Status: closed 2026-09-20. All listed PageFlo names resolve to `51.81.202.161`. Remaining gap is TLS, see B-W42-01.
