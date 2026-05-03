# 4. Slug Routing and Slug Validation

**Status:** partial

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

These routes are wired in their own slices. This section's `partial` status reflects that REQ-008 has landed but REQ-006, REQ-007, REQ-010, REQ-011, REQ-048, REQ-049 have not.

## Out of scope for v1

- Reserved slugs (e.g. `admin`, `api`). Reservations are added when a real conflict surfaces.
- Slug rename / redirect. v1 slugs are immutable; create a new slug to fork.
- Per-user slug namespaces. Anonymous identity owns the slug, and the slug is a flat global namespace.

### Build log

- 2026-05-03: REQ-006 + REQ-010 landed. Added `src/app/[slug]/page.tsx` (server component for the drive-view route, validates slug, renders fresh-slug landing) and `src/app/[slug]/slugRoute.ts` (`parseSlugParam` helper that wraps `SlugSchema.safeParse` and returns `null` on failure for `notFound()` plumbing). Empty-city landing offers a "Create this city" CTA linking to `/<slug>/edit`. Drive-scene branch (REQ-031) and saved-city load (REQ-015) deferred to their own slices. Files: `src/app/[slug]/page.tsx`, `src/app/[slug]/slugRoute.ts`, `tests/app/slugRoute.test.ts` (13 cases covering accept / reject paths). Verified `npm run type-check`, `npm run test`, `npm run build` all green. PR #N.
- 2026-05-03: REQ-008 landed. Added `zod` to dependencies. Files: `src/lib/schemas.ts` (`SlugSchema`, `Slug` type, `normalizeSlug` helper), `tests/lib/schemas.test.ts` (19 cases covering accept / reject / normalize). Verified `npm run type-check`, `npm run test`, `npm run build` all green. PR #2.
