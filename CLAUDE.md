# CLAUDE.md

Read `AGENTS.md` completely before doing any work. `AGENTS.md` is the canonical
PageFlo operating contract and must be followed for every task.

This file adds only Claude Code specific guidance. It does not restate the
operating contract. If anything here ever appears to conflict with `AGENTS.md`,
`AGENTS.md` wins, and the conflicting text here should be removed rather than
worked around.

## Session startup

1. Read `AGENTS.md`.
2. Read `docs/STATE.md`, the persistent handoff between sessions and agents.
3. Read `docs/ARCHITECTURE.md` before changing any subsystem you have not
   already read this session.
4. Read `docs/PRODUCT-BRIEF.md`, `docs/REQUIREMENTS.md`,
   `docs/EXECUTION-PLAN.md`, `docs/HUMAN-GATES.md` and
   `docs/INFRASTRUCTURE.md` when the task touches the areas they cover.

Then follow the workflow in `AGENTS.md` for the task itself.

## The one thing that is easy to get wrong

**Pushing does not deploy.** There is no CI. A change touching `src/`,
`package.json`, `next.config.mjs`, `tailwind.config.*`, `payload.config.ts`,
`src/migrations/`, or anything compiled into `.next/` is not live until the
operator runs the release block. Ending such a reply with that exact block is
mandatory. It is in `AGENTS.md` section 6, and the owner has asked for it
repeatedly and explicitly.

## Project-local tooling

`.claude/` holds shared project state, not personal state. `.gitignore`
allowlists `.claude/commands/` and `.claude/agents/` and ignores everything else
under `.claude/`.

- `.claude/agents/` has sixteen scoped subsystem reviewer-fixers plus
  `legalos-adversarial-verifier`, a read-only agent whose only job is to refute
  a reported finding. Use them when auditing or fixing a subsystem rather than
  ad hoc greps. Each one's front matter scopes it to specific paths.
- `.claude/commands/` has the `onboarding` slash command.

There are no project hooks and nothing runs a gate automatically on your behalf.
Run the validation matrix in `AGENTS.md` section 5 yourself.

## This environment can build

The project documentation used to say the codespace could not build, because it
had no dependencies, no `.env` and no database. That is no longer true and
should not be repeated. As of 1 September 2026 this checkout has
`node_modules`, a working `.env` pointed at localhost, a generated
`src/payload-types.ts`, and PostgreSQL 16 plus Redis 7 running in local Docker
containers. `pnpm typecheck`, `pnpm build` and the full test matrix all run and
pass here.

If a check genuinely cannot run, say precisely why rather than assuming this
note is still accurate. Verify, then report.

## SSH access to production

Read-only inspection of the production host is available through the `legalos`
SSH host alias, which is configured in `~/.ssh/config` with the
`~/.ssh/legalos_deploy` key:

```bash
ssh legalos 'systemctl status legalos-dev --no-pager'
ssh legalos 'journalctl -u legalos-dev -n 50 --no-pager'
```

`ssh root@51.81.202.161` without `-i` fails; older documentation used that form.
Use the alias.

Read-only means read-only. Everything in `AGENTS.md` sections 12, 14 and 15
applies unchanged: no editing the live checkout, no manual restarts outside a
release, no production database writes, and no running `scripts/release.sh`
unless the operator asked for it in this session.

## Subagents and parallel sessions

Subagents and parallel sessions are permitted, and the parallel-work rules in
`AGENTS.md` section 16 apply to them exactly as they apply to separate agents.

- Give each subagent explicit file ownership. No two subagents edit the same
  file.
- Keep the integrator-only surfaces listed in `AGENTS.md` in a single serial
  session. Do not let a subagent edit them.
- A subagent reports evidence back. Only the main session runs the validation
  matrix, commits and pushes.
- Never let a subagent take a production action, and never let one clear a human
  gate on the strength of its own reasoning.

## Reporting

Close a task with the completion report in the Final response format section of
`AGENTS.md`, and keep to its Style section, including no em dashes in chat
responses.
