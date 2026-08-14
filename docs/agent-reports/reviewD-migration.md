# Reviewer D — Migration / Bootstrap / Release adversary

Branch `claude/legalos-final-integration-gvvtr8` @ 69724ff. Local PG16.13.
29 migration files in `src/migrations/` (index.ts = 29-entry cross-check mirror).
Scratch DBs used: revd_fresh, revd_prod, revd_ui, revd_partial, revd_relbase — all DROPPED at end.
`upg_rel`/`upg_ui` left untouched (not mine). Main `legalos` DB never written (one read-only SELECT on its ledger, item 3).

Verdict: **10 PASS, 1 PASS-with-caveat. Two findings surfaced (neither blocks the happy-path release; neither needs manual SQL to complete a normal release or its documented single-batch rollback).**

---

## 1. Empty PG16 → full chain — PASS
```
CREATE DATABASE revd_fresh OWNER legalos
DATABASE_URI=.../revd_fresh NODE_ENV=production pnpm payload migrate  -> Done. (29 migrated)
psql ... SELECT count(*) FROM payload_migrations                     -> 29
pnpm verify:schema  -> schema OK: 25 collections and 1 globals read cleanly   (exit 0)
```
- 25 collections confirmed (matches task's "25 collections read").
- `pnpm generate:types` against revd_fresh: file includes `'funnel-quiz-templates': FunnelQuizTemplate`,
  the locked-docs rel (`relationTo: 'funnel-quiz-templates'`), new LP fields (`is_enabled`/`origin`/
  `stock_key`/`archived_at`/`slot_overrides`/`destination_overrides`), and `funnel_samples_seeded` /
  `funnel_advertorial_samples_seeded` on integration_config.
- Generated file was **byte-identical** to the committed `src/payload-types.ts` (md5 `e7e0727c…` before and
  after) — the migration-only schema produces exactly the types the code already ships. No restore needed;
  file is gitignored.

## 2. Production-equivalent schema upgrade — PASS
Automated: `pnpm test:release` -> **28 passed, 0 failed** (builds previous schema via LEGALOS_MIGRATION_DIR
minus the 4 release migrations, proves new code fails verify at old schema, migrates, re-verifies, re-runs
no-op, migrate:down reverses the batch, rolls forward, asserts ledger written by migrator only).
Manual confirmation on revd_prod:
```
migrate (prev dir, 25 files)      -> ledger 25
pnpm verify:schema                -> SCHEMA MISMATCH: 5 of 26 reads failed
                                     (funnel-quiz-templates, payload-locked-documents, integration-config)  exit 1
migrate (full src/migrations)     -> applies 210000/213000/220000/230000 -> ledger 29
pnpm verify:schema                -> schema OK: 25 collections and 1 globals   exit 0
```
No manual SQL.

## 3. Release/UI-era + orphan ledger row — PASS (forward), with a latent deep-rollback caveat
Built ui-era DB (base 25 + template_records renamed to old `20260813_210000_template_records`), migrated it
so the ledger recorded the **old name** (batch 1), then ran the integrated chain:
```
migrate (integrated)  -> 210000_funnel_rels, 213000, 220000_template_records (RE-RUN idempotently), 230000  Done
pnpm verify:schema    -> schema OK   exit 0
ledger: 30 rows = old-name orphan (batch1) + new-name 220000 (batch2), both coexist
```
The renamed `220000_template_records` re-runs cleanly (idempotent DDL) and converges. The orphan does NOT
break forward migrate, verify, or the release's own single-batch rollback (down#1 of batch 2 = clean, exit 0).

CAVEAT (latent, non-blocking): a **second** `migrate:down` (reaching batch 1, which holds the orphan) fails:
```
Rolling back batch 1 consisting of 26 migration(s).
Error: Migration 20260813_210000_template_records not found locally.   exit 1  (ledger untouched — atomic abort)
```
Payload aborts the whole batch-down when a ledger name has no matching file (renamed to 220000). This only
bites a deep multi-batch rollback that reverses ~26 migrations — something no release or documented rollback
performs. **The real main `legalos` ledger has NO orphan** (it recorded `20260813_220000_template_records`
directly), so this requires a DB that literally deployed the ui-branch's old-named file. Recovery is
roll-forward (no manual SQL); only a deep rollback would need a manual ledger delete.

## 4. Partial migration then resume — PASS
```
migrate (first 20 files via LEGALOS_MIGRATION_DIR) -> ledger 20
migrate (full chain)                               -> applies remaining 9 -> ledger 29
pnpm verify:schema -> schema OK   exit 0
```
Each migration is recorded individually; resume picks up exactly where it stopped.

## 5. Repeated migration — PASS
- `pnpm payload migrate` a 2nd time on fully-migrated revd_fresh -> `Done.`, ledger stays 29 (clean no-op).
- Re-ran each of the 4 new migrations' `up()` a 2nd time directly against the migrated DB (bypassing ledger
  guard) via a probe calling `up({ db: payload.db.drizzle, ... })`: all 4 -> no error (IF NOT EXISTS /
  DO-block guards hold).

## 6. Rollback — PASS (both audit-down branches + authored-row preservation)
On revd_prod (release migrations = batch 2), `pnpm payload migrate:down` reverses exactly the 4 (exit 0):
- **6A, no NULL-author row:** authored `funnel_landing_pages` row **survived** the template_records down;
  `funnel_quiz_templates` dropped, `is_enabled` col dropped, locked-rels funnel cols -> 0,
  `audit_log.user_id` **restored to NOT NULL**; verify:schema then FAILS (correct). Roll forward -> OK.
- **6B, NULL-author row present:** audit down **keeps user_id nullable (YES)**, does NOT error, NULL-author
  row survives — matches the down()'s `IF NOT EXISTS(... IS NULL)` guard exactly.

## 7. Generated types + typecheck — PASS
`pnpm generate:types` works (item 1). `pnpm typecheck` -> **exit 0** with the regenerated file.

## 8. Locked-document relationships — PASS
`payload_locked_documents_rels` has all 7 funnel FK cols incl. `funnel_quiz_templates_id`. Real deletes via
Payload local API (exercises the lock-clearing WHERE that enumerates every FK col):
funnel-quiz-templates -> deleted; funnel-lp-deployments -> deleted; sites (cascade hook + lock-clearing) ->
deleted. All succeeded.

## 9. User deletion with audit history — PASS
Created user + `audit_log` row referencing it, deleted the user -> succeeded; audit row survived with
`user` nulled; `audit_log.user_id` is_nullable = YES. (This is the whole point of 230000.)

## 10. Release script ordering — PASS on ordering; one defect flagged
Order in `scripts/release.sh` is correct: preflight -> size-checked backup (>1024B or die; uses container
pg_dump to dodge the v15/v16 20-byte empty dump) -> fetch+deploy -> **stop** -> install+build -> **MIGRATE**
-> **verify:schema** -> start -> health. Migrate is before start; verify is before start; failure trap gives a
staged rollback (batch `migrate:down` + previous-checkout restore). Build is DB-free (no
`generateStaticParams` anywhere; public catch-all `force-dynamic`; `q.js` no DB access), so build-before-migrate
cannot hit the old schema. `migrate:down` reversing exactly one release batch is confirmed (items 2, 6).

FINDING (defect, medium, non-blocking): `migration_count()` parses `payload migrate:status` with
`grep -c ' | *Yes'`, but that output renders columns with the **box-drawing char `│` (U+2502), not ASCII `|`**
(verified: `od -c` shows `342 224 202`). The exact expression returns **0** on a 29-migration DB
(`grep -c 'Yes'` returns 29). So `MIGRATIONS_APPLIED` is **always 0**. Consequences: the success log prints
`applied 0 (ledger 0 -> 0)`, and — the real problem — on a failure AFTER a successful migrate, `on_failure`
takes the else branch and prints *"No migration was applied, so the database is untouched"*, **omitting the
`migrate:down` instruction** — the opposite of the truth and contrary to the script's stated purpose. The
happy-path release and the migrate itself are unaffected (real gating is `pnpm payload migrate` +
`verify:schema`), and the size-checked backup mitigates. Fix: strip ANSI and match the box-drawing separator,
or count from the ledger via psql/`migrate:status --json` instead of the ASCII-pipe grep.

## 11. index.ts vs directory — PASS
`test:release` assertion "src/migrations/index.ts lists exactly the files on disk, in order (29)" passed.
`230000_audit_log_user_nullable` **is** in `RELEASE_MIGRATIONS`. Suite total: **28 passed, 0 failed**.

---
### Not runnable here
- `systemctl` / `plesk` steps in release.sh (item 10) — reasoned about, not executed (no server access).
- Full `pnpm build` static-render behavior asserted via source (no `.next` build in this codespace, per CLAUDE.md).
