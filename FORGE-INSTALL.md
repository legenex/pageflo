# PageFlo Grok 4.6 build pack installation

This pack is designed for the existing `legenex/pageflo` GitHub Codespace.

## Put the files here

Open the PageFlo Codespace in VS Code. The repository root should normally be:

```text
/workspaces/pageflo
```

Copy these two items from this pack into that repository root:

```text
/workspaces/pageflo/START-GROK-4.6.md
/workspaces/pageflo/forge-pack/
```

Do not replace the existing root `AGENTS.md` or `CLAUDE.md` manually. Wave 00 tells Grok how to reconcile the existing operating contract with the newly approved internal V1 scope and production authority without losing existing safety invariants.

Then open `START-GROK-4.6.md`, copy the whole prompt, and paste it into Grok 4.6 inside the Codespace.

## What you should expect

Grok should inspect the repository before editing, execute the work graph in dependency order, keep persistent state in `forge-pack/state/`, commit and push verified work, and release ordinary approved application changes through the existing Plesk release path.

It should not ask for ordinary coding, refactoring, testing, commits, pushes, release verification, or low-risk implementation decisions.

If it reaches a genuine red gate such as destructive production data work, credential rotation, DNS cutover that is not already authorized, or deletion of production resources, it must record the blocker and continue all other safe work rather than interrupting you mid-run.
