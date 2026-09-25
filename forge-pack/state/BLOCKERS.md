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

Status: closed 2026-09-24. Operator authorized a Payload-supported reset of the existing `team@legenex.com` account. Login at `https://app.pageflo.io` succeeded. Temporary credentials are in `/home/legenex/.pageflo-admin-credentials` (mode 600). The production `.env` `SUPER_ADMIN_PASSWORD` was not rewritten.

## B-RESCUE-02 Custom hostname TLS (public DNS)

Status: human-gated 2026-09-25. Application Add Domain, pending labels, and DNS instruction copy are in the product. No custom hostname currently serves because unmatched SNI remains crashclaim.co and no customer A/CNAME has been authorized.

If a real custom-domain proof is required later:

What: create one DNS record for a Legenex-owned unused hostname
Where: the DNS host for that zone (not crashclaim default SNI)
Current: no PageFlo custom `domains` row with `ssl_status=active`
Required: CNAME `<hostname>` → `os.legenex.com` (current `LEGALOS_CNAME_TARGET`) OR A `<hostname>` → `51.81.202.161`
Why: REG-P0-010 end-to-end TLS handshake; application verification already exists
Expected after: Domains row moves pending → verified → ssl_status active after poller handshake; Brand can bind the hostname
Rollback: delete the DNS record; detach the Domains row in PageFlo; unmatched SNI stays crashclaim.co
Do not change default SNI or `PAGEFLO_LEGACY_HOST_REDIRECT`.

## Standing, not V1

- Legal publication facts for marketing `/privacy` (business decision).
- EB-1 MVA tier lookup service.
- Unversioned `/usr/local/bin/legalos-warm.sh`.
- Do not set `PAGEFLO_LEGACY_HOST_REDIRECT`.
