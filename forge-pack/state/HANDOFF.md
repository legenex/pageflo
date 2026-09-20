# Handoff

Current phase: Wave 03 in progress.
Current unit: W30 import cutover started. Next: W31 LP/Advertorial fidelity, then W32.
Last verified state: `044c25a` plus pending W30 commit. `pnpm build` passed. typecheck pass. WordPress import mapper 6 passed.
Known failure: TLS for app.pageflo.io UNPROVEN (SSH denied). Wildcard preview TLS needs `_acme-challenge.preview.pageflo.io` CNAME (DNS gate).
Next action: W31 landing page / advertorial structural fidelity. Host certs when SSH exists via scripts/provision-pageflo-hosts.sh. Do not flip PAGEFLO_LEGACY_HOST_REDIRECT.
Important files: `src/lib/pageflo/hosts.ts`, `src/lib/site-resolver.ts`, `scripts/provision-pageflo-hosts.sh`, `src/lib/site-builder/sections.ts`.
