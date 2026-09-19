# Grok 4.6 host guide

The operator will run Grok 4.6 inside VS Code connected to the existing GitHub Codespace.

## Do not assume host features

At session start, inspect the available Grok host capabilities. Do not assume a slash command, native goal mode, subagent registration mechanism, or background-worker feature exists unless the current host exposes it.

If native subagents are available, use them only for disjoint read/write scopes and independent evaluation. If not, execute the same role contracts serially with deliberate context separation.

If a native goal loop exists, use it only for one bounded work unit with the goal predicate and stall policy from this pack. Never hand the entire project to one unbounded goal.

## Required behavior regardless of host UI

- persistent state lives on disk
- current work unit is bounded
- write ownership is explicit
- builder is independently evaluated
- tests are real
- commits/pushes are evidence-backed
- ordinary Plesk release is autonomous for this approved build
- red gates are not performed
- do not ask the operator routine questions
