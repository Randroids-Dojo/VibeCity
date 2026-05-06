# Identity

**Status:** partial

VibeCity has no sign-up. Identity is a per-browser anonymous id used to
attribute saves to a builder for activity tracking and future "cities I
made" surfaces. VibeCity is open-edit: any visitor can overwrite any
slug, so the builder id is identity-only, not a write gate. There is no
profile, no email, no password.

## What it is

- A v4 UUID minted on first visit and stored in a long-lived cookie.
- Cookie name: `vibecity.builderId`.
- Cookie max-age: one year (`60 * 60 * 24 * 365` seconds).
- Schema: `BuilderIdSchema` (zod `string().uuid()`) in `src/lib/schemas.ts`.
- Helpers: `readBuilderId`, `isValidBuilderId`, `newBuilderId` in
  `src/lib/builderId.ts`.

## What it does

- Tags every save with the builder's id (carried in the request cookie) so
  a future activity surface can show "cities recently edited from this
  browser" without an account flow.
- Gives the persistence layer (REQ-014) a stable identity for the PUT
  path; the route validates the cookie shape but does not gate writes
  per cookie. Open-edit is a core tenant of VibeCity.
- Gives the home page (REQ-050) the option to filter "cities I made"
  client-side without any account flow.

## What it does NOT do

- It is NOT a user account. It does NOT carry a display name, an email, or
  any PII.
- It does NOT survive a cookie clear, a different browser, or a different
  device. Losing the cookie costs the visitor their per-browser activity
  history but does NOT cost them edit access (open-edit means any cookie
  works).
- It is NOT a write gate. VibeCity is open-edit; the cookie validates
  identity shape only.
- v1 does NOT offer a "merge my cookies across devices" flow. Adopting
  one is a follow-up after sign-up arrives (out of scope per
  `99-out-of-scope.md`).

## Reuse from VibeRacer

Ported as-is from `src/lib/racerId.ts`:

- UUID v4 minting via `crypto.randomUUID()`.
- Lowercase hex regex for the validity check.
- `cookies()` server-side reader (Next.js App Router).

Differences from VibeRacer:

- Cookie name uses the `vibecity.` prefix so a player visiting both projects
  in the same browser gets a distinct id per project.
- Type alias is `BuilderId` (not `RacerId`).

### Build log

- 2026-05-05: Open-edit pivot landed (REQ-009 + REQ-014). The cookie is now identity-only; the PUT route at `src/app/api/city/[slug]/route.ts` no longer reads `city:${slug}:owner` or returns 403 on a cookie mismatch. Spec text in this file rewritten to match: "What it is" frames the cookie as identity-only, "What it does" drops the per-cookie write-gate language, "What it does NOT do" is rewritten so a cookie clear costs activity history but not edit access. PR #N.
- 2026-05-03: REQ-009 (anonymous owner identity) shipped. Added
  `src/lib/builderId.ts` with `BUILDER_ID_COOKIE` (`vibecity.builderId`),
  `BUILDER_ID_COOKIE_MAX_AGE_SEC` (1 year), `readBuilderId`,
  `isValidBuilderId`, `newBuilderId`. Added `BuilderIdSchema` and
  `BuilderId` type to `src/lib/schemas.ts`. 18 unit tests in
  `tests/lib/builderId.test.ts` cover minting, validation, schema,
  cookie constants. PR #N.
