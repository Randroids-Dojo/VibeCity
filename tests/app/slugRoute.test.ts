import { describe, expect, it } from 'vitest'
import { parseSlugParam } from '@/app/[slug]/slugRoute'

describe('parseSlugParam (REQ-006)', () => {
  describe('accepts valid slugs', () => {
    it('accepts a simple lowercase word', () => {
      expect(parseSlugParam('downtown')).toBe('downtown')
    })

    it('accepts kebab-case slugs', () => {
      expect(parseSlugParam('my-fun-city')).toBe('my-fun-city')
    })

    it('accepts a slug starting with a digit', () => {
      expect(parseSlugParam('1st-ave')).toBe('1st-ave')
    })

    it('accepts a single-character slug', () => {
      expect(parseSlugParam('a')).toBe('a')
    })

    it('accepts a 128-character slug', () => {
      const slug = 'a'.repeat(128)
      expect(parseSlugParam(slug)).toBe(slug)
    })
  })

  describe('rejects invalid slugs', () => {
    it('rejects an empty string', () => {
      expect(parseSlugParam('')).toBeNull()
    })

    it('rejects a slug with uppercase letters', () => {
      expect(parseSlugParam('Downtown')).toBeNull()
    })

    it('rejects a slug starting with a dash', () => {
      expect(parseSlugParam('-leading-dash')).toBeNull()
    })

    it('rejects a slug containing spaces', () => {
      expect(parseSlugParam('my city')).toBeNull()
    })

    it('rejects a slug containing underscores', () => {
      expect(parseSlugParam('my_city')).toBeNull()
    })

    it('rejects a slug containing slashes', () => {
      expect(parseSlugParam('foo/bar')).toBeNull()
    })

    it('rejects a slug longer than 128 characters', () => {
      expect(parseSlugParam('a'.repeat(129))).toBeNull()
    })

    it('rejects URL-encoded characters', () => {
      expect(parseSlugParam('hello%20world')).toBeNull()
    })
  })
})
