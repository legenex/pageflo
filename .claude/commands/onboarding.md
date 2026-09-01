---
description: Bootstrap a new PageFlo developer from the repository's own canonical docs
---

Drive a new team member from an empty machine to a working local development
environment, using this repository's canonical documentation.

**Do not fetch a playbook from a URL.** The previous version of this command
fetched `https://mo.legenex.com/setup.txt`, a host that no longer exists, with a
fallback to a GitHub repository that is not this one. Both paths were dead, and
the playbook they pointed at described a retired live-server-editing workflow
that now contradicts `AGENTS.md`. `public/setup.txt` and
`public/teammate-init.txt` are banner-marked as superseded; read them only for
history.

## Read first

1. `README.md`, for the stack, the local setup and the release path
2. `AGENTS.md`, the canonical operating contract
3. `docs/STATE.md`, current factual state

## Drive setup, one step per message

This person is new. Do not dump the whole sequence at them. Use a todo list and
update it in real time.

1. **Prerequisites.** Node `>=20.9`, `pnpm@9.15.0` (`corepack enable`), Docker,
   git, and the `gh` CLI authenticated.
2. **Clone.** `git clone https://github.com/legenex/legalos` and open it.
3. **Environment.** `cp .env.example .env`. Walk them through the values.
   `DATABASE_URI`, `PAYLOAD_SECRET`, `SUPER_ADMIN_EMAIL`,
   `SUPER_ADMIN_PASSWORD` and `ANTHROPIC_API_KEY` are the minimum for a working
   local environment. **Never ask them to paste a secret into chat, and never
   read one back.** Where a value is unknown, leave the key blank; the code
   branches on emptiness, not on placeholder text.
4. **Services.** `docker compose up -d postgres redis`. Only those two.
5. **Install.** `pnpm install`.
6. **Schema.** `pnpm payload migrate`, then `pnpm generate:types`.
   `src/payload-types.ts` is gitignored and does not exist in a fresh clone, and
   ten modules import from it, so `pnpm typecheck` fails until it is generated.
7. **Seed.** `pnpm seed`, which is idempotent.
8. **Run.** `pnpm dev`, then open http://localhost:3000/admin.
9. **Prove it works.** Have them run `pnpm typecheck` and `pnpm test`. Both
   should pass. That is the real handshake, not a page that loads.

## What to tell them about shipping

Push to `main`, then release on the server. There is no CI, and a push alone
changes nothing: the running service serves a prebuilt `.next/`. The release
block is in `AGENTS.md` section 6, and it is mandatory at the end of any reply
that pushes shipped code.

Do not set them up with production SSH access as part of onboarding. Read-only
production inspection is a separate, deliberate step, and nothing in the normal
development loop needs it.

## Constraints

- Never edit files on the production server.
- Never commit `.env` or any real credential.
- Never run `scripts/release.sh` on their behalf during onboarding.
- Everything in `AGENTS.md` applies from their first commit onward.
