import { describe, expect, it } from 'vitest'
import { isValidUuidV4, mintUuidV4 } from '@/lib/auth/uuidV4'

describe('isValidUuidV4', () => {
  it('accepts a canonical v4 UUID string', () => {
    expect(isValidUuidV4('a1b2c3d4-e5f6-4789-abcd-1234567890ab')).toBe(true)
  })

  it('accepts a freshly-minted UUID', () => {
    expect(isValidUuidV4(mintUuidV4())).toBe(true)
  })

  it('rejects a v3 / v5 UUID (version digit not 4)', () => {
    expect(isValidUuidV4('a1b2c3d4-e5f6-3789-abcd-1234567890ab')).toBe(false)
    expect(isValidUuidV4('a1b2c3d4-e5f6-5789-abcd-1234567890ab')).toBe(false)
  })

  it('rejects a UUID where the variant digit is not 8/9/a/b', () => {
    expect(isValidUuidV4('a1b2c3d4-e5f6-4789-cbcd-1234567890ab')).toBe(false)
    expect(isValidUuidV4('a1b2c3d4-e5f6-4789-fbcd-1234567890ab')).toBe(false)
  })

  it('rejects uppercase hex (canonical UUIDs are lowercase)', () => {
    expect(isValidUuidV4('A1B2C3D4-E5F6-4789-ABCD-1234567890AB')).toBe(false)
  })

  it('rejects non-hex characters in the body', () => {
    expect(isValidUuidV4('z1b2c3d4-e5f6-4789-abcd-1234567890ab')).toBe(false)
  })

  it('rejects malformed shapes (missing or extra segments)', () => {
    expect(isValidUuidV4('not-a-uuid')).toBe(false)
    expect(isValidUuidV4('')).toBe(false)
    expect(isValidUuidV4('a1b2c3d4-e5f6-4789-abcd1234567890ab')).toBe(false)
  })
})

describe('mintUuidV4', () => {
  it('produces a string that passes isValidUuidV4', () => {
    for (let i = 0; i < 10; i++) {
      expect(isValidUuidV4(mintUuidV4())).toBe(true)
    }
  })

  it('produces a fresh value on every call', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(mintUuidV4())
    expect(seen.size).toBe(100)
  })
})
