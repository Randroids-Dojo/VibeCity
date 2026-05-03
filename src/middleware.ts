import { NextResponse, type NextRequest } from 'next/server'
import {
  BUILDER_ID_COOKIE,
  BUILDER_ID_COOKIE_MAX_AGE_SEC,
  isValidBuilderId,
  newBuilderId,
} from '@/lib/builderId'

/**
 * Issue the anonymous `vibecity.builderId` cookie on first visit (REQ-009).
 *
 * The autosave path (REQ-025) writes through `PUT /api/city/[slug]` which
 * requires a valid builder id cookie (REQ-014). Without an issuer, every
 * first-time author would hit a 401 on their first edit. This middleware
 * runs ahead of every page request and:
 *   1. Reads the existing cookie if present and valid (UUID v4 shape).
 *   2. Otherwise mints a fresh `crypto.randomUUID()` value and writes it
 *      back on the response with `httpOnly`, `sameSite=lax`, and the
 *      one-year `BUILDER_ID_COOKIE_MAX_AGE_SEC` lifetime so the same
 *      browser keeps editing rights to its slugs across visits.
 *
 * The matcher excludes Next.js internal asset paths and any URL with a
 * file extension so static assets do not pay the cookie issuance cost on
 * every request.
 *
 * The cookie is NOT marked `secure` so the local dev server (HTTP) and
 * preview deploys both work; production traffic is HTTPS via the Vercel
 * edge so the cookie is still transported securely there in practice.
 * Mirrors VibeRacer's `src/middleware.ts` racer-id pattern.
 */
export function middleware(req: NextRequest) {
  const existing = req.cookies.get(BUILDER_ID_COOKIE)?.value
  if (existing && isValidBuilderId(existing)) {
    return NextResponse.next()
  }

  const builderId = newBuilderId()
  const res = NextResponse.next()
  res.cookies.set({
    name: BUILDER_ID_COOKIE,
    value: builderId,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: BUILDER_ID_COOKIE_MAX_AGE_SEC,
  })
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
