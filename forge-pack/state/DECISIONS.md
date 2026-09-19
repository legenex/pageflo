# Execution decisions

## D-W00-01 Pack extraction

The operator dropped the pack as a zip at repo root. Extracted contents into `forge-pack/` so future agents can resume without the zip. Did not commit the zip or the leftover `forge-pack/test` upload artifact.

## D-W00-02 Source precedence after W00

1. Direct operator instructions for this run.
2. `AGENTS.md` for technical, security, tenancy, migration, secret, and release invariants.
3. `forge-pack/00-intake/DISCOVERY.md` and `forge-pack/01-product/DECISIONS.md` for product scope.
4. Current code and tests for implementation facts.
5. Older `docs/*` phase language is historical unless it matches the above.

## D-W00-03 Wave 01 migration ownership

W11 and W12 both list `src/migrations/**`. That tree is integrator-only. Do not let those units edit migrations in parallel.
