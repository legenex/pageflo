# Operations and release

## Current boundary

Keep production on the current Plesk host for this phase.

## Repository flow

```text
Codespace -> validate -> commit -> push main -> Plesk fetch/deploy -> scripts/release.sh -> verify
```

Do not SSH-edit production application source.

## Existing release path

Use the repository-documented release sequence only:

```bash
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```

The operator has authorized ordinary releases during this completion run once gates pass.

## Before every release

- cleanly identify the commit being released
- required tests pass
- production migration is safe and included with schema changes
- no secrets staged
- `git diff --check` on the release change
- backup/release script preconditions intact
- no red-gate action is hidden in the release

## After release

- service active
- PageFlo health endpoint 200
- legacy health endpoint remains healthy while compatibility host is required
- changed public/operator surface verified
- real data paths use real data or honest empty states
- record release evidence in `state/EVIDENCE.md`

## Rollback

Use repo-documented revert/release procedure. Do not hand-edit migration ledgers or production schema to make a failed release look successful.
