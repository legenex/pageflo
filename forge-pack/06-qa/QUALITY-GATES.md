# Quality gates

Grok must first verify which current package scripts remain valid.

## Fast gate

Run frequently on affected scope:

- `pnpm typecheck`
- relevant targeted `pnpm test:*` scripts
- `pnpm lint:tokens` where Brand/render work changes
- `git diff --check`
- secret/placeholder grep appropriate to repo conventions
- migration chain check when schema changes

Do not use `pnpm lint` as a claimed passing gate unless Wave 00 verifies a noninteractive committed ESLint configuration now exists.

## Full gate before major wave integration

As applicable to current repo:

```bash
pnpm typecheck
pnpm test
pnpm test:all
pnpm build
pnpm verify:schema
pnpm test:release
pnpm test:e2e
pnpm test:identity
pnpm test:isolation
pnpm check:paths
pnpm test:certs
pnpm check:live-preflight
```

Read output. Do not treat an exit code as sufficient evidence if a script can skip prerequisites.

## Product-specific gates

### Visual fidelity
- screenshot representative templates at desktop/mobile
- independent evaluator compares against supplied design references
- template distinction cannot rely only on color

### Import
- controlled WordPress/public fixture
- controlled Base44/public fixture
- local PageFlo publish loads without source runtime
- imported sections remain editable

### Master/deployment
- master version change does not change live deployment until republish
- no new deployment public-copy override path
- Check A Case versus Don't Settle same-master test
- bulk deploy partial failure isolation

### Lead durability
- failure after persistence does not lose Lead
- queue restart resumes work
- technical retry bounded
- idempotent downstream side effect
- consent/attribution remain linked

### Release
- supported Plesk path only
- production health after release
- changed route/UI verified
- no fake success for blocked DNS/external integrations
