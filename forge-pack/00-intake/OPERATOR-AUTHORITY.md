# Operator authority for this autonomous build

This file records authority explicitly granted by the operator for the PageFlo completion run.

## Green, proceed without asking

- inspect repository and production-visible behavior using existing authorized access
- edit application code and documentation
- refactor inside approved requirements
- add or update tests
- run local and repository test suites
- add low-risk dependencies when necessary and justified
- create migrations that are safe, backwards-compatible, idempotent, and required by approved work
- create commits
- push verified commits to `main`
- run ordinary approved PageFlo application releases through the existing Plesk release script after gates pass
- verify the released application and repair release regressions caused by the current change
- use parallel agents/subagents with disjoint write ownership
- make routine engineering, UX, and implementation decisions inside the locked product contract

## Red, do not perform without separate explicit authority

- destructive production data deletion
- irreversible schema changes without a safe migration path
- production credential rotation or secret replacement
- production infrastructure migration to a new VPS/provider
- deleting production resources, DNS zones, backups, domains, or servers
- money movement or meaningful new recurring spend
- activating an unknown external Lead buyer/destination that would send real Leads where no current approved destination exists
- DNS cutover or new production DNS change that is not already authorized and represented in the current environment
- bypassing or disabling security controls
- force-push, history rewrite, or destructive git cleanup

## No-interruption rule

If a red gate is encountered, do not interrupt the operator immediately. Record it in `state/BLOCKERS.md`, continue all safe independent work, and only surface it when it becomes the last critical-path blocker or at final handoff.
