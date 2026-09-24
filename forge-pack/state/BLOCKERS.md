# Blockers

## B-W42-01 TLS for app.pageflo.io and preview.pageflo.io (host access)

Status: closed 2026-09-20 on GX10-01. `scripts/provision-pageflo-hosts.sh` issued HTTP-01 for `pageflo.io`+`www.pageflo.io` and `app.pageflo.io`, DNS-01 for `*.preview.pageflo.io` using the live preview.legenex.com acme-dns account. Live SAN includes `*.preview.pageflo.io`. `test.preview.legenex.com` remains valid. Crashclaim remains default SNI.

## B-W42-02 Wildcard TLS `*.preview.pageflo.io` DNS-01 CNAME

Status: closed 2026-09-20. Google DNS shows `_acme-challenge.preview.pageflo.io` CNAME `7bd5dcb7-ec33-4647-af4e-042ab69c40b9.auth.acme-dns.io.`, matching `preview.legenex.com`. Host-side issuance completed under B-W42-01.

## B-W00-01 Production SSH from this Codespace (not a red gate)

Status: closed 2026-09-20. Work resumed on GX10-01 (`hostname gx10-01`, user `legenex`, `CODESPACES` empty). `ssh pageflo` as root works. Ordinary Plesk release of `b54e8bd` is live.

## B-W00-02 `app.pageflo.io` DNS from this environment

Status: closed 2026-09-20. All listed PageFlo names resolve to `51.81.202.161`. TLS issued, see B-W42-01.

## B-RESCUE-01 Production super-admin password drift

Status: open. Human gate. `SUPER_ADMIN_PASSWORD` in `/var/www/vhosts/legenex.com/os.legenex.com/.env` does not match the stored hash for `team@legenex.com`. REST login 401. Five failures lock the row. Capture super-admin still works. Do not rotate from an agent. Operator must reset `team@legenex.com` through an approved credential change.

## Standing, not V1

- Legal publication facts for marketing `/privacy` (business decision).
- EB-1 MVA tier lookup service.
- Unversioned `/usr/local/bin/legalos-warm.sh`.
- Do not set `PAGEFLO_LEGACY_HOST_REDIRECT`.
