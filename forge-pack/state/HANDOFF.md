# Handoff

Current phase: Wave 05. W43 complete in repo. Next: W50 end-to-end integration.
Last verified HEAD: W43 Leads UI plus lead-delivery worker started from Next instrumentation.
Tests run: `pnpm test:leads-ui` 16 passed. `pnpm typecheck` pass.
Known blockers: this session is GitHub Codespace `symmetrical-guide-5g75r9vw9xxcvrr6`, not GX10-01. `ssh pageflo` fails: `~/.ssh/pageflo_deploy` absent. Production TLS for `app.pageflo.io` and `*.preview.pageflo.io` still presents `crashclaim.co`. ACME CNAME is live. REDIS_URL must be set in production `.env` for the queue worker to attach; if empty, enqueue returns unavailable and in-request delivery still runs.
Production: `https://os.legenex.com/api/legalos/health` 200. No PageFlo work released this session. Do not flip `PAGEFLO_LEGACY_HOST_REDIRECT`.
Next action: W50 migration compatibility and e2e. When SSH exists, provision certs, confirm REDIS_URL is set, then Plesk release of W31-W43.
Important files: `src/instrumentation.ts`, `src/workers/lead-delivery.ts`, `scripts/provision-pageflo-hosts.sh`.
