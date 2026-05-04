import { describe, expect, it } from 'vitest'
import {
  VERSION_HASH_RE,
  parseCityVersionHash,
  readVersionParam,
} from '@/lib/cityVersion'

/**
 * REQ-048 / REQ-049: editor and drive view pin to a historical version
 * via `?v=<hash>`. The accept / reject contract for the hash shape lives
 * in `cityVersion.ts` so the API route handler, the drive page, and the
 * editor page all route through the same helper.
 */

const VALID_HASH =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const ALL_F =
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
const ALL_ZERO =
  '0000000000000000000000000000000000000000000000000000000000000000'

describe('VERSION_HASH_RE', () => {
  it('matches a 64-char lowercase hex digest', () => {
    expect(VERSION_HASH_RE.test(VALID_HASH)).toBe(true)
  })

  it('matches all-zero and all-f boundary digests', () => {
    expect(VERSION_HASH_RE.test(ALL_ZERO)).toBe(true)
    expect(VERSION_HASH_RE.test(ALL_F)).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(VERSION_HASH_RE.test('')).toBe(false)
  })

  it('rejects fewer than 64 hex chars', () => {
    expect(VERSION_HASH_RE.test('abc123')).toBe(false)
    expect(VERSION_HASH_RE.test(VALID_HASH.slice(0, 63))).toBe(false)
  })

  it('rejects more than 64 hex chars', () => {
    expect(VERSION_HASH_RE.test(VALID_HASH + '0')).toBe(false)
  })

  it('rejects mixed-case hex (uppercase)', () => {
    expect(
      VERSION_HASH_RE.test(
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      ),
    ).toBe(false)
  })

  it('rejects non-hex characters', () => {
    const withG = 'g' + VALID_HASH.slice(1)
    expect(VERSION_HASH_RE.test(withG)).toBe(false)
  })

  it('rejects whitespace padding', () => {
    expect(VERSION_HASH_RE.test(` ${VALID_HASH}`)).toBe(false)
    expect(VERSION_HASH_RE.test(`${VALID_HASH} `)).toBe(false)
    expect(VERSION_HASH_RE.test(`${VALID_HASH}\n`)).toBe(false)
  })
})

describe('parseCityVersionHash', () => {
  it('returns the branded hash for a valid input', () => {
    const result = parseCityVersionHash(VALID_HASH)
    expect(result).toBe(VALID_HASH)
  })

  it('returns null for an empty string', () => {
    expect(parseCityVersionHash('')).toBeNull()
  })

  it('returns null for a too-short hash', () => {
    expect(parseCityVersionHash('abc123')).toBeNull()
  })

  it('returns null for a too-long hash', () => {
    expect(parseCityVersionHash(VALID_HASH + 'a')).toBeNull()
  })

  it('returns null for uppercase hex', () => {
    expect(
      parseCityVersionHash(
        '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
      ),
    ).toBeNull()
  })

  it('returns null for non-hex characters', () => {
    expect(parseCityVersionHash('z'.repeat(64))).toBeNull()
  })

  it('returns null when the input contains a slash (path-traversal guard)', () => {
    const malicious = '../' + 'a'.repeat(61)
    expect(parseCityVersionHash(malicious)).toBeNull()
  })

  it('returns null when the input contains a query separator', () => {
    expect(parseCityVersionHash('?'.repeat(64))).toBeNull()
  })
})

describe('readVersionParam', () => {
  it('returns the branded hash when a valid string is supplied', () => {
    expect(readVersionParam(VALID_HASH)).toBe(VALID_HASH)
  })

  it('returns null when undefined is supplied (no ?v= present)', () => {
    expect(readVersionParam(undefined)).toBeNull()
  })

  it('returns null for an array (?v=a&v=b)', () => {
    expect(readVersionParam([VALID_HASH, VALID_HASH])).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(readVersionParam('')).toBeNull()
  })

  it('returns null for a malformed string', () => {
    expect(readVersionParam('not-a-hash')).toBeNull()
  })
})
