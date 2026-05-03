# Progress Log

Newest entries first. Every implementation slice adds an entry. Append-only: never delete, never reorder, never edit a previous entry.

Format for each slice:

```
## YYYY-MM-DD, Short Title

- Branch: `feature/short-name`
- PR: #N (when known)
- Changed: one paragraph naming the user-facing change and the key files / helpers / defaults that landed.
- Verification: dash checks, type-check, relevant unit tests, build, smoke (where applicable). Note any known-tolerated lint warnings or skipped checks.
- Assumptions: assumptions made under a Recommended default. One sentence per assumption.
- GDD coverage: which rows in `docs/GDD_COVERAGE.json` flipped to `partial` or `done`, or which `docs/gdd/*.md` files gained a Build log entry.
- Followups: any new `F-NNN` entries created. Link to them.
```

## 2026-05-03, arc45 + diagonal Piece Schema: REQ-061, REQ-062

- Branch: `feature/req-061-062-arc45-diagonal`
- PR: #N (when known)
- Changed: ported VibeRacer's 2026-05-03 piece taxonomy expansion (arc45, diagonal) into VibeCity's `PieceTypeSchema`. Extended the enum from 11 to 13 members. Updated the PieceTypeSchema doc comment to describe arc45 as the cardinal-to-corner bridge and diagonal as the corner-to-corner straight, and to flag REQ-063 (8-direction connectors) as the runtime dependency that lands later. Extended `tests/lib/schemas.test.ts` from 50 to 57 cases: PieceTypeSchema accepts both new types, PieceSchema accepts arc45 / diagonal at every cardinal rotation, arc45 with explicit single-cell footprint, both reject non-cardinal rotations (45, 135), and a CitySchema scenario chains `straight -> arc45 -> diagonal -> diagonal -> arc45`. Updated `docs/gdd/06-city-schema.md` Piece type taxonomy section to enumerate arc45 / diagonal with their connector roles, and appended a Build log entry. Flipped REQ-061 and REQ-062 in `docs/GDD_COVERAGE.json` from `not_started` to `partial` (schema landed; runtime parts deferred). Refreshed F-002 watch list to mark arc45 and diagonal merged upstream. Opened F-003 (sampled path geometry), F-004 (wheel contact), F-005 (pace notes), F-006 (difficulty scoring), F-007 (editor palette UI) for the deferred runtime work.
- Verification: `npm run type-check` exited 0. `npm run test` reported 106/106 pass (99 prior + 7 new arc45 / diagonal cases). `npm run build` produced a green production build. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: VibeCity ports the schema entry now even though the editor, sampled path, wheel contact, pace notes, and difficulty scoring are not yet wired. Saved cities containing arc45 / diagonal placements will validate and round-trip through the schema, but they will not render or drive correctly until the runtime port lands. This matches the existing pattern for hairpin / mega-sweep schema entries: the type enum has been ahead of the runtime port since the PieceTypeSchema landed. Per Q-006 default A, every Phase 1 piece that merges upstream is in scope for VibeCity, with city-merit re-evaluation deferred to the editor palette landing slice (F-007).
- GDD coverage: REQ-061 flipped `not_started` to `partial`. REQ-062 flipped `not_started` to `partial`. `docs/gdd/06-city-schema.md` Build log gained an entry for arc45 / diagonal.
- Followups: F-003 (sampled path geometry), F-004 (wheel contact), F-005 (pace notes), F-006 (difficulty scoring), F-007 (editor palette UI) opened.

## 2026-05-03, Builder Id: REQ-009

- Branch: `feature/req-009-builder-id`
- PR: #N (when known)
- Changed: ported VibeRacer's `src/lib/racerId.ts` into VibeCity as `src/lib/builderId.ts`. New exports: `BUILDER_ID_COOKIE` (`vibecity.builderId`), `BUILDER_ID_COOKIE_MAX_AGE_SEC` (1 year), `readBuilderId()` (Next.js App Router cookie reader), `isValidBuilderId(value)` (UUID v4 regex matching VibeRacer's), `newBuilderId()` (`crypto.randomUUID()`). Added `BuilderIdSchema` (zod `string().uuid()`) and `BuilderId` type to `src/lib/schemas.ts`. Added `tests/lib/builderId.test.ts` with 18 cases covering minting, regex validation (accept v4, reject empty / non-UUID / v1 / bad variant / uppercase / extra chars), cookie constants, and BuilderIdSchema accept/reject. Drafted `docs/gdd/05-identity.md` as the canonical identity spec covering REQ-009 plus forward-looking notes on REQ-014 ownership gating. Indexed the new GDD file in `docs/gdd/README.md`.
- Verification: `npm run type-check` exited 0. `npm run test` reported 99/99 pass (81 prior + 18 builderId cases). `npm run build` produced a green production build. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: Cookie namespace uses `vibecity.` prefix (separate from VibeRacer's `viberacer.`) so a player visiting both projects in one browser gets distinct ids. UUID v4 regex mirrors VibeRacer's lowercase-only hex pattern (matches the canonical `crypto.randomUUID()` output) so callers that move ids between projects do not need to renormalize. The cookie is NOT set by this slice; setting / refreshing the cookie lives in the route layer that issues it on first visit (REQ-006 / REQ-007 fresh-slug landings) and in REQ-014's PUT handler. v1 does not offer a "claim cities on a new device" flow; losing the cookie loses edit rights to that browser's cities, by design.
- GDD coverage: REQ-009 flipped `not_started` to `done`. `docs/gdd/05-identity.md` drafted with `Status: partial` (REQ-014 ownership-gating still pending in this section's coverage scope).
- Followups: none new.

## 2026-05-03, City Hash: REQ-013

- Branch: `feature/req-013-city-hash`
- PR: #N (when known)
- Changed: added `src/lib/hashCity.ts` exporting `hashCity(city)` (sha256 hex digest branded as `CityVersionHash`) and `canonicalCityJson(city)` (the deterministic JSON form fed to the digest). Mirrors VibeRacer's `src/lib/hashTrack.ts` pattern: pieces sorted by `(row, col, type, rotation)`, buildings sorted by the same key, footprint omitted when it resolves to the single-cell default `[{ dr: 0, dc: 0 }]`, otherwise normalized (deduped, `-0` collapsed to `0`, sorted by `(dr, dc)`). City `mood` is excluded from the hash by design (REQ-013) so adding or changing the mood on an existing city keeps every prior version reference intact. Added `tests/lib/hashCity.test.ts` with 18 cases covering format, determinism, mood exclusion, footprint canonicalization (omit / order / -0 collapse), and change detection across piece type / coordinates / rotation / building type. Updated `docs/gdd/06-city-schema.md` Status to `partial` -> still partial (REQ-059 / 063 / 064 pending) with a new Build log entry.
- Verification: `npm run type-check` exited 0. `npm run test` reported 81/81 pass (63 prior + 18 hashCity cases). `npm run build` produced a green production build. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: Hash format is sha256 hex 64-char (matches VibeRacer's `hashTrack` output shape so external tooling can treat both projects' version hashes the same way). v1 footprint normalization handles dedupe / `-0` collapse / sort but not rotation symmetry: two pieces that resolve to the same shape under different rotations still hash differently because `rotation` is part of the canonical form (matches VibeRacer). The `Pick<City, 'pieces' | 'buildings'>` parameter shape lets callers pass partial inputs (e.g. an editor's working state) without first constructing a full `City` value. `branchEdges` and `checkpoints` from VibeRacer's `hashTrack` are intentionally not ported: VibeCity does not have lap timing, and branch edges land in the REQ-064 segment-based path slice if needed.
- GDD coverage: REQ-013 flipped `not_started` to `done`. `docs/gdd/06-city-schema.md` Build log gained an entry for REQ-013.
- Followups: none new.

## 2026-05-03, City Schema: REQ-012

- Branch: `feature/req-012-city-schema`
- PR: #N (when known)
- Changed: added the canonical `CitySchema` zod definition and supporting types to `src/lib/schemas.ts`. New exports: `PieceTypeSchema` (11 piece types covering REQ-017 / 018 / 019 / 058 / 060), `RotationSchema`, `PieceFootprintCellSchema`, `PieceSchema`, `BuildingTypeSchema` (4-type v1 palette per Q-004 default B), `BuildingSchema`, `CityMoodSchema`, `CitySchema` (`pieces[]`, `buildings[]`, optional `mood`, strict on unknown fields), `EMPTY_CITY` constant, and `MAX_PIECES_PER_CITY` (256) / `MAX_BUILDINGS_PER_CITY` (512) limits. Extended `tests/lib/schemas.test.ts` from 19 to 50 cases covering accept / reject paths for piece / building / mood / city plus EMPTY_CITY round-trip. Drafted `docs/gdd/06-city-schema.md` as the canonical city schema spec covering REQ-012 plus forward-looking notes on REQ-013 hash stability and REQ-059 / 063 / 064 plumbing. Indexed the new GDD file in `docs/gdd/README.md`.
- Verification: `npm run type-check` exited 0. `npm run test` reported 63/63 pass (13 prior + 50 schema cases). `npm run build` produced a green production build. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: Mood `timeOfDay` / `weather` are typed as bounded short strings rather than enums because the lighting / weather modules have not been ported; tightening to enums waits for that slice. The `intersection` piece type is added to the enum now so REQ-019 has a schema landing pad ahead of editor support; the schema does not gate placeability beyond the type enum (UI can hide pieces independently). v1 buildings are single-cell only (Q-004 default B); multi-cell footprints (option C) stay out of scope.
- GDD coverage: REQ-012 flipped `not_started` to `done`. `docs/gdd/06-city-schema.md` drafted with `Status: partial` (REQ-013, REQ-059, REQ-063, REQ-064 still pending in this section's coverage scope).
- Followups: none new.

## 2026-05-03, KV Module: REQ-004

- Branch: `feature/req-004-kv-module`
- PR: #N (when known)
- Changed: ported VibeRacer's `src/lib/kv.ts` into VibeCity with the `city:` namespace. Added `@upstash/redis ^1.37.0` to dependencies. Added `src/lib/kv.ts` exporting `getKv()` (lazy singleton), `hasKvConfigured()` (env probe for graceful empty-city fallback per REQ-015), `kvKeys` (`cityLatest`, `cityVersion`, `cityVersions`, `cityIndex`), and a nominal `CityVersionHash` brand type. Added `tests/lib/kv.test.ts` with 11 cases covering env-toggle, key shape, prefix invariant, and throw-on-unset. Drafted `docs/gdd/03-persistence.md` as the canonical persistence spec (backing store, key namespace table, read path, write path, out-of-scope fence). Indexed it in `docs/gdd/README.md`. Updated `docs/gdd/02-tech-stack.md` to flip REQ-004 from pending to done and added a build log entry.
- Verification: `npm run type-check` exited 0. `npm run test` reported 32/32 pass (21 prior + 11 new kv cases). `npm run build` produced a green production build. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: Only the keys VibeCity v1 needs are exported; racing-only keys (leaderboards, replays, anticheat tokens) intentionally omitted (per Q-003 default A copy-port: take only what city scope needs). `getKv()` is lazy so importing the module from a route that does not need persistence (e.g. `/`) does not crash on missing env. `hasKvConfigured()` is the soft-fallback gate; callers that want graceful empty-city behavior branch on it before calling `getKv()`.
- GDD coverage: REQ-004 flipped `not_started` to `done`. `docs/gdd/03-persistence.md` drafted with `Status: partial` (REQ-014, REQ-015, REQ-052 still pending in this section's coverage scope).
- Followups: none new.

## 2026-05-03, Slug Schema: REQ-008

- Branch: `feature/req-008-slug-schema`
- PR: #2 (when known)
- Changed: ported VibeRacer's `SlugSchema` and `normalizeSlug` helper into VibeCity. Added `zod ^3.23.0` to dependencies. Added `src/lib/schemas.ts` with `SlugSchema` (kebab-case, 1 to 128 chars, `^[a-z0-9][a-z0-9-]*$`) plus a `Slug` type and `normalizeSlug(raw)` helper. Added `tests/lib/schemas.test.ts` with 19 cases covering accept / reject / normalize. Drafted `docs/gdd/04-slug-routing.md` as the canonical spec for slug routing (REQ-006, REQ-007, REQ-008, REQ-010, REQ-011, REQ-048, REQ-049). Indexed the new GDD file in `docs/gdd/README.md`.
- Verification: `npm run type-check` exited 0. `npm run test` reported 21/21 pass (2 prior smoke + 19 new schema cases). `npm run build` produced a green production build. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: Slug shape mirrors VibeRacer 1:1 (per Q-003 default A copy-port). `normalizeSlug` makes no guarantee that its output passes the schema; callers must validate before storage. Reserved slug list and rename / redirect are out of scope for v1.
- GDD coverage: REQ-008 flipped `not_started` to `done`. `docs/gdd/04-slug-routing.md` drafted with `Status: partial` (REQ-006, REQ-007, REQ-010, REQ-011, REQ-048, REQ-049 still pending in this section's coverage scope).
- Followups: none new.

## 2026-05-03, Project Bootstrap: REQ-001, REQ-002, REQ-005

- Branch: `feature/req-001-002-005-bootstrap`
- PR: #1
- Changed: stood up the VibeCity Next.js 15 App Router scaffold with React 19, TypeScript 5 strict, and Vitest 2. Added `package.json` (mirrors VibeRacer's core dep set minus three / zod / @upstash/redis / Playwright; those land in their own slices), `tsconfig.json` (strict, `@/*` -> `src/*`), `next.config.mjs` (resolves `NEXT_PUBLIC_APP_VERSION` from git short sha or `VERCEL_GIT_COMMIT_SHA`), `.eslintrc.json` (extends `next/core-web-vitals`), `.gitignore` (Next.js + Playwright + env + `.claude/` patterns), `vitest.config.ts` (path alias mirrors tsconfig, scoped to `tests/`). Added `src/app/layout.tsx` (root layout, plain HTML scaffold), `src/app/page.tsx` (placeholder home page with the project pitch), and `tests/smoke.test.ts` (two assertions to confirm Vitest runs). Symlinked `.claude/rules/slice-discipline.md` into `src/AGENTS.md` and `tests/AGENTS.md` per `AGENTS.md` guidance so Codex picks it up. Drafted `docs/gdd/02-tech-stack.md` as the canonical bootstrap spec.
- Verification: `npm install` (341 packages added). `npm run type-check` exited 0. `npm run test` reported 2/2 pass. `npm run build` produced 4 prerendered routes and reported 102 kB First Load JS. Em-dash grep clean. `git diff --check` clean. JSON syntax of GDD_COVERAGE.json validated.
- Assumptions: Inline-style placeholder home page is acceptable until a styling pass is justified (matches v1 minimalism). Single-package layout with no workspaces (per Q-003 default A: copy-paste port from VibeRacer, not a workspace). Vitest tests live under `tests/` (matches VibeRacer convention). Playwright (REQ-003) and KV (REQ-004) deferred to follow-up slices to keep this PR small.
- GDD coverage: REQ-001, REQ-002, REQ-005 flipped `not_started` -> `done`. `docs/gdd/02-tech-stack.md` drafted with `Status: partial` (REQ-003, REQ-004 still pending in this section's coverage scope).
- Followups: none new.

## 2026-05-03, REQ-065 Added: wheelContact Multi-Locator Atomic Row

- Branch: `setup/spiral` (continuation of scaffold seed)
- PR: N/A (scaffold seed; no code yet)
- Changed: split out the wheelContact multi-locator extension (introduced in VibeRacer PR #81) as its own atomic coverage row REQ-065 so a future port slice can't ship the hairpin schema without the drive-side support. Verified the diff against VibeRacer commit `4143c77`: `wheelTrackContact` now reads `path.cellToLocators` (fallback to `cellToOrderIdx`), iterates every candidate piece index for the wheel's cell, computes `distanceToCenterline` against each, and picks the closest. Sharpened REQ-032 (drive-mode wheel-contact reuse) to explicitly require REQ-065. Sharpened REQ-060 (hairpin) to call out REQ-065 as a drive-side dependency without which hairpins are placeable but not drivable.
- Verification: em-dash grep clean across edited files. JSON syntax validated. REQ row count: 65.
- Assumptions: cellToLocators is populated by the segment-based path build (REQ-064, port from PR #76). REQ-065 depends on REQ-064 transitively. The fallback to cellToOrderIdx preserves single-segment behavior so legacy tracks (and v1 cities with no multi-cell pieces) keep working without the locator map.
- GDD coverage: REQ-032 description sharpened. REQ-060 description sharpened. REQ-065 added as `not_started`.
- Followups: none new.

## 2026-05-03, VibeRacer Hairpin (PR #81) Auto-Adopted

- Branch: `setup/spiral` (continuation of scaffold seed)
- PR: N/A (scaffold seed; no code yet)
- Changed: VibeRacer PR #81 (hairpin) merged at 21:17. Per Q-006 default A (auto-adopt every shipped piece), REQ-060 promoted from "auto-in scope once upstream merges" to unconditionally in v1 scope. Row description sharpened to record what hairpin actually ships with: 2x3 implicit footprint, 65-sample centerline, rotated connector ports on footprint cells, wheel contact extended via footprint locators. F-002 watch list updated to mark hairpin merged. 45-arc (1c) and diagonal (1d) remain "not started upstream"; they will auto-flip the same way when their PRs merge.
- Verification: confirmed `origin/main` PieceTypeSchema includes `'hairpin'` alongside `'megaSweepRight'` / `'megaSweepLeft'`. Em-dash grep clean. JSON syntax validated.
- Assumptions: hairpin's wheel contact extension (footprint locators) is part of the port surface, not just the piece definition. The VibeCity port slice for REQ-060 must include the `src/game/wheelContact.ts` change from PR #81.
- GDD coverage: REQ-060 description updated. No status flip (still `not_started` because no VibeCity code yet).
- Followups: F-002 watch list now reads: PRs #75-79 merged (Phase 0 plumbing), PR #80 merged (mega sweep), PR #81 merged (hairpin), 45-arc / diagonal / junction not started upstream.

## 2026-05-03, Q-006 Resolved: Auto-Adopt Upstream Pieces

- Branch: `setup/spiral` (continuation of scaffold seed)
- PR: N/A (scaffold seed; no code yet)
- Changed: resolved Q-006 to default A (auto-adopt every VibeRacer piece on upstream merge). Re-verified upstream state: VibeRacer main has merged PRs #75-79 (Phase 0 plumbing) and PR #80 (Phase 1a mega sweep). Hairpin is on `feature/hairpin-track-piece` branch in VibeRacer with `'hairpin'` already in `PieceTypeSchema`, but not yet pushed to a PR. Updated F-002 watch-list to reflect actual merge status (Phase 0 + 1a confirmed merged, hairpin in flight, 1c / 1d not started, Phase 3 junction not started). Per Q-006 resolution, REQ-058 (mega sweep) is unconditionally in v1 scope, and REQ-060 / 061 / 062 (hairpin / 45-arc / diagonal) auto-flip into scope when each upstream PR merges.
- Verification: em-dash grep clean. JSON syntax validated.
- Assumptions: VibeCity tracks VibeRacer's editor vocabulary 1:1. If a piece turns out to feel wrong in a city, the response is to hide it from the palette in a follow-up, not to skip the port.
- GDD coverage: no row status flips this slice. Q-006 resolution recorded in OPEN_QUESTIONS.md.
- Followups: F-002 watch list refreshed to reflect actual upstream merge status.

## 2026-05-03, VibeRacer Mega Sweep + Phase 1 Roadmap Wired

- Branch: `setup/spiral` (continuation of scaffold seed)
- PR: N/A (scaffold seed; no code yet)
- Changed: surfaced VibeRacer's in-flight track-piece roadmap and pulled the relevant rows into VibeCity scope. Added REQ-058 (megaSweep palette entry, port from VibeRacer PR #80), REQ-059 (multi-cell footprint plumbing, port from VibeRacer Phase 0c), REQ-060 (hairpin, future), REQ-061 (45-arc, future), REQ-062 (diagonal, future), REQ-063 (8-direction connectors, port from VibeRacer Phase 0d), REQ-064 (segment-based path with cellToLocators, port from VibeRacer Phase 0b). Updated REQ-019 to note that VibeCity's 4-way intersection extends VibeRacer's planned Phase 3 3-connector junction. Sharpened `01-vision-and-pillars.md` reuse map with two new bullets covering the Phase 0 plumbing and the Phase 1 piece taxonomy. Opened Q-006 (Phase 1 adoption cadence; default: per-piece city merit eval). Opened F-002 (watch upstream VibeRacer piece additions).
- Verification: em-dash grep clean across edited files. JSON syntax validated.
- Assumptions: VibeRacer PR #80 will merge as written, shipping `megaSweepRight` / `megaSweepLeft` with 3x3 implicit footprints and 49-sample centerlines (Q-006 default B). Hairpin and corner-connector pieces (1b / 1c / 1d) are NOT in VibeCity v1 scope by default; each requires a separate adoption slice gated by city-merit eval.
- GDD coverage: REQ-019 description sharpened. REQ-058 through REQ-064 added as `not_started`. No status flips on the rest.
- Followups: F-002 tracks upstream VibeRacer piece additions.

## 2026-05-03, Vision and Coverage Seeded

- Branch: `setup/spiral` (continuation of scaffold init)
- PR: N/A (scaffold seed; no code yet)
- Changed: drafted `docs/gdd/01-vision-and-pillars.md` (pitch, three pillars, NOT-list, reuse map from VibeRacer, out-of-scope index), drafted `docs/gdd/99-out-of-scope.md` (SimCity layers, racing layers, multiplayer, auth, polish, anti-features), updated `docs/gdd/README.md` index to reference both, replaced placeholder rows in `docs/GDD_COVERAGE.json` with 57 atomic seed rows covering bootstrap, slug routing, schema, persistence, editor, building palette, drive mode, settings, scene, and home page. Updated `docs/OPEN_QUESTIONS.md`: resolved Q-001 (first GDD section), opened Q-002 (build/drive page topology), Q-003 (VibeRacer reuse mechanism), Q-004 (v1 building palette breadth), Q-005 (drive-mode building collision model).
- Verification: em-dash grep clean across `docs/gdd/*.md`, `docs/GDD_COVERAGE.json`, `docs/OPEN_QUESTIONS.md`. JSON syntax validated.
- Assumptions: VibeRacer vehicle / wheel-contact / camera / input modules will be copy-ported into VibeCity (Q-003 default A). Build / drive will live as two routes with prefetch-smooth transitions (Q-002 default C). v1 building palette is four placeholder primitive types (Q-004 default B). Buildings collide with car as off-street penalty cells, not hard walls (Q-005 default A).
- GDD coverage: REQ-056 (out-of-scope file) and REQ-057 (vision drafted) marked `done`. The other 55 rows seeded as `not_started` and ready for the loop to pick up.
- Followups: none new from this slice; F-001 (draft first GDD section) is now satisfied and should be marked resolved in `FOLLOWUPS.md`.

## 2026-05-03, Spiral Scaffold Initialized

- Branch: `setup/spiral`
- Changed: bootstrapped the VibeCity scaffold using the `spiral` skill. Created `AGENTS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/WORKING_AGREEMENT.md`, `docs/gdd/README.md`, `docs/GDD_COVERAGE.json`, `docs/PROGRESS_LOG.md`, `docs/OPEN_QUESTIONS.md`, `docs/FOLLOWUPS.md`, `docs/PLAYTEST.md`, and `docs/FUN_FACTOR_AUDIT.md`.
- Verification: em-dash grep returned nothing.
- Assumptions: the GDD will be drafted under `docs/gdd/` at requirement granularity per the anti-Flatline guardrail in `docs/gdd/README.md`.
- GDD coverage: ledger created with two example rows; replace these with real requirements before opening any feature PRs.
- Followups: F-001 to draft the first GDD section (vision and pillars).