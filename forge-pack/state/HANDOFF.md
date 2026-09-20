# Handoff

Current phase: Wave 03. W31 complete in repo. Next: W32 Master Quiz builder/runtime, then W40.
Last verified HEAD after this unit: see `git rev-parse HEAD` (W31 public advertorial renderer, not yet released).
Tests run: `pnpm test:lp-advertorial-fidelity` 22 passed, 0 failed. `pnpm typecheck` pass. `pnpm test:publish` 245 passed, 1 failed (pre-existing source regex in site-resolver, not caused by W31).
Known blockers: this session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, not GX10-01. `ssh pageflo` fails: `~/.ssh/pageflo_deploy` is absent. Production TLS for `app.pageflo.io` and `*.preview.pageflo.io` still presents `crashclaim.co`.
Production: `https://os.legenex.com/api/legalos/health` 200 `{"ok":true,"app":"legalos"}`. DNS A records for pageflo.io / app / preview / wildcard names point at `51.81.202.161`. `_acme-challenge.preview.pageflo.io` CNAME to `7bd5dcb7-ec33-4647-af4e-042ab69c40b9.auth.acme-dns.io.` is live. Host issuance still needs SSH as root and `scripts/provision-pageflo-hosts.sh`. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Next action: W32 quiz builder/runtime completion. When SSH exists, run provision script, prove app.pageflo.io health 200, prove `*.preview.pageflo.io` SAN, then ordinary Plesk release of W31+.
Important files: `src/lib/advertorial-deployment.ts`, `src/components/public/advertorial/AdvertorialRuntime.tsx`, `src/lib/advertorial-templates.ts`, `scripts/provision-pageflo-hosts.sh`.
