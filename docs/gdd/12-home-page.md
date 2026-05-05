## 12. Home Page

**Status:** partial

The home page at `/` is the entry point for first-time visitors and returning builders. It mirrors VibeCity's build / drive loop in two halves: a recently-updated list of existing cities (drive in to one with a click) and a Create-new-slug input (build a new one by typing a slug).

This file is the canonical spec for the home-page requirements (REQ-011, REQ-050).

## Recently-updated list (REQ-011)

The list reads the `city:index` sorted set written by `PUT /api/city/[slug]` (REQ-014). Each save adds or updates the slug's score to `Date.now()`, so a `ZRANGE 0 N-1 REV` on the key returns the newest-first window the home page renders. The list defaults to twelve entries, which fills a default desktop viewport without paying for a large KV read; a future paginated route can opt into a larger limit, capped at `MAX_RECENT_SLUGS_LIMIT = 100` so an unbounded request cannot DoS KV.

Each entry in the list links to `/<slug>` (the drive view), not `/<slug>/edit`, because the home page is the entry point for visitors who want to look at cities other people built. A builder who owns the city sees the Edit CTA in the drive scene's top-right corner (REQ-026 partner) and can switch to editing in one click.

`recentSlugs(limit)` filters every member through `SlugSchema` so a malformed member written by an older writer (or by a manual KV edit) cannot leak into the home page UI as a broken link. Invalid members are skipped with a warning. Returns an empty list when KV is unconfigured so the local-dev experience without env vars is a clean empty state instead of a thrown error.

## Create-new-slug input (REQ-050)

The Create input lets a visitor type a slug and start building. The raw input is run through `normalizeSlug` (lowercase, drop disallowed characters, strip leading dashes, clamp to 128 chars) for a live preview, then validated against `SlugSchema` to gate the submit button. On submit, the form pushes `/<normalized>/edit`.

The preview shows the destination URL ("Will open /downtown/edit") so a visitor who typed `Downtown!` understands what slug they are about to create. An invalid input (e.g. all dashes, which `normalizeSlug` collapses to empty) shows a helper message and disables the submit button.

The form uses `aria-invalid`, `aria-live="polite"` on the preview, and a labelled input so a screen reader announces the normalized destination as the visitor types.

## Out of scope for v1

- Pagination or load-more on the recently-updated list.
- Search by slug substring or piece content.
- Per-user "my cities" filter (the home page is a global feed in v1; the builder cookie identity per REQ-009 is not exposed in the UI yet).
- Slug suggestions or random-slug button.
- Visual previews of saved cities; v1 ships a text list.

### Build log

- 2026-05-04: home page recent-slug cards gain "Updated N ago" timestamps. Pillar 2 ("Your city, your URL.") gets a freshness cue per card so a visitor reads at a glance whether each city was saved minutes, hours, days, or weeks ago. New `src/lib/relativeTime.ts` exports `formatRelativeTime(updatedAtMs, nowMs)` (pure formatter across the standard band table: just now / m / h / d / w / mo / y, with future-timestamp clock-skew defense and non-finite-input fallback to empty string), `RELATIVE_TIME_JUST_NOW_THRESHOLD_MS = 60_000`, `RELATIVE_TIME_JUST_NOW_LABEL = 'just now'`. `src/lib/recentSlugs.ts` ships a sibling `recentCities(limit)` reader plus a `RecentCityEntry = { slug, updatedAt }` type that mirrors the existing `recentSlugs` defensive contract (KV-unconfigured fallback, schema-skip with warn, limit cap) but reads `withScores: true` from `city:index` so the `Date.now()` score the PUT writer already records is available. `src/app/page.tsx` snapshots `Date.now()` once per request as `nowMs`, calls `recentCities()` instead of `recentSlugs()`, and renders each card as a `<Link>` containing the slug span plus a conditional `<time data-testid="home-recent-updated" data-updated-at={updatedAt} dateTime={iso} title={iso}>Updated {relative}</time>`. The `<time>` element is dropped when the formatter returns the empty string so a malformed score does not leak a stray cue. Files: `src/lib/relativeTime.ts`, `src/lib/recentSlugs.ts`, `src/app/page.tsx`, `tests/lib/relativeTime.test.ts`, `tests/lib/recentSlugs.test.ts`. PR #N.
- 2026-05-04: home page landed (REQ-011 reader + REQ-050 list and Create input). Files: `src/lib/recentSlugs.ts` (new pure helper that reads `city:index` via `kv.zrange(... { rev: true })`, validates members through `SlugSchema`, defaults to twelve entries, caps at `MAX_RECENT_SLUGS_LIMIT = 100`, falls back to an empty list when KV is unconfigured), `src/app/HomeCreateForm.tsx` (use-client form: raw input plus normalized preview plus submit gated on `SlugSchema.safeParse`, navigates via `useRouter().push('/<normalized>/edit')`), `src/app/page.tsx` (server component that calls `recentSlugs()` and renders the list plus the Create form, marked `export const dynamic = 'force-dynamic'` so the recently-updated list reflects the latest writes on every request). Tests: `tests/lib/recentSlugs.test.ts` (KV unconfigured, empty index, newest-first ordering, explicit limit, limit greater than count, zero / negative limit, MAX cap, invalid-member skip with warn, namespace key invariant), `e2e/home.spec.ts` (smoke for the home page surface, list empty-state, Create input flow with normalize preview and submit gate). The form's pure logic (`normalizeSlug` plus `SlugSchema`) is already covered by `tests/lib/schemas.test.ts`; the React surface is exercised end-to-end by the Playwright spec following the project pattern for client components. PR #N.
