# Human path

The operator has asked not to be interrupted. Therefore human-only work should be deferred until it is truly unavoidable.

## Potential red gates

### HP-01 New DNS for `*.preview.pageflo.io`
Only required if current DNS is not already configured and Grok cannot perform the change under existing authorized mechanisms. Application support must still be completed first.

### HP-02 Missing production credential
Only if a required already-approved integration cannot be verified because credentials are absent. Do not ask for credentials early. Complete code using safe test adapters/fixtures and record the exact missing secret name and purpose.

### HP-03 Destructive production migration
Avoid by designing backwards-compatible migrations. If genuinely unavoidable, stop that migration and complete all other work.

### HP-04 Unknown external Lead destination activation
Do not send real Leads to a new buyer/destination not already approved. Generic webhook support and test delivery can be completed without activation.

## Operator interruption policy

Do not message the operator mid-run for these. Record them and continue. Escalate only when no critical-path work remains that can proceed safely.
