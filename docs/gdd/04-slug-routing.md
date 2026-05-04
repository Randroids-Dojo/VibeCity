# 4. Slug Routing and Slug Validation

**Status:** done

VibeCity addresses cities by URL slug. The same slug owns a drive view at `/<slug>` and an editor view at `/<slug>/edit`. The slug is the share unit, the storage key suffix in `city:${slug}:latest`, and the only piece of state in the URL outside optional version pins.

This file is the canonical spec for the slug routing requirements (REQ-006, REQ-007, REQ-008, REQ-010, REQ-011, REQ-048, REQ-049). Slug validation (REQ-008) is the first piece to land because every other slug-aware route depends on it.

## Slug shape

- kebab-case
- 1 to 128 characters
- first character must be `[a-z0-9]`
- remaining characters are `[a-z0-9-]`
- regex: `/^[a-z0-9][a-z0-9-]*$/`

This matches VibeRacer's `SlugSchema` exactly. The two projects are intentionally interchangeable on slug shape so muscle memory transfers and documentation can be reused.

The `normalizeSlug(raw)` helper is a best-effort coercion for raw user input on the home page Create flow. It lowercases, drops disallowed characters, strips a leading run of dashes, and clamps to 128 chars. Output is not guaranteed to satisfy `SlugSchema`; the caller must validate before use. (An all-dash input collapses to empty, which the schema rejects.)

## Routes (planned)

- `/` home page (REQ-050): list of recently-updated slugs plus a Create input.
- `/<slug>` drive view (REQ-006). Renders the empty-city landing if no city is saved at the slug, otherwise the drive scene.
- `/<slug>/edit` editor view (REQ-007).
- `/<slug>?v=<hash>` and `/<slug>/edit?v=<hash>` pin to a historical version (REQ-048, REQ-049).

These routes are wired in their own slices.

## Version pinning (REQ-048, REQ-049)

Both the editor and the drive view accept an optional `?v=<hash>` query parameter that pins the page's initial load to a specific historical version of the saved city.

- Hash format: sha256 hex digest, exactly 64 lowercase hex characters (REQ-013).
- A malformed hash (wrong length, mixed case, non-hex characters, empty string, array-shaped value such as `?v=a&v=b`) fails the route via `notFound()` so a broken share link surfaces the framework 404 instead of silently falling through to the latest version.
- A well-formed hash that does not exist in KV (because that version was never saved, or KV is unconfigured) resolves to `EMPTY_CITY` via `loadCity`'s missing-version branch. The page still renders, the URL is still meaningful, and the empty-state prompt invites the player to start over.
- Editor + pinned version: loading a pinned version into the editor and then making an edit forks. The next autosave PUT writes a fresh `:latest` pointer for the slug, mirroring VibeRacer's "edit-from-history" semantics. v1 does not surface a "you are viewing a historical version" banner; the URL itself is the only signal. Adding the banner is a separate polish slice.

The shared validation lives in `src/lib/cityVersion.ts` (`VERSION_HASH_RE`, `parseCityVersionHash`, `readVersionParam`) and is consumed by:

- `src/app/api/city/[slug]/route.ts` GET handler (returns 400 on rejection).
- `src/app/[slug]/page.tsx` drive-view page (calls `notFound()` on rejection).
- `src/app/[slug]/edit/page.tsx` editor page (calls `notFound()` on rejection).

## Out of scope for v1

- Reserved slugs (e.g. `admin`, `api`). Reservations are added when a real conflict surfaces.
- Slug rename / redirect. v1 slugs are immutable; create a new slug to fork.
- Per-user slug namespaces. Anonymous identity owns the slug, and the slug is a flat global namespace.

### Build log

- 2026-05-04: REQ-048 + REQ-049 landed. `/<slug>?v=<hash>` and `/<slug>/edit?v=<hash>` now pin the page's initial load to a historical version. Added `src/lib/cityVersion.ts` (`VERSION_HASH_RE = /^[0-9a-f]{64}$/`, `parseCityVersionHash` for raw hex strings, `readVersionParam` that wraps the `string | string[] | undefined` shape Next.js delivers in `searchParams`). The API route `src/app/api/city/[slug]/route.ts` was migrated off its local `parseVersionHash` helper to the shared `parseCityVersionHash` so the accept / reject contract is identical across the API route and both pages. `src/app/[slug]/page.tsx` and `src/app/[slug]/edit/page.tsx` now accept `searchParams: Promise<{ v?: string | string[] }>`, validate the `v` field through `readVersionParam`, and call `notFound()` on a malformed pin. A well-formed but unknown hash falls through to `EMPTY_CITY` via `loadCity`. Files: `src/lib/cityVersion.ts`, `src/app/api/city/[slug]/route.ts`, `src/app/[slug]/page.tsx`, `src/app/[slug]/edit/page.tsx`, `tests/lib/cityVersion.test.ts`, `tests/app/editRoute.test.ts`, `tests/app/driveRoute.test.ts`, `tests/app/cityRoute.test.ts`. PR #N.
- 2026-05-03: REQ-007 landed. Added `src/app/[slug]/edit/page.tsx` (Next.js 15 async server component for the editor route, awaits `params`, reuses `parseSlugParam` from the parent route, calls `notFound()` on invalid input, otherwise renders the editor placeholder shell with a Drive CTA linking back to `/<slug>`). The actual editor surface (snap grid, palette, place / rotate / erase, autosave) is deferred to its own slices (REQ-016 onward); this slice exists so the fresh-slug landing's "Create this city" CTA has a valid target instead of producing a 404. Files: `src/app/[slug]/edit/page.tsx`, `tests/app/editRoute.test.ts` (8 cases covering rejection paths via `notFound()` throw). Verified `npm run type-check`, `npm run test`, `npm run build` all green. PR #N.
- 2026-05-03: REQ-006 + REQ-010 landed. Added `src/app/[slug]/page.tsx` (server component for the drive-view route, validates slug, renders fresh-slug landing) and `src/app/[slug]/slugRoute.ts` (`parseSlugParam` helper that wraps `SlugSchema.safeParse` and returns `null` on failure for `notFound()` plumbing). Empty-city landing offers a "Create this city" CTA linking to `/<slug>/edit`. Drive-scene branch (REQ-031) and saved-city load (REQ-015) deferred to their own slices. Files: `src/app/[slug]/page.tsx`, `src/app/[slug]/slugRoute.ts`, `tests/app/slugRoute.test.ts` (13 cases covering accept / reject paths). Verified `npm run type-check`, `npm run test`, `npm run build` all green. PR #N.
- 2026-05-03: REQ-008 landed. Added `zod` to dependencies. Files: `src/lib/schemas.ts` (`SlugSchema`, `Slug` type, `normalizeSlug` helper), `tests/lib/schemas.test.ts` (19 cases covering accept / reject / normalize). Verified `npm run type-check`, `npm run test`, `npm run build` all green. PR #2.
