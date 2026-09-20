# Handoff

Current phase: Wave 04. W41 complete in repo. Next: W43 Leads UI (W42 application support already landed).
Last verified HEAD: W41 bulk multi-brand draft deploy with isolated failures and preview.pageflo.io URLs.
Tests run: `pnpm test:bulk-deploy` 15 passed. `pnpm typecheck` pass.
Known blockers: this session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, not GX10-01. `ssh pageflo` fails: `~/.ssh/pageflo_deploy` absent. Production TLS for `app.pageflo.io` and `*.preview.pageflo.io` still presents `crashclaim.co`. ACME CNAME is live.
Production: `https://os.legenex.com/api/legalos/health` 200. No PageFlo work released this session. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Next action: W43 Leads UI and delivery observability. When SSH exists, provision certs then Plesk release of W31-W41.
Important files: `src/lib/bulk-deploy.ts`, `src/app/(app)/admin/(top)/deployments/actions.ts`, `scripts/provision-pageflo-hosts.sh`.
