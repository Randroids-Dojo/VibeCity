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

Persistence (slug storage in Upstash Redis) is wired up. Required env vars on the deployment:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Optional but pulled by `vercel env pull` (Upstash integration also sets these for the marketplace tooling):

- `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`

The smoke routes do not require any env vars; routes that read or write cities use `hasKvConfigured()` for graceful empty-city fallback when env is missing, so local development works without the file.

To set up local dev with the production Upstash store:

```
vercel link --project vibe-city
vercel env pull .env.local
```

`.env.local` is gitignored; never commit credentials.

The `vibe-city` project owns a dedicated Upstash for Redis store named `vibecity-kv`, attached only to `vibe-city`. AGENTS.md Rule 11 forbids sharing backing stores across Vercel projects; see Q-007 in `docs/OPEN_QUESTIONS.md` for the rationale.

`NEXT_PUBLIC_APP_VERSION` is resolved at build time from `git rev-parse --short HEAD` or `VERCEL_GIT_COMMIT_SHA`; override only when a deploy needs a custom label.

## Working agreements

`AGENTS.md` is mandatory reading for any agent working on this repo. It pins the em-dash ban, the GDD-first design rule, the stack constraints, and the autonomous PR loop contract.
