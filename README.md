# VibeCity

A fully vibed city builder you can actually drive around in.

## Stack

Next.js 15 (App Router) + React 19 + TypeScript 5 (strict). Vitest for unit tests. Playwright for E2E (chromium-only smoke). raw three for the eventual scene. zod for schemas. `@upstash/redis` for slug-keyed persistence.

See `docs/gdd/02-tech-stack.md` for the canonical spec.

## Local development

```
npm install
npm run dev          # http://localhost:3000
npm run type-check
npm run test         # vitest run
npm run build        # next build
npm run test:e2e:install  # one-time chromium install
npm run test:e2e          # playwright smoke against next start on port 3100
```

## Project layout

- `src/app/` Next.js App Router routes.
- `src/components/` React UI components (added per slice).
- `src/game/` engine and game logic (added per slice).
- `src/hooks/` React hooks (added per slice).
- `src/lib/` pure utility modules (added per slice).
- `tests/` Vitest unit tests.
- `e2e/` Playwright end-to-end smoke tests.
- `docs/` GDD, implementation plan, and ledgers.

## Environment variables

The app does not require any env vars to run the smoke routes. Persistence (slug storage in Redis) lands in a follow-up slice and will require:

- `KV_REST_API_URL` (set in the deployment dashboard, not in the repo)
- `KV_REST_API_TOKEN` (set in the deployment dashboard, not in the repo)

`NEXT_PUBLIC_APP_VERSION` is resolved at build time from `git rev-parse --short HEAD` or `VERCEL_GIT_COMMIT_SHA`; override only when a deploy needs a custom label.

## Working agreements

`AGENTS.md` is mandatory reading for any agent working on this repo. It pins the em-dash ban, the GDD-first design rule, the stack constraints, and the autonomous PR loop contract.
