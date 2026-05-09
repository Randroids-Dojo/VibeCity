import {
  BUILDER_ID_COOKIE,
  BUILDER_ID_COOKIE_MAX_AGE_SEC,
  isValidBuilderId,
  newBuilderId,
} from '@/lib/builderId'
import { createAnonCookieMiddleware } from '@/lib/auth/anonCookie'

/**
 * Issue the anonymous `vibecity.builderId` cookie on first visit
 * (REQ-009). Delegates to the generic `createAnonCookieMiddleware`
 * factory in `@/lib/auth/anonCookie` so the propagation logic
 * (read existing, validate, mint on miss, write to request + response
 * cookies, set httpOnly / sameSite / maxAge) is shared with any
 * future game on the same anonymous-id pattern.
 *
 * The autosave path (REQ-025) writes through `PUT /api/city/[slug]`
 * which requires a valid builder id cookie (REQ-014). Without an
 * issuer, every first-time author would hit a 401 on their first edit.
 *
 * The matcher excludes Next.js internal asset paths and any URL with
 * a file extension so static assets do not pay the cookie issuance
 * cost on every request.
 */
export const middleware = createAnonCookieMiddleware({
  cookieName: BUILDER_ID_COOKIE,
  maxAgeSec: BUILDER_ID_COOKIE_MAX_AGE_SEC,
  isValid: isValidBuilderId,
  mintId: newBuilderId,
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
