# Handoff

Current phase: Wave 02/04 domain work in progress.
Current unit: W20 website snapshot + W42 PageFlo preview hosts implemented in repo. TLS for app.pageflo.io UNPROVEN from this Codespace.
Last verified state: W22 `e7599d4`. typecheck pass. test:release 31. test:rebrand 38. test:certs 50. test:trusted-host 47. test:preview-hosts 12. test:site-builder 10. check:paths 0 unresolved.
Known failure: no SSH key to 51.81.202.161 (Permission denied publickey). PLESK_API_KEY empty in this env. HTTPS for app.pageflo.io / preview.pageflo.io presents crashclaim.co. os.legenex.com health 200. test.preview.legenex.com TLS valid. Wildcard TLS for *.preview.pageflo.io needs `_acme-challenge.preview.pageflo.io` CNAME (DNS gate).
Next action: run `scripts/provision-pageflo-hosts.sh` as root on the Plesk host once SSH exists. Then W30 import/AI editing. Do not flip PAGEFLO_LEGACY_HOST_REDIRECT.
Important files: `src/lib/pageflo/hosts.ts`, `src/lib/site-resolver.ts`, `scripts/provision-pageflo-hosts.sh`, `src/lib/site-builder/sections.ts`.
