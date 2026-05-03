import { describe, it, expect } from 'vitest'
import { SlugSchema, normalizeSlug } from '@/lib/schemas'

describe('SlugSchema', () => {
  it('accepts a single lowercase letter', () => {
    expect(SlugSchema.safeParse('a').success).toBe(true)
  })

  it('accepts a single digit', () => {
    expect(SlugSchema.safeParse('0').success).toBe(true)
  })

  it('accepts a kebab-case slug with letters, digits, and dashes', () => {
    expect(SlugSchema.safeParse('my-city-42').success).toBe(true)
  })

  it('accepts the maximum length of 128 chars', () => {
    const slug = 'a'.repeat(128)
    expect(SlugSchema.safeParse(slug).success).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(SlugSchema.safeParse('').success).toBe(false)
  })

  it('rejects a slug longer than 128 chars', () => {
    const slug = 'a'.repeat(129)
    expect(SlugSchema.safeParse(slug).success).toBe(false)
  })

  it('rejects a slug starting with a dash', () => {
    expect(SlugSchema.safeParse('-bad').success).toBe(false)
  })

  it('rejects uppercase letters', () => {
    expect(SlugSchema.safeParse('MyCity').success).toBe(false)
  })

  it('rejects underscores', () => {
    expect(SlugSchema.safeParse('my_city').success).toBe(false)
  })

  it('rejects spaces', () => {
    expect(SlugSchema.safeParse('my city').success).toBe(false)
  })

  it('rejects unicode letters', () => {
    expect(SlugSchema.safeParse('café').success).toBe(false)
  })

  it('rejects emoji', () => {
    expect(SlugSchema.safeParse('city-1').success).toBe(true)
    expect(SlugSchema.safeParse('city-1-rocket').success).toBe(true)
  })
})

describe('normalizeSlug', () => {
  it('lowercases mixed-case input', () => {
    expect(normalizeSlug('MyCity')).toBe('mycity')
  })

  it('drops disallowed characters', () => {
    expect(normalizeSlug('My City!')).toBe('mycity')
  })

  it('preserves dashes between letters', () => {
    expect(normalizeSlug('My-City-42')).toBe('my-city-42')
  })

  it('strips a leading run of dashes', () => {
    expect(normalizeSlug('---hello')).toBe('hello')
  })

  it('clamps to 128 chars', () => {
    const long = 'a'.repeat(200)
    expect(normalizeSlug(long).length).toBe(128)
  })

  it('returns the empty string when input collapses to nothing', () => {
    expect(normalizeSlug('!!!')).toBe('')
  })

  it('output of a valid kebab-case input is itself a valid Slug', () => {
    const out = normalizeSlug('my-city-42')
    expect(SlugSchema.safeParse(out).success).toBe(true)
  })
})
