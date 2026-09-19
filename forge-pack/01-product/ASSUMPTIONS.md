# Explicit assumptions

These are permitted planning assumptions, not verified implementation facts. Grok should verify them during Wave 00 and update this file if needed.

1. Current `Site` remains the persistence boundary for Brand to minimize migration risk.
2. Existing Brand Kit data can be folded into the Brand/Site operator experience without destructive removal of compatibility fields.
3. Existing template records and master asset collections can be evolved rather than replaced wholesale.
4. WordPress/Base44 import can be implemented first through public URL/HTML ingestion plus asset capture; direct CMS API credentials are not required for V1 unless already present and useful.
5. Existing `bullmq`/`ioredis` dependencies can support Lead delivery queueing if Redis topology and production persistence are suitable.
6. Existing release script remains the only supported production release path.
7. Existing LegalOS compatibility identifiers should remain until a separate migration proves they are no longer load-bearing.
8. `preview.pageflo.io` application support can be implemented independently of DNS change. If DNS is not already delegated, the code can still be completed and the DNS action recorded as a red-gate blocker.
9. Existing analytics and Campaign Integrity routes may remain honest Coming Soon surfaces if present in the redesign, but they are not implementation targets for this phase.
