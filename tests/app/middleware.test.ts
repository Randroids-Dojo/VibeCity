import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import {
  BUILDER_ID_COOKIE,
  BUILDER_ID_COOKIE_MAX_AGE_SEC,
  isValidBuilderId,
} from '@/lib/builderId'

/**
 * REQ-009 + REQ-025: middleware issues the anonymous builder id cookie
 * on first visit so the autosave PUT path has a stable identity for
 * activity attribution. The cookie is identity-only; VibeCity is
 * open-edit so the PUT path does not gate writes per cookie (REQ-014).
 */

const validId = '11111111-1111-4111-8111-111111111111'

function makeRequest(cookieHeader?: string): NextRequest {
  const headers = new Headers()
  if (cookieHeader) headers.set('cookie', cookieHeader)
  return new NextRequest('http://test/playtest-city/edit', { headers })
}

describe('middleware (REQ-009 issuer for REQ-025)', () => {
  it('mints a fresh builder id when no cookie is present', () => {
    const res = middleware(makeRequest())
    const set = res.cookies.get(BUILDER_ID_COOKIE)
    expect(set).toBeDefined()
    expect(set?.value).toBeTruthy()
    expect(isValidBuilderId(set?.value ?? '')).toBe(true)
  })

  it('sets the cookie with httpOnly + sameSite=lax + path=/ + 1y maxAge', () => {
    const res = middleware(makeRequest())
    const set = res.cookies.get(BUILDER_ID_COOKIE)
    expect(set?.httpOnly).toBe(true)
    expect(set?.sameSite).toBe('lax')
    expect(set?.path).toBe('/')
    expect(set?.maxAge).toBe(BUILDER_ID_COOKIE_MAX_AGE_SEC)
  })

  it('does not overwrite an existing valid cookie', () => {
    const res = middleware(makeRequest(`${BUILDER_ID_COOKIE}=${validId}`))
    // When the cookie is already valid, NextResponse.next() returns
    // without writing a new Set-Cookie. The response cookies API will
    // not have a fresh entry.
    const set = res.cookies.get(BUILDER_ID_COOKIE)
    expect(set).toBeUndefined()
  })

  it('overwrites a malformed cookie with a fresh id', () => {
    const res = middleware(makeRequest(`${BUILDER_ID_COOKIE}=not-a-uuid`))
    const set = res.cookies.get(BUILDER_ID_COOKIE)
    expect(set).toBeDefined()
    expect(isValidBuilderId(set?.value ?? '')).toBe(true)
    // The old cookie is replaced, not appended.
    expect(set?.value).not.toBe('not-a-uuid')
  })

  it('overwrites a cookie that fails the UUID v4 shape (e.g. v1 UUID)', () => {
    const v1 = '11111111-1111-1111-8111-111111111111'
    const res = middleware(makeRequest(`${BUILDER_ID_COOKIE}=${v1}`))
    const set = res.cookies.get(BUILDER_ID_COOKIE)
    expect(set).toBeDefined()
    expect(isValidBuilderId(set?.value ?? '')).toBe(true)
    expect(set?.value).not.toBe(v1)
  })
})
