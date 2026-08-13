/**
 * Proof that the release order is the safe one, against a scratch database
 * standing in for the PREVIOUS production schema.
 *
 *   pnpm test:release            # needs a postgres this user can create databases on
 *
 * WHAT WENT WRONG, AND WHAT THIS ASSERTS. The documented deploy started the
 * service and then, separately and from memory, ran `pnpm payload migrate`. New
 * code declares a column; the service boots before the migration that creates
 * it; Payload's SELECT enumerates every declared column, so the process throws
 * at boot rather than degrading a page. The last release hit that on
 * `funnel_lp_deployments.quiz_id` and was recovered by transcribing migration
 * SQL into psql by hand — which is how a schema and a migration ledger stop
 * agreeing about what has been applied.
 *
 * So there are three claims, and they are asserted in the order a release makes
 * them:
 *
 *   1. AT THE OLD SCHEMA, THE NEW CODE DOES NOT VERIFY. If this passes, the
 *      whole exercise is theatre — the ordering would not matter.
 *   2. AFTER MIGRATING, IT DOES. With the service still down.
 *   3. `migrate:down` REVERSES IT, so the rollback in `scripts/release.sh` is a
 *      real instruction rather than a hopeful one.
 *
 * The scratch database is built by running the committed chain to a CUT POINT
 * and stopping — which is what "the previous production schema" means and is
 * reproducible from the repository alone. It is dropped at the end, including
 * on failure.
 *
 * This spawns the real `payload migrate` CLI rather than importing it. The
 * subject under test is a RELEASE, and a release runs commands.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { migrations } from '../src/migrations/index.ts'
// The app reads .env through Payload's own config; this suite talks to postgres
// directly and spawns the CLI, so it loads the file itself rather than
// requiring the operator to export DATABASE_URI by hand.
import 'dotenv/config'

let pass = 0
let fail = 0
const t = (cond: unknown, label: string): void => {
  if (cond) pass++
  else { fail++; console.log('  FAIL ' + label) }
}

const base = process.env.DATABASE_URI
if (!base) {
  console.log('DATABASE_URI is not set; this suite needs a postgres it can create a scratch database on.')
  process.exit(2)
}

const MIGRATION_DIR = 'src/migrations'

const SCRATCH = `legalos_release_${Date.now()}`
const scratchUri = base.replace(/\/[^/?]+(\?|$)/, `/${SCRATCH}$1`)
const adminUri = base.replace(/\/[^/?]+(\?|$)/, '/postgres$1')

/** The migrations this release ADDS. Everything before them is "production". */
const RELEASE_MIGRATIONS = [
  '20260813_210000_locked_documents_funnel_rels',
  '20260813_213000_integration_config_sample_markers',
  '20260813_220000_template_records',
  '20260813_230000_audit_log_user_nullable',
]

const sh = (
  command: string,
  args: string[],
  env: Record<string, string> = {},
): { ok: boolean; out: string } => {
  try {
    const out = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      timeout: 300_000,
    })
    return { ok: true, out }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}` }
  }
}

let previousDirToClean = ''

const admin = new Client({ connectionString: adminUri })
await admin.connect()

const drop = async (): Promise<void> => {
  await admin.query(`DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`).catch(() => null)
}

try {
  await drop()
  await admin.query(`CREATE DATABASE "${SCRATCH}"`)
  console.log(`  scratch database ${SCRATCH}`)

  /* --- 0. the list and the directory agree ------------------------------- */
  //
  // Payload discovers migrations by reading the DIRECTORY, sorted by filename;
  // `readMigrationFiles` skips `index.ts` outright. So the hand-maintained list
  // is a cross-check rather than the chain, and it is only worth having if it
  // matches. `CLAUDE.md` says that array "is what runs, not the directory
  // listing" - which is the wrong way round, and following it would let somebody
  // "disable" a migration by deleting three lines and be wrong.

  const onDisk = readdirSync(MIGRATION_DIR)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && f !== 'index.ts' && f !== 'index.js')
    .sort()
    .map((f) => f.replace(/\.(ts|js)$/, ''))
  const listed = migrations.map((m) => m.name)
  t(
    onDisk.join('\n') === listed.join('\n'),
    `src/migrations/index.ts lists exactly the files on disk, in order` +
      (onDisk.join('\n') === listed.join('\n')
        ? ` (${onDisk.length})`
        : `\n    on disk: ${onDisk.filter((n) => !listed.includes(n)).join(', ') || '-'}` +
          `\n    listed only: ${listed.filter((n) => !onDisk.includes(n)).join(', ') || '-'}`),
  )

  /* --- 1. build the PREVIOUS production schema ---------------------------- */
  //
  // A directory holding the committed chain MINUS this release's migrations,
  // which is exactly what the previous release shipped. Built from this
  // repository alone and reproducible; hand-written DROP statements would be
  // testing something adjacent to the schema that actually ran.

  // Inside the repository, not in /tmp: the migration files import
  // `@payloadcms/db-postgres`, and node resolves that from the importing file's
  // own directory tree. A copy outside the project cannot see node_modules.
  // `.migrations-scratch-*` is gitignored.
  const previousDir = mkdtempSync(join(process.cwd(), '.migrations-scratch-'))
  for (const file of readdirSync(MIGRATION_DIR)) {
    if (RELEASE_MIGRATIONS.some((name) => file.startsWith(name))) continue
    copyFileSync(join(MIGRATION_DIR, file), join(previousDir, file))
  }
  t(
    readdirSync(previousDir).length === readdirSync(MIGRATION_DIR).length - RELEASE_MIGRATIONS.length,
    `the previous-release migration set is this one minus ${RELEASE_MIGRATIONS.length} file(s)`,
  )

  previousDirToClean = previousDir
  const previous = sh('pnpm', ['payload', 'migrate'], {
    DATABASE_URI: scratchUri,
    NODE_ENV: 'production',
    LEGALOS_MIGRATION_DIR: previousDir,
  })
  t(previous.ok, `the previous release's chain applies to an empty database${previous.ok ? '' : '\n' + previous.out.slice(-1500)}`)

  const client = new Client({ connectionString: scratchUri })
  await client.connect()
  const hasColumn = async (table: string, column: string): Promise<boolean> => {
    const r = await client.query(
      'select 1 from information_schema.columns where table_name = $1 and column_name = $2',
      [table, column],
    )
    return r.rowCount === 1
  }

  t(
    !(await hasColumn('payload_locked_documents_rels', 'funnel_lp_deployments_id')),
    'the scratch database is now at the PREVIOUS schema: the release\'s columns are absent',
  )
  t(
    !(await hasColumn('integration_config', 'funnel_samples_seeded')),
    'and so is the other one',
  )
  // ...and the schema is otherwise complete, or "it fails to verify" would prove
  // nothing about ordering.
  t(await hasColumn('sites', 'brand_identity'), 'while everything from earlier releases is present')
  t(await hasColumn('funnel_lp_deployments', 'quiz_id'), 'including the column the LAST release tripped over')

  /* --- 2. the new code does NOT verify against it ------------------------- */

  const before = sh('pnpm', ['verify:schema'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
  t(!before.ok, 'THE NEW CODE FAILS verify:schema against the previous schema - which is why the order matters')
  t(
    /SCHEMA MISMATCH/.test(before.out),
    'and says so in the words a release log will carry',
  )
  t(
    /locked-documents|integration-config/.test(before.out),
    `and names what is missing${/locked-documents|integration-config/.test(before.out) ? '' : `\n${before.out.slice(-800)}`}`,
  )

  /* --- 3. migrate, then it does ------------------------------------------ */

  const up = sh('pnpm', ['payload', 'migrate'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
  t(up.ok, `the release's migrations apply to the previous schema${up.ok ? '' : '\n' + up.out.slice(-1500)}`)
  t(await hasColumn('payload_locked_documents_rels', 'funnel_lp_deployments_id'), 'and the columns are there')
  t(await hasColumn('integration_config', 'funnel_samples_seeded'), 'both of them')

  const after = sh('pnpm', ['verify:schema'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
  t(after.ok, `verify:schema now PASSES, before anything has been started${after.ok ? '' : '\n' + after.out.slice(-1500)}`)
  t(/schema OK/.test(after.out), 'and reports what it read')

  /* --- 4. re-running is a no-op ------------------------------------------ */
  //
  // A release script people trust has to be safe to run twice, and the DDL is
  // written idempotent for exactly this reason.

  const again = sh('pnpm', ['payload', 'migrate'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
  t(again.ok, 'running the migration again is a no-op rather than an error')
  const stillOk = sh('pnpm', ['verify:schema'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
  t(stillOk.ok, 'and the schema still verifies')

  /* --- 5. the rollback in release.sh is a real instruction ---------------- */
  //
  // `payload migrate:down` reverses the last BATCH, and a release's migrations
  // are one batch, so exactly one command undoes exactly this release. Asserted
  // rather than assumed - the alternative reading, one command per migration, is
  // what the first draft of release.sh told an operator to do.

  {
    const down = sh('pnpm', ['payload', 'migrate:down'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
    t(down.ok, `migrate:down reverses the release${down.ok ? '' : '\n' + down.out.slice(-1500)}`)
    t(!(await hasColumn('payload_locked_documents_rels', 'funnel_lp_deployments_id')), 'and the columns are gone again')
    t(!(await hasColumn('integration_config', 'funnel_samples_seeded')), 'both of them')
    t(await hasColumn('sites', 'brand_identity'), 'while the previous release is untouched')

    const afterDown = sh('pnpm', ['verify:schema'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
    t(!afterDown.ok, 'and the new code correctly refuses to run against the rolled-back schema')

    // Forward again, so the suite leaves the scratch database in the state the
    // ledger assertions below describe.
    const forward = sh('pnpm', ['payload', 'migrate'], { DATABASE_URI: scratchUri, NODE_ENV: 'production' })
    t(forward.ok, 'and rolling forward again works')
  }

  /* --- 6. no hand-editing of the ledger ---------------------------------- */

  const ledger = await client.query('select name from payload_migrations order by name')
  const names = ledger.rows.map((r) => String(r.name))
  for (const name of RELEASE_MIGRATIONS) {
    t(names.includes(name), `the ledger records "${name}" - written by the migrator, not by a person`)
  }
  t(
    names.filter((n) => n === RELEASE_MIGRATIONS[0]).length === 1,
    'and records it exactly once, so a re-run did not double-write it',
  )

  await client.end()
} catch (err) {
  fail++
  console.log(`  FAIL the release-ordering walk completed — ${err instanceof Error ? err.message : String(err)}`)
} finally {
  await drop()
  await admin.end()
  if (previousDirToClean) rmSync(previousDirToClean, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
if (pass === 0) { console.log('no assertions ran'); process.exit(2) }
process.exit(0)
