import { describe, it, expect } from 'vitest'
import {
  THUMBNAIL_DOT_RADIUS,
  THUMBNAIL_MARGIN,
  THUMBNAIL_SIZE_PX,
  cityThumbnailDots,
} from '@/lib/cityThumbnail'
import { EMPTY_CITY, type City } from '@/lib/schemas'

function makePiece(row: number, col: number): City['pieces'][number] {
  return { type: 'straight', row, col, rotation: 0 }
}

function makeBuilding(row: number, col: number): City['buildings'][number] {
  return { type: 'small-house', row, col, rotation: 0 }
}

function makeCity(
  pieces: City['pieces'],
  buildings: City['buildings'] = [],
): City {
  return { ...EMPTY_CITY, pieces, buildings }
}

describe('cityThumbnail constants (F-011)', () => {
  it('THUMBNAIL_SIZE_PX is a positive integer pixel size', () => {
    expect(Number.isInteger(THUMBNAIL_SIZE_PX)).toBe(true)
    expect(THUMBNAIL_SIZE_PX).toBeGreaterThan(0)
  })

  it('THUMBNAIL_MARGIN is in (0, 0.5) so dots stay inside the card', () => {
    expect(THUMBNAIL_MARGIN).toBeGreaterThan(0)
    expect(THUMBNAIL_MARGIN).toBeLessThan(0.5)
  })

  it('THUMBNAIL_DOT_RADIUS is positive and small enough to leave gaps', () => {
    expect(THUMBNAIL_DOT_RADIUS).toBeGreaterThan(0)
    expect(THUMBNAIL_DOT_RADIUS).toBeLessThan(0.2)
  })
})

describe('cityThumbnailDots (F-011)', () => {
  it('returns an empty array on the empty city', () => {
    expect(cityThumbnailDots(EMPTY_CITY)).toEqual([])
  })

  it('returns an empty array on a city with no pieces and no buildings', () => {
    const city = makeCity([], [])
    expect(cityThumbnailDots(city)).toEqual([])
  })

  it('centers a single piece at (0.5, 0.5)', () => {
    const city = makeCity([makePiece(2, 3)])
    const dots = cityThumbnailDots(city)
    expect(dots).toHaveLength(1)
    expect(dots[0].xNorm).toBe(0.5)
    expect(dots[0].yNorm).toBe(0.5)
    expect(dots[0].kind).toBe('piece')
  })

  it('centers a single building at (0.5, 0.5)', () => {
    const city = makeCity([], [makeBuilding(0, 0)])
    const dots = cityThumbnailDots(city)
    expect(dots).toHaveLength(1)
    expect(dots[0].xNorm).toBe(0.5)
    expect(dots[0].yNorm).toBe(0.5)
    expect(dots[0].kind).toBe('building')
  })

  it('maps the bbox corners to the margin-inset extremes', () => {
    const city = makeCity([makePiece(0, 0), makePiece(4, 4)])
    const dots = cityThumbnailDots(city)
    expect(dots).toHaveLength(2)
    const min = dots.find((d) => d.xNorm < 0.5)
    const max = dots.find((d) => d.xNorm > 0.5)
    expect(min?.xNorm).toBeCloseTo(THUMBNAIL_MARGIN)
    expect(min?.yNorm).toBeCloseTo(THUMBNAIL_MARGIN)
    expect(max?.xNorm).toBeCloseTo(1 - THUMBNAIL_MARGIN)
    expect(max?.yNorm).toBeCloseTo(1 - THUMBNAIL_MARGIN)
  })

  it('preserves insertion order with pieces before buildings', () => {
    const city = makeCity(
      [makePiece(0, 0), makePiece(1, 1)],
      [makeBuilding(2, 2)],
    )
    const dots = cityThumbnailDots(city)
    expect(dots).toHaveLength(3)
    expect(dots[0].kind).toBe('piece')
    expect(dots[1].kind).toBe('piece')
    expect(dots[2].kind).toBe('building')
  })

  it('every dot stays inside the [margin, 1 - margin] box', () => {
    const city = makeCity([
      makePiece(-3, 5),
      makePiece(7, -2),
      makePiece(4, 4),
    ])
    const dots = cityThumbnailDots(city)
    for (const dot of dots) {
      expect(dot.xNorm).toBeGreaterThanOrEqual(THUMBNAIL_MARGIN - 1e-9)
      expect(dot.xNorm).toBeLessThanOrEqual(1 - THUMBNAIL_MARGIN + 1e-9)
      expect(dot.yNorm).toBeGreaterThanOrEqual(THUMBNAIL_MARGIN - 1e-9)
      expect(dot.yNorm).toBeLessThanOrEqual(1 - THUMBNAIL_MARGIN + 1e-9)
    }
  })

  it('handles a single-row city by centering the y-axis', () => {
    const city = makeCity([makePiece(0, 0), makePiece(0, 4)])
    const dots = cityThumbnailDots(city)
    expect(dots[0].yNorm).toBe(0.5)
    expect(dots[1].yNorm).toBe(0.5)
  })

  it('handles a single-column city by centering the x-axis', () => {
    const city = makeCity([makePiece(0, 0), makePiece(4, 0)])
    const dots = cityThumbnailDots(city)
    expect(dots[0].xNorm).toBe(0.5)
    expect(dots[1].xNorm).toBe(0.5)
  })

  it('returns a fresh array on every call (no shared mutable state)', () => {
    const city = makeCity([makePiece(0, 0)])
    const a = cityThumbnailDots(city)
    const b = cityThumbnailDots(city)
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('does not mutate the input city', () => {
    const piece = makePiece(0, 0)
    const city = makeCity([piece])
    cityThumbnailDots(city)
    expect(city.pieces).toEqual([piece])
  })

  it('finite normalized values for every dot', () => {
    const city = makeCity([
      makePiece(0, 0),
      makePiece(1, 0),
      makePiece(0, 1),
    ])
    for (const dot of cityThumbnailDots(city)) {
      expect(Number.isFinite(dot.xNorm)).toBe(true)
      expect(Number.isFinite(dot.yNorm)).toBe(true)
    }
  })
})
