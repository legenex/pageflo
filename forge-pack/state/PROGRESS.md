# Progress

## 2026-09-20 W20 W42

Website pages keep a `published_blocks` snapshot; public render prefers it when present. Preview routing accepts `{slug}.preview.pageflo.io` as an alias of `{slug}.preview.legenex.com`. New Brands mint both. Host fallbacks: app.pageflo.io, pageflo.io, os.legenex.com. TLS issue for the new names is blocked on SSH and on a DNS-01 CNAME for the PageFlo preview wildcard.

## 2026-09-20 W22

All twenty `sq_*` quiz templates now have a structural composition. Unknown ids still fall back to the default card. Preview and live share `QuizSurface`. `pnpm test:compositions` 636 passed. `pnpm test:flow` 205 passed. `pnpm typecheck` pass.

## 2026-09-19 W21

Master delete of quizzes and advertorials now refuses while deployments exist. New landing-page deployment copy writes are refused; operators must edit or clone the master. Legacy `content_overrides` rows still render so live pages do not silently change. `pnpm test:master-semantics` 5 passed. `pnpm typecheck` pass.

## 2026-09-19 W12

Lead persist remains the request-critical write. Downstream is idempotent via `downstream.completed`. A crash after persist returns the stored lead and leaves delivery for `deliverStoredLead` / BullMQ `lead-delivery` jobs keyed by `lead:${id}`. Ordinary in-request delivery is unchanged. `pnpm test:durability` 12 passed. `pnpm test:idempotency` 23 passed. `pnpm typecheck` pass.

## 2026-09-19 W11

Added required `debt` vertical with idempotent migration `20260919_120000_sites_vertical_debt`. New Brands seed hosted `/privacy` and `/terms`, bind `legal.privacy_url`/`terms_url` to those paths, and clone without copying production domains or leads. AI brand direction is niche-agnostic and does not auto-publish. `pnpm typecheck` pass. `pnpm test:release` 31 passed.

## 2026-09-19 W10

Brand-first nav: Brands, Websites, Quizzes, Landing Pages, Advertorials, Deployments, Domains, Leads, Integrations, Settings. Brand Kits removed from required sidebar. Websites and Deployments list real rows or honest empty states. `pnpm check:handbook` 0 missing. `pnpm typecheck` pass.

## 2026-09-19 W00

Re-audited checkout at `6736d09`. Extracted the autonomous build pack into `forge-pack/`. Reconciled `AGENTS.md`, `CLAUDE.md`, product/execution/human-gate docs, and `docs/STATE.md` with approved internal V1 and discovery 12.4 ordinary Plesk release authority. Preserved compatibility identifiers and all technical invariants. No application code changed.
