# PageFlo Agent Operating Instructions

This file is the canonical PageFlo operating contract. It applies to every
coding agent, model and harness working in this repository. Read it completely
before doing any work.

Read `docs/STATE.md` before making changes. Read `docs/PRODUCT-BRIEF.md`,
`docs/REQUIREMENTS.md`, `docs/EXECUTION-PLAN.md`, `docs/HUMAN-GATES.md`,
`docs/INFRASTRUCTURE.md` and `docs/ARCHITECTURE.md` when the task touches the
areas they cover.

These instructions apply to every task unless the operator explicitly says
otherwise for that task. Harness-specific entrypoint files, such as `CLAUDE.md`,
may add tool-specific guidance but must not contradict this file. Where any
duplicated guidance conflicts, this file wins, and the conflicting text
elsewhere should be removed rather than worked around.

---

## 1. Product and stack

PageFlo is a vertical-agnostic dynamic acquisition infrastructure platform for
lead generators, affiliates, agencies, media buyers and growth teams. It builds
and operates brand sites, landing pages, advertorials and qualification quizzes,
deploys one piece of brandless content under many brands, and captures,
validates, records consent for, and routes the leads those funnels produce.

**The product is currently named LegalOS in code, in the database, in the
service name and in the user interface. PageFlo is the target name. The rebrand
has not started.** Do not assume a name change has happened, and do not perform
one outside the phase that owns it. See section 4 and `docs/EXECUTION-PLAN.md`.

Current stack, verified in this repository:

- Payload CMS 3.83.0 on Next.js 15.4.11, App Router, React 19.1.2
- PostgreSQL 16, via `@payloadcms/db-postgres`
- Redis 7, currently used only for a health-check ping
- Anthropic SDK for AI generation, wrapped by `src/lib/ai/invoke.ts`
- TypeScript 5.7.3, Tailwind CSS 4, `pnpm@9.15.0`, Node `>=20.9`
- Playwright, used server-side for screenshot and fidelity harnesses

The legal-vertical positioning in the marketing surface, the collection named
`SharedLegalTemplates`, and the `LegalOS*` identifiers are legacy. They still
work and are still load-bearing. Removing them is planned work with its own
phase, not incidental cleanup.

---

## 2. Repository and environments

- GitHub repository: `legenex/legalos`
- Production and release branch: `main`
- Production host: `51.81.202.161`, Debian 12, Plesk, hostname `vps-3ae59fb7`
- Production application path: `/var/www/vhosts/legenex.com/os.legenex.com`
- Production service: `legalos-dev.service`, systemd, runs `pnpm start` against
  a prebuilt `.next/`. It is a production build. There is no HMR.
- Bare git repository on the host: `/var/www/vhosts/legenex.com/git/legalos.git`
- Control-plane host: `https://os.legenex.com`
- Release command, run on the host: `scripts/release.sh`
- There is no CI. This repository has no `.github/` directory and no GitHub
  Actions workflow.

The production application directory is a Plesk deployment target. It has no
`.git`, so `git pull` there fails with "not a git repository". Plesk moves code
in two distinct steps: `--fetch` pulls GitHub into the bare repository, and
`--deploy` checks the bare repository out into the application directory.

Full infrastructure detail, current and target, is in
`docs/INFRASTRUCTURE.md`.

---

## 3. Source of truth and normal flow

GitHub is the source of truth for application code.

Normal development flow:

```
coding agent -> local repository -> validation -> commit -> push main
             -> Plesk fetch + deploy -> scripts/release.sh on the host -> live
```

- Always edit files in a local clone. Never SSH-edit production source files.
  They are overwritten by the next deploy.
- Always commit and push to ship. That is the only mechanism that moves code.
- A push alone does not change what users see. The prebuilt `.next/` output has
  to be regenerated and the service restarted. See section 6.

---

## 4. Autonomy: what is automatic and what is not

For ordinary repository work the default is full autonomous execution up to and
including the push:

- inspect git status and the current branch
- inspect the relevant existing code
- preserve unrelated and concurrent work
- implement the requested change completely
- run focused validation, then the repository validation matrix in section 5
- inspect the final diff and run `git diff --check`
- confirm no secret or production environment file is staged
- commit the completed work
- push `main`
- update `docs/STATE.md` for anything beyond a trivial change
- report the result with evidence

Do not ask whether routine completed work should be committed and pushed. Do not
ask permission for ordinary implementation decisions, test choices, refactors
inside the task's scope, or documentation updates. That is the default flow.

**Where PageFlo differs from a repository with CI: the release is not
automatic.** There is no pipeline that deploys a push. Releasing means stopping
the live service, rebuilding, migrating the production database, and restarting.
That is a production infrastructure action on a shared Plesk host that also runs
other Legenex production systems, and it takes the site down for the duration.

So the line is:

| Action | Authorization |
|---|---|
| Implement, validate, commit, push `main` | Pre-authorized. Do it. |
| Run `scripts/release.sh` on production | Operator asks for it in that session, or is present and has said to release. |
| Anything in `docs/HUMAN-GATES.md` | Explicit human approval, every time. |

When you finish work that touches `src/`, `package.json`, `next.config.mjs`,
`tailwind.config.*`, `payload.config.ts`, `src/migrations/`, or anything that
ends up in `.next/`, end your reply with the release block in section 6. See the
mandatory-block rule there. It is an explicit, repeated owner instruction.

This division is temporary and is owned by phases 9 through 11 of
`docs/EXECUTION-PLAN.md`. When PageFlo has its own VPS and a real deployment
pipeline, routine release becomes autonomous, exactly as it is in the DashFlo
repository today. Do not build a second manual deployment path in the meantime,
and do not treat the current arrangement as the intended end state.

---

## 5. Validation

There is no unit-test framework. There is a suite of standalone assertion
harnesses under `scripts/`, driven by `pnpm` scripts, plus `tsc`.

Run the checks relevant to the change first, then the matrix below before
shipping.

```bash
pnpm typecheck        # tsc --noEmit
pnpm test             # 16 assertion suites, the main gate
pnpm build            # next build, proves the production bundle compiles
pnpm verify:schema    # reads every collection and global, as a boot would
pnpm test:release     # migration order, up/down, idempotency, on a scratch DB
pnpm lint:tokens      # brand-token linter
pnpm check:buildlog   # buildlog coverage
pnpm check:handbook   # handbook route coverage
```

Wider suites, slower, run when the change touches their area:

```bash
pnpm test:all         # pnpm test plus isolation, identity, fresh bootstrap
pnpm test:isolation   # multi-tenant isolation
pnpm test:identity    # renderer identity
pnpm test:bootstrap   # needs its own empty, migration-only database
pnpm check:paths      # deployment path checks
pnpm test:e2e         # end-to-end lead capture
```

Rules:

- **`pnpm lint` is not a check.** `next lint` has no committed ESLint config. It
  prompts interactively for setup and exits 1. Never report it as passing, and
  never report a lint result at all until a config exists. Configuring ESLint is
  phase 8 work.
- **`pnpm typecheck` passing is weaker evidence than it looks.** 54 files
  carrying `// @ts-nocheck`, about 24,000 of roughly 100,000 lines of `src/`,
  are excluded from it. Treat any file with a `@ts-nocheck` header as unchecked
  and read it carefully rather than trusting that it compiles. Removing them is
  phase 5 work.
- **`next build` does not type-check.** `next.config.mjs` sets
  `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`, deliberately,
  because the ported builder code fails both. A green build is not a green
  typecheck. Run both.
- Database-backed suites need PostgreSQL reachable at `DATABASE_URI`. They are
  not skipped silently in every case, so read the output rather than the exit
  code alone.
- Never claim a check passed unless it actually ran and you saw its output.
- If a failure is caused by your change, fix it and rerun. If it is
  demonstrably pre-existing, say so explicitly and do not silently ignore it.
- Do not declare success on compilation alone. Exercise behavior.

Record what you ran, and what it printed, in the completion report.

---

## 6. Releasing to production

The release is one command on the host, and it is the only supported path.

### The mandatory release block

**Every reply in which you push a change touching `src/`, `package.json`,
`next.config.mjs`, `tailwind.config.*`, `payload.config.ts`, `src/migrations/`,
or anything compiled into `.next/` must end with this exact block.** The owner
has asked for this repeatedly and explicitly. It applies every time, including
for a one-line fix, including when the previous reply already showed it. Do not
summarize it, do not shorten it, and do not substitute "run pnpm build".

```
cd /var/www/vhosts/legenex.com/os.legenex.com
plesk ext git --fetch -domain os.legenex.com -name legalos.git
plesk ext git --deploy -domain os.legenex.com -name legalos.git
scripts/release.sh
```

Then tell the operator to hard-refresh: Ctrl+Shift+R on Windows, Cmd+Shift+R on
Mac.

The change is not live until that block has run. Never tell the operator "it is
live in ten seconds".

### Why the block is shaped that way

Both `plesk` lines are needed and in that order. `--fetch` pulls GitHub into the
bare repository; `--deploy` checks it out into the application directory.
Running `--deploy` alone redeploys whatever was last fetched, which looks
exactly like a successful deploy of nothing. `scripts/release.sh` cannot bring
in the code it is about to release, which is why it comes third.

`scripts/release.sh` then does, in the only order that works: size-checked
database backup, fetch and deploy, **stop the service**, install, importmap,
build, **`pnpm payload migrate` while the service is down**,
**`pnpm verify:schema`**, start, HTTP health check. It prints the exact rollback
for whichever step failed.

The order matters and is not negotiable. New code declares a column; Payload's
`SELECT` enumerates every column a collection declares; so a service that starts
before its migration has run throws at boot rather than degrading. A previous
release hit exactly that on `funnel_lp_deployments.quiz_id` and was recovered by
hand-transcribing migration SQL into psql, which is how a schema and a migration
ledger stop agreeing. Never reproduce the release steps by hand, and never
create an alternative deployment path.

`scripts/release.sh --dry-run` prints the plan and touches nothing.

Full narrative: `docs/release-runbook.md`.

### After a release

Verify the surface the change actually touched:

- the service is `active (running)`
- `https://os.legenex.com/api/legalos/health` returns 200
- the changed public surface responds
- the changed functionality behaves, where that can be checked programmatically

Name any genuinely browser-only visual check instead of claiming it was
verified.

### Rollback

`git revert && git push`, then run the release block again. `scripts/release.sh`
prints migration rollback guidance itself when it fails; follow that rather than
improvising, and never edit `payload_migrations` by hand.

---

## 7. Non-negotiable invariants

These are enforced in code or protect against a correctness, compliance or
tenancy failure. Violating one is a defect, not a style disagreement.

1. **Everything is scoped to a `Site`.** Access control filters on that
   relationship. Use the helpers in `src/access/index.ts`; do not reimplement
   scoping. Server actions in the custom admin must call `getCurrentUser` and
   `isBoundToSite` from `src/lib/auth.ts`. They do not inherit Payload access
   control, and `SiteContext` is context, not authorization.
2. **Never add a column to a collection without its migration in the same
   commit.** A missing column breaks startup, not just one query.
3. **Migrations are hand-written, idempotent and retry-safe.** `ADD COLUMN IF
   NOT EXISTS`, `DROP COLUMN IF EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ALTER
   TYPE ... ADD VALUE IF NOT EXISTS`, nullable columns so existing rows need no
   backfill, and a header comment saying why. A migration runs because its file
   is in `src/migrations/`; `index.ts` is the written-down intended chain and
   `pnpm test:release` fails if the two disagree.
4. **Phone numbers display only via `resolvePhoneForPath(path, site_id)`.**
   Never denormalize a phone onto a Page, Landing Page or Quiz.
5. **Pixel and CAPI conversions share one `event_id`** per the Meta dedupe
   contract. See `src/lib/lead-pipeline/event-id.ts`.
6. **TrustedForm cert claim, Jornaya verification and HLR lookup are
   server-side only.** Credentials never leave the server. Never mint or
   substitute a consent certificate.
7. **Text colors are derived, never assumed.** Get every text color from
   `src/lib/builder/color-system.ts` against the opaque surface it will sit on.
   Do not hardcode `#fff` or `#000` and do not assume a brand token is dark.
   This is what makes white-on-white unreachable rather than merely unlikely.
   Never reimplement luminance or contrast math; `src/lib/builder/page-lint.ts`
   owns it.
8. **`ssl_status='active'` is set only after a real HTTPS handshake** by the SSL
   poller. Never inferred from a Plesk response.
9. **Preview domains** (`{slug}.preview.legenex.com`) are auto-issued, stay
   `primary: true` until a custom domain is verified, and cannot be deleted from
   the UI.
10. **`SharedLegalTemplate` edits surface an affected-Sites list before save.**
11. **A page-builder block field must land in all three places at once**:
    `src/lib/builder/block-schemas.ts`, `src/collections/Pages.ts`, and
    `src/components/blocks/BlockRenderer.tsx`. Shipping two of three is a bug.
12. **`bespoke-css.ts` rules are dual-scoped** `html.site-shell` and
    `.legalos-builder-canvas`. Add both selectors or the builder preview
    diverges from the live page.
13. **No placeholders in any working config.** `.env`, server actions, scripts
    and runtime config must never contain `<your-server-ip>`, `CHANGEME`,
    `paste-here`, `TODO` or similar. `.env.example` is the only file that may
    carry them. If a value is unknown, leave the key blank; code branches on
    emptiness, not on placeholder text.
14. **Deleting a `Site` requires the cascade.** Every child foreign key is `ON
    DELETE SET NULL`, so Postgres aborts the delete for NOT NULL children.
    `cascadeDeleteSiteChildren` removes them first, including the Site's
    `Leads`, which is irreversible and a compliance consideration. Add any new
    site-scoped collection to `SITE_CHILD_COLLECTIONS` or Site deletion starts
    failing silently.
15. **Every AI output goes through `invokeLLM`**, which enforces the banned-vocab
    and em-dash linters with up to two retries. Do not call the Anthropic SDK
    directly from a feature path.
16. **Outbound fetches go through the SSRF admission in `src/lib/net/`.** Do not
    add a new outbound path that bypasses it, and do not reintroduce
    `hostname: '**'` to Next's image `remotePatterns`.
17. **Never store credentials, authorization headers, cookies or API keys** in
    lead payloads, logs, exports, fixtures, commits, documentation or prompts.
18. **Human-facing copy, documents and chat responses do not use em dashes.**
    This matches the linter the product already enforces on generated copy, and
    it matches the DashFlo house style the same agents work under.

---

## 8. Start from the current repository state

Before making changes:

- inspect git status
- inspect the current branch
- fetch origin when the task depends on remote state
- understand existing uncommitted changes before touching them
- identify concurrent-session work
- preserve unrelated edits

Never discard unrelated work. Never assume an uncommitted change belongs to the
current task.

Never use destructive commands unless explicitly authorized:

```
git reset --hard
git clean -fd
git restore .
git checkout -- .
```

Do not stash, revert, overwrite or reconcile unrelated changes just to obtain a
clean tree. If unrelated changes block the task, say so and ask.

If another agent is actively changing the same files, stop and report the
conflict rather than guessing.

---

## 9. Inspect before editing

For every requested change:

- locate the actual implementation rather than guessing where it lives
- read the relevant code path and its callers
- understand current behavior before changing it
- identify the architectural, tenancy and security constraints that apply
- make the smallest coherent change that fully solves the request

Do not guess at root causes that can be traced from code. Fix the actual
problem; a patch that leaves the real bug in place is not a fix.

Do not start broad repository audits unless explicitly requested.

`docs/audit-2026-06-04.md` is a standing static audit of 50 confirmed findings.
Check it before reporting a "new" bug in a subsystem it covers.

---

## 10. Complete implementations only

Finish the whole path: schema, migration, server action, renderer, builder UI,
public render, edge cases. No stubs, no TODOs left in shipped code, no "wire
this up later" in a feature meant to work now.

Handle the failure modes before calling it done: empty and missing data, hostile
input, boundary conditions, light and dark, mobile, and multi-tenant scoping.

Prefer designs where the bad outcome cannot happen over designs that merely
avoid it today.

Do not hand the operator fragments they must merge by hand. When updating code,
prompts, scripts, configuration or documentation, produce the complete
integrated result.

If part of the scope turns out to be blocked, finish every other part in full
and state explicitly what was left out and why. Scaling the work down is the
operator's decision, not yours.

---

## 11. Git workflow

When the task is complete and validation passes:

- inspect the final diff
- check for accidental or unrelated changes
- check for secrets
- run `git diff --check`
- write a commit message that says what changed and why
- push `main`

Stage only the files belonging to the completed task. Do not sweep unrelated
concurrent changes into the commit.

Routine commits and pushes are pre-authorized. Do not ask "should I commit
this?" or "would you like the commands to push this?".

`origin` is `https://github.com/legenex/legalos` over HTTPS through the GitHub
CLI credential helper. Use the configured remote. Never expose private key
material, and never ask the operator to paste a token, passphrase or SSH key
into chat.

If a push fails, inspect the actual current failure and fix it with the tooling
already available. Report the blocker only when it genuinely cannot be repaired.

---

## 12. Human approval gates

Committing and pushing tested code is pre-authorized and needs no approval.

Stop and get explicit human approval before:

- entering, creating, rotating or otherwise changing production credentials
- mutating production secrets, including `.env` on the host
- destructive production database work: dropping, truncating, resetting,
  overwriting records, or deleting a `Site` in production
- a production data import where the consequence is material
- an irreversible migration, meaning one whose `down()` cannot restore the
  previous state
- any DNS change
- infrastructure migration, or replacing the current production host
- destructive rollback
- activating live external lead delivery, or any live buyer, supplier or
  partner endpoint
- meaningful financial spend
- deleting resources: Plesk domains, certificates, containers, volumes,
  backups, or repository history

`docs/HUMAN-GATES.md` holds the gate definitions, the decision-packet format,
and the record of gates asked and answered. Read it before assuming a gate does
not apply.

Autonomy never overrides a gate. A harness permission that allows an action does
not authorize an action this contract prohibits.

---

## 13. Production secrets

Production secrets live in `.env` on the host, at
`/var/www/vhosts/legenex.com/os.legenex.com/.env`. That file is gitignored and
must stay that way.

- Never overwrite it. Never commit any environment file with real values.
- Never print, expose, copy or request secret values: `PAYLOAD_SECRET`, database
  passwords, `ANTHROPIC_API_KEY`, `PLESK_API_KEY`, SMTP credentials, HLR
  provider tokens, `AGENT_PLAN_TOKEN`, super-admin passwords, or SSH keys.
- Reading the *names* of the keys present is fine and is often what a task
  actually needs. Reading their values is not.
- Changing a production secret is a human gate, section 12.

`.env.example` documents the keys and may contain placeholders. Nothing else
may.

---

## 14. Production host access

For ordinary application changes:

- do not SSH into production to edit code
- do not edit the live checkout directly
- do not restart services by hand outside a release
- do not reload nginx by hand

Read-only inspection is allowed and encouraged when a task depends on production
truth: service state, `journalctl -u legalos-dev`, health endpoints, the Plesk
domain list, the migration ledger, disk. Read-only means read-only.

Write operations on the host are limited to running `scripts/release.sh` under
the authorization in section 4, and to genuine infrastructure work the release
system cannot do, which is a human gate.

If manual host work is genuinely required, explain why before doing it.

---

## 15. Database safety

Never, without explicit operator approval and completed safety checks:

- destroy or recreate the production database
- drop or truncate tables
- reset production state
- import data into production
- run a destructive migration
- overwrite production records
- edit `payload_migrations` by hand, ever

Keep preview and read-only steps clearly separated from write and apply steps,
in code and in reporting.

Test suites create and drop their own scratch databases. Never point one at the
production `DATABASE_URI`.

---

## 16. Parallel work and concurrency

Multiple coding agents may work in this repository at the same time.

Before editing:

- inspect git status
- inspect the relevant diffs
- identify whether another agent has changed the files you intend to modify

Do not overwrite concurrent work. Do not clean the working tree because it
contains another agent's changes. If another agent owns the same files or code
path, stop and report the collision rather than resolving it by guessing.

For planned parallel work, use isolated worktrees and assign exact file
ownership. No two agents edit the same file.

**Integrator-only surfaces.** These stay in a single serial session and are
never edited by a parallel agent:

- `src/migrations/` and `src/migrations/index.ts`
- `src/payload.config.ts`
- `src/collections/Sites.ts` and the access helpers in `src/access/`
- `src/lib/lead-pipeline/run.ts`
- `src/components/blocks/BlockRenderer.tsx` and
  `src/lib/builder/block-schemas.ts`, which must move together
- `package.json`, `pnpm-lock.yaml`, `next.config.mjs`, `tsconfig.json`
- `scripts/release.sh`
- `AGENTS.md`, `CLAUDE.md`, `docs/STATE.md`
- final branch integration

Agents may build separate modules and their harnesses in parallel; the
integrator applies the shared-surface change serially.

Before committing, confirm the commit contains only the intended work.

---

## 17. The PageFlo agent model

PageFlo is built and operated by a team of agents, orchestrated by **Hermes**,
with **Buzz** as the collaboration and project interface. This repository is one
of the systems they operate; DashFlo is another.

Permanent Legenex roles:

| Role | Responsibility |
|---|---|
| Bossman | Chief of Staff, orchestrator |
| Sherlock | Research and intelligence |
| Picasso | Creative director |
| Quill | Scriptwriter and copywriter |
| Archie | Product and build architect, prompt engineer |
| Dexter | Senior developer, primary implementation engine |
| Bugsy | Independent QA and tester |
| Critic | Final reviewer, red team |
| Digit | Data analyst, BI |
| Odin | Infrastructure and systems operator |

The contract is harness-neutral. A role is a responsibility, not a model and not
a tool. Claude Code is one implementation engine among several.

Whichever agent or harness is executing:

- read `docs/STATE.md` before starting
- inspect the current repository state rather than trusting a remembered one
- preserve unrelated concurrent work
- respect the file ownership in section 16
- do not overwrite another active agent's files
- update `docs/STATE.md` when the work changes the project's factual state
- provide evidence, not unsupported completion claims
- never let a subordinate agent take a production action or clear a human gate

Independent review is expected on substantive work. Bugsy and Critic exist to
refute a claim, not to confirm it. `.claude/agents/` holds sixteen scoped
subsystem reviewers plus an adversarial verifier whose only job is to try to
kill a reported finding; use them rather than ad hoc greps when auditing a
subsystem.

`/admin/plan` is the live agent status board, backed by
`src/lib/agent-plan/`. Agents report status by POSTing to
`/api/legalos/agent-plan`.

---

## 18. Model and harness neutrality

These instructions apply regardless of model or coding harness: Claude Code,
Codex, other hosted or local coding models, and IDE agents alike.

Do not assume a specific model has special permissions. The harness determines
access to the filesystem, terminal, git, GitHub, network and external tools.
Harness permissions are separate from this contract: a permission that allows an
action does not authorize an action this contract prohibits, and an instruction
here does not grant a capability the harness withholds.

Assess the capabilities of the current harness. Do not ask the operator to
perform a routine step merely because a different model, or an earlier session,
lacked the permission to do it. If the harness genuinely cannot commit, push or
verify, report that limitation plainly. Never present an action as done when it
was not.

---

## 19. Definition of done

A task is done only when:

- the acceptance behavior was observed, not assumed
- the relevant validation from section 5 ran and passed, and you saw the output
- the diff was reviewed for tenancy scoping, access control, PII, secrets,
  consent handling, live URLs, idempotency and migration coverage
- the work is committed and `main` is pushed
- `docs/STATE.md` records evidence and rollback for anything beyond a trivial
  change
- the release block was given to the operator when the change touches shipped
  code
- no unapproved production action occurred

If a fact cannot be proven, label it `UNPROVEN` and either keep the task open or
move it to the correct human gate. Do not let an unverified claim read as
finished.

---

## 20. Final response format

Close a task with a concise completion report containing:

- what changed
- root cause, if the task was a bug
- changed files
- commit hash and commit message
- validation commands run, and their actual results
- push result
- what is genuinely still unverified, and why
- final git status
- the release block from section 6, when the change touches shipped code

Do not dump internal reasoning. Do not restate the contract.

---

## 21. Style

Be direct and execution focused.

Do not repeatedly ask for confirmation for routine implementation, testing,
committing or pushing.

Do not provide fragments the operator must reconcile manually.

Do not use em dashes in responses or in drafted project content.

Report faithfully. If a check failed, say so and show the output. If a step was
skipped, say that. When something is done and verified, state it plainly without
hedging.
