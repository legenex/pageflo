# Brownfield audit summary

This audit was performed against the existing `legenex/pageflo` repository before pack generation. Grok must re-check the current checkout because the repo may have advanced.

## Verified current architecture

- Next.js 15.4.11, App Router, React 19.1.2.
- Payload CMS 3.83.0 with PostgreSQL 16.
- Redis 7 exists and current repository docs say it is used for health ping; `bullmq` and `ioredis` dependencies are already present in `package.json`.
- TypeScript 5.7.3, Tailwind CSS 4, pnpm 9.15.0, Node >=20.9.
- Anthropic SDK exists behind `src/lib/ai/invoke.ts` according to root operating docs.
- Playwright is present for screenshot/fidelity harnesses.

## Verified current operating model

- Repository: `legenex/pageflo`.
- Production/release branch: `main`.
- GitHub is code source of truth.
- Production is still on the existing Plesk server.
- Current public app: `https://app.pageflo.io` with `https://os.legenex.com` retained as legacy/rollback host according to repo docs.
- Existing release path uses Plesk fetch/deploy and `scripts/release.sh`.
- Existing root docs state there is no GitHub Actions CI.

## Verified compatibility constraints

The current root `AGENTS.md` explicitly lists several LegalOS identifiers that are intentionally still load-bearing compatibility contracts. They must not be mass-renamed during the UI/product completion. Grok must preserve them until each consumer has a deliberate migration.

## Existing test surface from package.json

Current scripts include:

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:all`
- `pnpm test:rebrand`
- `pnpm test:brand`
- `pnpm test:authz`
- `pnpm test:registry`
- `pnpm test:records`
- `pnpm test:identity`
- `pnpm test:ui`
- `pnpm test:failclosed`
- `pnpm test:slots`
- `pnpm test:dom`
- `pnpm test:publish`
- `pnpm test:ai`
- `pnpm test:flow`
- `pnpm test:compositions`
- `pnpm test:webhook`
- `pnpm test:observability`
- `pnpm test:brand-identity`
- `pnpm test:isolation`
- `pnpm test:trusted-host`
- `pnpm test:timeouts`
- `pnpm test:bootstrap`
- `pnpm test:release`
- `pnpm test:e2e`
- `pnpm check:paths`
- `pnpm test:certs`
- `pnpm check:live-preflight`
- `pnpm verify:schema`
- `pnpm test:idempotency`
- `pnpm test:console`
- `pnpm build`
- `pnpm lint:tokens`

The current root operating docs warn that `pnpm lint` is not usable as a gate until ESLint is configured and that `next build` ignores TypeScript build errors. Grok must verify whether those facts are still true before relying on them.

## Verified product structures already in the repo

Repository evidence already contains first-class concepts for Sites/brands, master funnel assets, deployments, domains, Leads, brand resolution, page templates, quiz templates, and public rendering. The project is a completion/rebuild, not a greenfield rewrite.

## Known high-value defect: Quiz template collapse

`docs/quiz-renderer-architecture.md` provides a detailed diagnosis showing that the twenty quiz templates currently collapse through one generic composition with style-token differences. The document identifies the structural root cause, dead/degraded template degrees of freedom, and mismatch between template previews and real rendering.

This is not a cosmetic issue. Fixing structural template fidelity is a required V1 workstream.

## Redesign evidence

The repository includes `docs/PageFlo App (1).html`, `docs/LegalOS to PageFlo redesign (2).zip`, and design-review deliverables. These are binding visual references. Prototype metrics and demo entities inside the redesign are not production data and must be replaced with real data or honest empty states.

## Audit uncertainties to resolve in Wave 00

Grok must verify:

1. exact current collection names and fields for Sites/Brand Kits/Websites/master assets/deployments
2. whether a first-class Brand Website collection already exists or must be introduced
3. exact current import path for URL/HTML/WordPress/Base44
4. exact AI editing capabilities already exposed in the app
5. current Lead pipeline transaction boundary and whether BullMQ is wired or only installed
6. current domain/SSL path and what is necessary for `*.preview.pageflo.io`
7. current uncommitted work and concurrent branches
8. current production health before the first release
9. which parts of the redesign are already implemented versus prototype-only
10. stale docs that still describe PageFlo primarily as a future external SaaS
