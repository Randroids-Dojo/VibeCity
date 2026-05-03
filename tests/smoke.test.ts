import { describe, it, expect } from 'vitest'

describe('vitest smoke', () => {
  it('runs and reports a passing assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('node environment exposes process.version', () => {
    expect(typeof process.version).toBe('string')
    expect(process.version.length).toBeGreaterThan(0)
  })
})
