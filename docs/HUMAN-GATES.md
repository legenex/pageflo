# PageFlo human gates

Version 1, 1 September 2026.

Agents should not ask the operator for ordinary engineering choices. These gates
exist only where human authority, live access, money, or an irreversible
business decision is required.

`AGENTS.md` section 12 is the short list. This document is the definition, the
decision-packet format, and the record.

---

## What is NOT a gate

The following are pre-authorized and must not be asked about. Asking wastes the
operator's attention and trains them to approve without reading, which is how a
real gate gets waved through.

- writing, refactoring and deleting code
- adding, changing and removing tests
- writing and rewriting documentation
- running any check in the validation matrix, including ones that create and
  drop their own scratch databases
- creating a commit
- pushing `main`
- reading production state: service status, logs, health endpoints, the Plesk
  domain list, the migration ledger, disk, container status
- adding a dependency that is not a paid service
- creating a branch or a worktree
- generating content through the AI wrapper during development

If a task is complete and validation passes, commit and push it. Do not ask.

---

## Gate 1: credentials and secrets

**Trigger.** Creating, entering, rotating, revoking or otherwise changing any
credential; handling a secret value outside the approved mechanism; adding a new
credential-bearing integration.

Covers: `PAYLOAD_SECRET`, database passwords, `ANTHROPIC_API_KEY`,
`PLESK_API_KEY`, SMTP credentials, HLR provider tokens, TrustedForm, Jornaya,
Meta CAPI and TrueCall keys, `AGENT_PLAN_TOKEN`, super-admin passwords, SSH
keys, and any credential for a system added later.

**Not covered.** Reading the *names* of keys present in an environment file.
That is ordinary inspection and is often exactly what a task needs.

**The agent provides.** Which credential, why it must change, what breaks if it
does, the blast radius across tenants, and the rollback.

**The operator does.** Places the value into the approved mechanism directly.
Credentials are never pasted into chat, a commit, a fixture, a spreadsheet, an
issue or a prompt.

**While waiting.** Continue every path that uses a placeholder reference or a
mock. Code branches on emptiness, not on placeholder text, so an unset key is a
working state.

---

## Gate 2: production database

**Trigger.** Any write to the production database that is not an application
request or a forward migration applied by `scripts/release.sh`.

Requires approval:

- dropping, truncating or recreating anything
- resetting production state
- overwriting or bulk-editing records
- deleting a `Site` in production, which cascades to its `Leads` and is
  irreversible
- a data import where the consequence is material
- an **irreversible migration**, meaning one whose `down()` cannot restore the
  previous state
- editing `payload_migrations` by hand, which is never approved, ever

**Not covered.** A normal forward migration in a release. Additive, idempotent,
reversible migrations are ordinary work and ship with the code that needs them.

**The agent provides.** The exact statements, the affected row counts measured
first on a copy, the backup path and its verified size, the tested rollback, and
what an operator would see if it goes wrong.

**Standing rule.** `scripts/release.sh` takes a size-checked backup before any
DDL. The system `pg_dump` is version 15 against a 16 server and writes a 20-byte
file with a zero exit status, so a dump under a kilobyte fails the release. Do
not disable that check.

---

## Gate 3: DNS

**Trigger.** Any DNS record change, on any domain, for any reason.

There is no small DNS change. A record that points a tenant brand at the wrong
place takes that brand's acquisition offline and the failure is invisible from
inside the application.

**The agent provides.** The exact records before and after, the TTL, the
propagation expectation, what breaks during propagation, and the revert.

**Note.** DNS *verification* is not a DNS change. `verifyAndPromoteDomain`
checking whether a tenant has pointed their record correctly is ordinary
read-only work and needs no gate.

---

## Gate 4: infrastructure

**Trigger.** Provisioning, replacing, reconfiguring or decommissioning
infrastructure.

Requires approval:

- provisioning the dedicated PageFlo VPS
- migrating PageFlo off the current Plesk host
- replacing the current production host
- changing the systemd units, timers or nginx configuration on production
- adding, removing or reconfiguring a container on the production host
- any root operation outside a release
- **anything touching the DashFlo VPS.** PageFlo does not go there. Ever. That
  is not a gate that can be approved by an agent asking nicely; it is an
  architectural rule in `docs/INFRASTRUCTURE.md`

**Context that makes this sharper.** The current production host is shared. It
also runs Buzz, Hermes, a scraper and Plesk's own tooling. An action that
restarts, reconfigures or resource-starves that machine affects other production
systems, not just PageFlo.

**The agent provides.** What changes, what else on the host is affected, the
downtime window, the verification, and the rollback.

---

## Gate 5: destructive rollback

**Trigger.** A rollback that destroys state rather than reverting code.

Requires approval: `migrate:down` on production, restoring a database backup
over live data, reverting a deploy in a way that leaves the schema ahead of the
code, or discarding a production change that other systems have already
consumed.

**Not covered.** `git revert && git push` followed by a normal release. That is
the ordinary rollback and needs no approval.

**Standing rule.** `scripts/release.sh` prints the exact rollback for whichever
stage failed, including whether a migration batch was applied. Follow what it
prints. Do not improvise, and do not hand-edit the ledger.

---

## Gate 6: live external activation

**Trigger.** Anything that causes a real external system to act on real data for
the first time, or in a new way.

Requires approval:

- activating live lead delivery to an external destination
- enabling a new outbound webhook against a real endpoint
- turning on conversion reporting to an advertising platform for a live campaign
- activating a buyer, supplier or partner integration
- sending real notification traffic to a live Slack, SMS or email destination

**The agent provides.** The destination, the payload shape, what the receiver
will do with it, the idempotency guarantee, the volume expectation, and the kill
switch.

**Standing rule.** Tests never reach a live endpoint. A test that would spend
money or deliver a real lead is a defect in the test, not a gate request.

---

## Gate 7: financial spend

**Trigger.** Committing the operator to money.

Requires approval: provisioning paid infrastructure, adding a paid service or
tier, changing an AI model or volume in a way that materially changes cost, and
any bulk operation whose per-unit cost multiplies into something meaningful.

**Not covered.** Ordinary development AI usage through the existing key.

**The agent provides.** The cost, the billing period, what it replaces if
anything, and how to stop it.

---

## Gate 8: deleting resources

**Trigger.** Deleting something that cannot be recreated from the repository.

Requires approval: Plesk domains, TLS certificates, Docker containers or
volumes, database backups, uploaded media, repository history, branches carrying
unmerged work, and any production file that is not version-controlled.

**Note.** `/usr/local/bin/legalos-warm.sh` is exactly this case: a live
production script that exists nowhere else. Bring it into the repository before
proposing to remove it.

**Not covered.** Deleting files the agent created in this task, scratch
databases a test made, or generated artifacts.

---

## Decision packet format

When a gate applies, send one packet. Do not trickle questions.

```
GATE: <1-8, and its name>
WHY NOW:
RECOMMENDATION:
DECISIONS REQUIRED:
  1. <decision, recommended option, consequence of each option>
CREDENTIAL REFERENCES REQUIRED: <names only, never values>
EVIDENCE:
  <what was measured, and the command that measured it>
BLAST RADIUS:
  <what else is affected, including other systems on the shared host>
ROLLBACK:
  <the tested revert, not the theoretical one>
WORK CONTINUING WITHOUT APPROVAL:
BLOCKED WORK:
```

**If the packet contains a question that code, a test, a read-only inspection,
repository history or a safe local experiment could answer, it is not ready to
send.** Answer it first.

---

## How a gate interacts with autonomy

`AGENTS.md` section 4 makes implement, validate, commit and push autonomous.
That does not soften a gate. Approval for one action does not extend to the
next one, to a later tranche, or to a similar action on a different domain.

A harness permission that allows an action does not authorize an action a gate
covers. An agent that *can* run a destructive command is exactly the agent that
must not run it unasked.

While waiting on a gate, continue every unaffected task. Report what is blocked
and what is proceeding.

---

## Gate record

No gate is currently open.

| Date | Gate | Request | Decision |
|---|---|---|---|
| | | | |

Phase 10 of `docs/EXECUTION-PLAN.md` will open gates 4, 7 and 2, in that order:
provisioning the dedicated VPS, its spend, and the production data restore into
it. Phase 11 will open gate 3 for every DNS change and gate 4 for the host
replacement.

Append a row here when a gate is asked and when it is answered. A gate that was
approved verbally and never recorded is a gate that will be assumed next time.
