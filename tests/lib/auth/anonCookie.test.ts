import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { createAnonCookieMiddleware } from '@/lib/auth/anonCookie'

/**
 * Generic anonymous-cookie middleware factory contract. The wired-up
 * VibeCity middleware (REQ-009) is exercised in
 * `tests/app/middleware.test.ts`; this file pins the factory's
 * shape-check / mint / propagation logic against a synthetic config.
 */

const TEST_COOKIE = 'test.anon'
const TEST_MAX_AGE = 60 * 60 * 24 * 30

function makeRequest(cookieHeader?: string): NextRequest {
  const headers = new Headers()
  if (cookieHeader) headers.set('cookie', cookieHeader)
  return new NextRequest('http://test/', { headers })
}

describe('createAnonCookieMiddleware mint + write', () => {
  it('mints a fresh value when no cookie is present', () => {
    const middleware = createAnonCookieMiddleware({
      cookieName: TEST_COOKIE,
      maxAgeSec: TEST_MAX_AGE,
      isValid: () => true,
      mintId: () => 'fresh-id',
    })
    const res = middleware(makeRequest())
    expect(res.cookies.get(TEST_COOKIE)?.value).toBe('fresh-id')
  })

  it('mints a fresh value when the existing cookie fails the shape check', () => {
    const middleware = createAnonCookieMiddleware({
      cookieName: TEST_COOKIE,
      maxAgeSec: TEST_MAX_AGE,
      isValid: (v) => v === 'good',
      mintId: () => 'replacement',
    })
    const res = middleware(makeRequest(`${TEST_COOKIE}=bad`))
    expect(res.cookies.get(TEST_COOKIE)?.value).toBe('replacement')
  })

  it('does NOT write a fresh cookie when the existing value is valid', () => {
    const middleware = createAnonCookieMiddleware({
      cookieName: TEST_COOKIE,
      maxAgeSec: TEST_MAX_AGE,
      isValid: (v) => v === 'good',
      mintId: () => 'should-not-be-used',
    })
    const res = middleware(makeRequest(`${TEST_COOKIE}=good`))
    expect(res.cookies.get(TEST_COOKIE)).toBeUndefined()
  })
})

describe('createAnonCookieMiddleware cookie attributes', () => {
  it('sets httpOnly + sameSite=lax + path=/ + supplied maxAge by default', () => {
    const middleware = createAnonCookieMiddleware({
      cookieName: TEST_COOKIE,
      maxAgeSec: TEST_MAX_AGE,
      isValid: () => false,
      mintId: () => 'x',
    })
    const set = middleware(makeRequest()).cookies.get(TEST_COOKIE)
    expect(set?.httpOnly).toBe(true)
    expect(set?.sameSite).toBe('lax')
    expect(set?.path).toBe('/')
    expect(set?.maxAge).toBe(TEST_MAX_AGE)
    expect(set?.secure).toBeFalsy()
  })

  it('honors the secure: true override', () => {
    const middleware = createAnonCookieMiddleware({
      cookieName: TEST_COOKIE,
      maxAgeSec: TEST_MAX_AGE,
      isValid: () => false,
      mintId: () => 'x',
      secure: true,
    })
    const set = middleware(makeRequest()).cookies.get(TEST_COOKIE)
    expect(set?.secure).toBe(true)
  })

  it('honors the sameSite: strict override', () => {
    const middleware = createAnonCookieMiddleware({
      cookieName: TEST_COOKIE,
      maxAgeSec: TEST_MAX_AGE,
      isValid: () => false,
      mintId: () => 'x',
      sameSite: 'strict',
    })
    const set = middleware(makeRequest()).cookies.get(TEST_COOKIE)
    expect(set?.sameSite).toBe('strict')
  })
})
