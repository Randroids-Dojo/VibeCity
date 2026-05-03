# Identity

**Status:** partial

VibeCity has no sign-up. Identity is a per-browser anonymous id used to gate
who can overwrite a city's `:latest` snapshot. There is no profile, no email,
no password.

## What it is

- A v4 UUID minted on first visit and stored in a long-lived cookie.
- Cookie name: `vibecity.builderId`.
- Cookie max-age: one year (`60 * 60 * 24 * 365` seconds).
- Schema: `BuilderIdSchema` (zod `string().uuid()`) in `src/lib/schemas.ts`.
- Helpers: `readBuilderId`, `isValidBuilderId`, `newBuilderId` in
  `src/lib/builderId.ts`.

## What it does

- Tags every city created from this browser with the builder's id.
- Lets the persistence layer (REQ-014) accept overwrites only when the
  request's cookie matches the city's recorded `createdByBuilderId`.
- Gives the home page (REQ-050) the option to filter "cities I made" without
  any account flow.

## What it does NOT do

- It is NOT a user account. It does NOT carry a display name, an email, or
  any PII.
- It does NOT survive a cookie clear, a different browser, or a different
  device. Losing the cookie means losing edit rights to that browser's
  cities. v1 accepts this trade-off in exchange for zero sign-up friction.
- It is NOT authoritative for security-sensitive checks. A spoofed cookie
  value never grants ownership of someone else's slug because
  `createdByBuilderId` is the source of truth, not the cookie.
- v1 does NOT offer a "claim my cities on a new device" flow. Adopting one
  is a follow-up after sign-up arrives (out of scope per
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

- 2026-05-03: REQ-009 (anonymous owner identity) shipped. Added
  `src/lib/builderId.ts` with `BUILDER_ID_COOKIE` (`vibecity.builderId`),
  `BUILDER_ID_COOKIE_MAX_AGE_SEC` (1 year), `readBuilderId`,
  `isValidBuilderId`, `newBuilderId`. Added `BuilderIdSchema` and
  `BuilderId` type to `src/lib/schemas.ts`. 18 unit tests in
  `tests/lib/builderId.test.ts` cover minting, validation, schema,
  cookie constants. PR #N.
