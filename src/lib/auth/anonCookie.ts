import { NextResponse, type NextRequest } from 'next/server'

/**
 * Anonymous-cookie middleware factory. Game-agnostic.
 *
 * The pattern: a Next.js middleware that reads a long-lived
 * anonymous-id cookie on every page request, mints a fresh value
 * with the supplied generator if the cookie is missing or fails the
 * supplied shape check, and writes the fresh value to BOTH the
 * request cookies (so a same-request server component can read it
 * via `cookies()`) and the response cookies (so the browser keeps
 * the value across visits).
 *
 * VibeCity's REQ-009 builder-id middleware is the v1 consumer
 * (see `src/middleware.ts`). Future games with the same anonymous-
 * id-in-cookie pattern can wire their own cookie name, lifetime,
 * shape check, and minter without rebuilding the propagation logic.
 *
 * The cookie is NOT marked `secure` so local dev (HTTP) and preview
 * deploys both work; production traffic is HTTPS via the Vercel
 * edge so the cookie is still transported securely there in
 * practice. Set `secure: true` in the options if a deployment ever
 * needs to enforce HTTPS at the cookie layer.
 */

export interface AnonCookieMiddlewareOptions {
  /** Cookie name. Use a project-namespaced value (e.g. `vibecity.builderId`). */
  cookieName: string
  /**
   * Cookie max age in seconds. Long-lived (e.g. 1 year) so the
   * browser keeps the id across visits without sign-up.
   */
  maxAgeSec: number
  /**
   * Shape check applied to the existing cookie value. Return `true`
   * when the value is acceptable. A spoofed or stale value that
   * happens to match the shape still has to pass downstream
   * ownership checks (e.g. the persistence layer comparing against
   * the recorded id for a resource).
   */
  isValid: (value: string) => boolean
  /**
   * Mints a fresh id when the cookie is missing or invalid. Usually
   * `mintUuidV4` from `./uuidV4`.
   */
  mintId: () => string
  /** Set `secure: true` to require HTTPS transport at the cookie layer. Defaults false. */
  secure?: boolean
  /** SameSite policy. Defaults to `'lax'`. */
  sameSite?: 'lax' | 'strict' | 'none'
}

/**
 * Build a Next.js middleware that issues / refreshes the anonymous
 * cookie on every page request. Returns a function suitable for
 * exporting as `middleware` in `src/middleware.ts`.
 */
export function createAnonCookieMiddleware(
  options: AnonCookieMiddlewareOptions,
): (req: NextRequest) => NextResponse {
  const {
    cookieName,
    maxAgeSec,
    isValid,
    mintId,
    secure = false,
    sameSite = 'lax',
  } = options

  return function anonCookieMiddleware(req: NextRequest): NextResponse {
    const existing = req.cookies.get(cookieName)?.value
    if (existing && isValid(existing)) {
      return NextResponse.next()
    }

    const fresh = mintId()
    // Propagate to BOTH request and response cookies so a server
    // component on the same request can read the freshly-minted id
    // via `cookies()` instead of waiting for the browser to round-
    // trip the response.
    req.cookies.set({ name: cookieName, value: fresh })
    const res = NextResponse.next({ request: { headers: req.headers } })
    res.cookies.set({
      name: cookieName,
      value: fresh,
      httpOnly: true,
      sameSite,
      secure,
      path: '/',
      maxAge: maxAgeSec,
    })
    return res
  }
}
