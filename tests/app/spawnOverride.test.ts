import { describe, expect, it } from 'vitest'
import {
  parseSpawnOverride,
  readSpawnSearchParam,
  resolveSpawnOverride,
  spawnOverrideQuery,
} from '@/app/[slug]/drive/spawnOverride'
import type { Piece } from '@/lib/schemas'

function piece(row: number, col: number, type: Piece['type'] = 'straight'): Piece {
  return { row, col, type, rotation: 0 }
}

describe('parseSpawnOverride', () => {
  it('parses a positive comma-separated pair', () => {
    expect(parseSpawnOverride('3,5')).toEqual({ row: 3, col: 5 })
  })

  it('parses negative coordinates', () => {
    expect(parseSpawnOverride('-2,4')).toEqual({ row: -2, col: 4 })
    expect(parseSpawnOverride('-7,-3')).toEqual({ row: -7, col: -3 })
  })

  it('accepts the origin (0, 0)', () => {
    expect(parseSpawnOverride('0,0')).toEqual({ row: 0, col: 0 })
  })

  it('strips surrounding whitespace on the pair', () => {
    expect(parseSpawnOverride('  3,5  ')).toEqual({ row: 3, col: 5 })
    expect(parseSpawnOverride('3 , 5')).toEqual({ row: 3, col: 5 })
  })

  it('returns null for null / undefined / empty / non-string input', () => {
    expect(parseSpawnOverride(undefined)).toBeNull()
    expect(parseSpawnOverride(null)).toBeNull()
    expect(parseSpawnOverride('')).toBeNull()
    expect(parseSpawnOverride('   ')).toBeNull()
  })

  it('returns null when comma is missing or duplicated', () => {
    expect(parseSpawnOverride('35')).toBeNull()
    expect(parseSpawnOverride('3,5,7')).toBeNull()
    expect(parseSpawnOverride('3,')).toBeNull()
    expect(parseSpawnOverride(',5')).toBeNull()
  })

  it('rejects non-integer values', () => {
    expect(parseSpawnOverride('1.5,2')).toBeNull()
    expect(parseSpawnOverride('1,2.7')).toBeNull()
    expect(parseSpawnOverride('abc,3')).toBeNull()
    expect(parseSpawnOverride('3,xyz')).toBeNull()
  })

  it('rejects non-finite values', () => {
    expect(parseSpawnOverride('Infinity,0')).toBeNull()
    expect(parseSpawnOverride('NaN,0')).toBeNull()
  })
})

describe('resolveSpawnOverride', () => {
  it('returns the override when it lands on a placed piece', () => {
    const pieces = [piece(2, 3)]
    expect(resolveSpawnOverride({ row: 2, col: 3 }, pieces)).toEqual({
      row: 2,
      col: 3,
    })
  })

  it('returns null when the override is off-piece', () => {
    const pieces = [piece(0, 0)]
    expect(resolveSpawnOverride({ row: 5, col: 5 }, pieces)).toBeNull()
  })

  it('returns null on an empty city', () => {
    expect(resolveSpawnOverride({ row: 0, col: 0 }, [])).toBeNull()
  })

  it('accepts any footprint cell of a multi-cell piece', () => {
    // A hairpin piece occupies a 2x3 implicit footprint anchored at
    // (0, 0). Any of those 6 cells should accept the override.
    const pieces: Piece[] = [
      { row: 0, col: 0, type: 'hairpin', rotation: 0 },
    ]
    // The hairpin anchor cell is always on its own footprint.
    expect(resolveSpawnOverride({ row: 0, col: 0 }, pieces)).not.toBeNull()
  })
})

describe('spawnOverrideQuery', () => {
  it('composes a clean ?spawn=row,col query', () => {
    expect(spawnOverrideQuery({ row: 3, col: 5 })).toBe('?spawn=3,5')
  })

  it('handles negative coords', () => {
    expect(spawnOverrideQuery({ row: -2, col: 7 })).toBe('?spawn=-2,7')
  })

  it('returns empty string for null / undefined', () => {
    expect(spawnOverrideQuery(null)).toBe('')
    expect(spawnOverrideQuery(undefined)).toBe('')
  })

  it('returns empty string for non-integer coords', () => {
    expect(spawnOverrideQuery({ row: 1.5, col: 2 })).toBe('')
    expect(spawnOverrideQuery({ row: 1, col: Number.NaN })).toBe('')
  })

  it('round-trips through parseSpawnOverride', () => {
    const original = { row: -3, col: 12 }
    const query = spawnOverrideQuery(original)
    // Strip the leading "?spawn=" so we test the value part.
    const value = query.replace(/^\?spawn=/, '')
    expect(parseSpawnOverride(value)).toEqual(original)
  })
})

describe('readSpawnSearchParam', () => {
  it('returns null for undefined input', () => {
    expect(readSpawnSearchParam(undefined)).toBeNull()
  })

  it('parses a single string value', () => {
    expect(readSpawnSearchParam('3,5')).toEqual({ row: 3, col: 5 })
  })

  it('uses the first entry when given an array', () => {
    expect(readSpawnSearchParam(['3,5', '7,9'])).toEqual({ row: 3, col: 5 })
  })

  it('returns null for an invalid first entry', () => {
    expect(readSpawnSearchParam(['nope', '3,5'])).toBeNull()
  })
})
