import { describe, it, expect } from 'vitest'
import {
  BUILDER_ID_COOKIE,
  BUILDER_ID_COOKIE_MAX_AGE_SEC,
  isValidBuilderId,
  newBuilderId,
} from '@/lib/builderId'
import { BuilderIdSchema } from '@/lib/schemas'

describe('builderId', () => {
  describe('newBuilderId', () => {
    it('returns a UUID v4 that passes isValidBuilderId', () => {
      const id = newBuilderId()
      expect(isValidBuilderId(id)).toBe(true)
    })

    it('returns an id that passes BuilderIdSchema', () => {
      const id = newBuilderId()
      expect(BuilderIdSchema.safeParse(id).success).toBe(true)
    })

    it('returns a unique id on each call', () => {
      const a = newBuilderId()
      const b = newBuilderId()
      expect(a).not.toBe(b)
    })

    it('generates a 36-character canonical UUID string', () => {
      const id = newBuilderId()
      expect(id).toHaveLength(36)
    })
  })

  describe('isValidBuilderId', () => {
    it('accepts a canonical UUID v4', () => {
      expect(isValidBuilderId('12345678-1234-4234-8234-123456789012')).toBe(
        true,
      )
    })

    it('rejects an empty string', () => {
      expect(isValidBuilderId('')).toBe(false)
    })

    it('rejects a non-UUID string', () => {
      expect(isValidBuilderId('not-a-uuid')).toBe(false)
    })

    it('rejects a UUID v1 (wrong version digit)', () => {
      expect(isValidBuilderId('00000000-0000-1000-8000-000000000000')).toBe(
        false,
      )
    })

    it('rejects a UUID with invalid variant digit', () => {
      expect(isValidBuilderId('12345678-1234-4234-7234-123456789012')).toBe(
        false,
      )
    })

    it('rejects uppercase hex (canonical form is lowercase)', () => {
      expect(isValidBuilderId('12345678-1234-4234-8234-12345678901A')).toBe(
        false,
      )
    })

    it('rejects a string with extra characters', () => {
      expect(
        isValidBuilderId('12345678-1234-4234-8234-123456789012-extra'),
      ).toBe(false)
    })
  })

  describe('cookie constants', () => {
    it('uses the documented cookie name', () => {
      expect(BUILDER_ID_COOKIE).toBe('vibecity.builderId')
    })

    it('uses a separate cookie namespace from VibeRacer', () => {
      expect(BUILDER_ID_COOKIE.startsWith('vibecity.')).toBe(true)
      expect(BUILDER_ID_COOKIE.startsWith('viberacer.')).toBe(false)
    })

    it('max-age is one year in seconds', () => {
      expect(BUILDER_ID_COOKIE_MAX_AGE_SEC).toBe(60 * 60 * 24 * 365)
    })
  })

  describe('BuilderIdSchema', () => {
    it('accepts a UUID v4', () => {
      expect(
        BuilderIdSchema.safeParse('12345678-1234-4234-8234-123456789012')
          .success,
      ).toBe(true)
    })

    it('rejects a non-UUID string', () => {
      expect(BuilderIdSchema.safeParse('not-a-uuid').success).toBe(false)
    })

    it('rejects an empty string', () => {
      expect(BuilderIdSchema.safeParse('').success).toBe(false)
    })

    it('rejects a number', () => {
      expect(BuilderIdSchema.safeParse(42).success).toBe(false)
    })
  })
})
