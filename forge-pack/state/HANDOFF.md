# Handoff

Current phase: Wave 04. W40 complete in repo. Next: W41 bulk deploy and preview routing.
Last verified HEAD: W40 Brand auto-reskin (Check A Case vs Don't Settle; deployment copy ignored at render).
Tests run: `pnpm test:brand-reskin` 19 passed. `pnpm typecheck` pass. `pnpm test:publish` 245 passed, 1 failed (pre-existing site-resolver regex, not W40).
Known blockers: this session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, not GX10-01. `ssh pageflo` fails: `~/.ssh/pageflo_deploy` absent. Production TLS for `app.pageflo.io` and `*.preview.pageflo.io` still presents `crashclaim.co`. ACME CNAME is live.
Production: `https://os.legenex.com/api/legalos/health` 200. No PageFlo work released this session. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Next action: W41 bulk multi-brand deploy with isolated failures and preview URL per deployment. When SSH exists, provision certs then Plesk release of W31-W40.
Important files: `src/lib/lp-deployment.ts`, `src/lib/master-safety.ts`, `src/seed/sites.ts`, `scripts/provision-pageflo-hosts.sh`.
