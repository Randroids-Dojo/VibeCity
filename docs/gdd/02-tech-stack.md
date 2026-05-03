# 2. Tech Stack and Project Bootstrap

**Status:** partial

This file is the canonical spec for VibeCity's technology choices and the bootstrap requirements (REQ-001 through REQ-005). The stack matches VibeRacer's so the eventual code port is mechanical, not architectural.

## Core stack

- **Next.js 15** with the App Router. Server Components by default, Client Components opt in via `'use client'`.
- **React 19** with strict mode enabled.
- **TypeScript 5** in strict mode. `noEmit: true`. Path alias `@/*` resolves to `src/*`.
- **Vitest 2** for unit tests. Tests live under `tests/`. Smoke test at `tests/smoke.test.ts` is the canary.
- **Playwright** for end-to-end smoke tests at the route level. Wired in a follow-up slice (REQ-003).
- **@upstash/redis** for slug-keyed persistence. Wired in a follow-up slice (REQ-004) under `src/lib/kv.ts` with the `city:` namespace.
- **raw three** (no R3F) once the scene is added.
- **zod** for schema validation once the city schema lands.
- **Web Audio API** directly; no audio framework.

## Layout

```
/                  Repository root.
package.json       Single package; no workspaces in v1.
next.config.mjs    Next.js config; sets reactStrictMode and exposes NEXT_PUBLIC_APP_VERSION (git short sha or VERCEL_GIT_COMMIT_SHA fallback).
tsconfig.json      Strict TS5 config. Path alias @/* -> src/*.
vitest.config.ts   Vitest config. Path alias mirrors tsconfig.
.eslintrc.json     extends next/core-web-vitals.
src/app/           Next.js App Router routes.
src/components/    React UI components (added per slice).
src/game/          Engine and game logic (added per slice).
src/hooks/         React hooks (added per slice).
src/lib/           Pure utility modules (added per slice).
tests/             Vitest unit tests.
docs/              GDD, plan, ledgers.
```

## Bootstrap requirements

- **REQ-001 (this file):** Next.js 15 App Router + React 19 + TypeScript 5 scaffold matching VibeRacer's package.json. Done.
- **REQ-002:** Vitest unit test runner with one passing smoke test. Done.
- **REQ-003:** Playwright E2E runner with one passing smoke test against `/`. Pending follow-up slice.
- **REQ-004:** `@upstash/redis` client module ported as `src/lib/kv.ts` with `city:` namespace. Pending follow-up slice.
- **REQ-005:** Production build (`next build`) green. Done.

## Dev script contract

The following npm scripts must always exist and behave as documented:

- `npm run dev` runs the Next.js dev server.
- `npm run build` produces a production build. Must succeed at HEAD on `main` at all times.
- `npm run start` serves the production build.
- `npm run type-check` runs `tsc --noEmit` and must exit 0 on `main`.
- `npm run test` runs the Vitest suite once and must exit 0 on `main`.
- `npm run test:watch` runs Vitest in watch mode for local development.
- `npm run lint` runs `next lint`.

Future slices add `npm run test:e2e` for Playwright when REQ-003 lands.

## Out of scope for v1 bootstrap

- Tailwind, CSS-in-JS frameworks, design systems. Inline styles on App Router pages are fine until a styling pass is justified.
- Monorepo workspaces. The single-package layout is the v1 contract.
- Custom Next.js plugins, middleware (beyond what slug routing requires later), or edge runtime forcing.

### Build log

- 2026-05-03: REQ-001, REQ-002, REQ-005 landed. Files: `package.json`, `tsconfig.json`, `next.config.mjs`, `.eslintrc.json`, `.gitignore`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `tests/smoke.test.ts`, `src/AGENTS.md` (symlink to slice-discipline rule), `tests/AGENTS.md` (symlink to slice-discipline rule). Verified `npm run type-check`, `npm run test`, `npm run build` all green. Dash check clean. PR #N.
