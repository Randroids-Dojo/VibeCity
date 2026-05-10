import { describe, expect, it } from 'vitest'
import {
  continuousTrackSamples,
  trackSurfaceGeometry,
  type TrackSurfaceSample,
} from '@/lib/render/trackSurface'

/**
 * REQ-031 (drive scene surface) port: VibeRacer's procedural ribbon
 * (`../VibeRacer/src/game/sceneBuilder.ts:344`) translated into a
 * game-agnostic helper. Unit tests cover the geometry math + the
 * sample-stitching walker.
 */

describe('continuousTrackSamples', () => {
  it('returns an empty outer array when every piece carries null samples', () => {
    const out = continuousTrackSamples([
      { samples: null },
      { samples: null },
    ])
    expect(out).toEqual([])
  })

  it('returns one run when every piece has samples', () => {
    const out = continuousTrackSamples([
      {
        samples: [
          { x: 0, z: 0, heading: 0 },
          { x: 1, z: 0, heading: 0 },
        ],
      },
      {
        samples: [
          { x: 2, z: 0, heading: 0 },
          { x: 3, z: 0, heading: 0 },
        ],
      },
    ])
    expect(out).toEqual([
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
        { x: 2, z: 0, heading: 0 },
        { x: 3, z: 0, heading: 0 },
      ],
    ])
  })

  it('drops a duplicate sample at a piece-to-piece boundary', () => {
    const shared: TrackSurfaceSample = { x: 1, z: 0, heading: 0 }
    const out = continuousTrackSamples([
      {
        samples: [
          { x: 0, z: 0, heading: 0 },
          shared,
        ],
      },
      {
        // First sample of the next piece is at the same x/z as the
        // last sample of the previous piece (within 1e-7 epsilon).
        // The walker should drop it so the ribbon does not produce a
        // zero-length segment at the seam.
        samples: [
          { x: 1, z: 0, heading: 0 },
          { x: 2, z: 0, heading: 0 },
        ],
      },
    ])
    expect(out).toEqual([
      [
        { x: 0, z: 0, heading: 0 },
        shared,
        { x: 2, z: 0, heading: 0 },
      ],
    ])
  })

  it('splits the run at a null-sample piece so the ribbon does not bridge the gap', () => {
    const out = continuousTrackSamples([
      {
        samples: [
          { x: 0, z: 0, heading: 0 },
          { x: 1, z: 0, heading: 0 },
        ],
      },
      // arc45 / diagonal land here pre-F-003 / F-004. The strip closes
      // and the next piece starts a fresh run.
      { samples: null },
      {
        samples: [
          { x: 2, z: 0, heading: 0 },
          { x: 3, z: 0, heading: 0 },
        ],
      },
    ])
    expect(out).toEqual([
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
      ],
      [
        { x: 2, z: 0, heading: 0 },
        { x: 3, z: 0, heading: 0 },
      ],
    ])
  })

  it('drops a leading or trailing null without emitting an empty run', () => {
    const out = continuousTrackSamples([
      { samples: null },
      {
        samples: [
          { x: 0, z: 0, heading: 0 },
          { x: 1, z: 0, heading: 0 },
        ],
      },
      { samples: null },
    ])
    expect(out).toEqual([
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
      ],
    ])
  })
})

describe('trackSurfaceGeometry', () => {
  it('returns an empty geometry when given fewer than two samples', () => {
    const empty = trackSurfaceGeometry([], () => 1)
    expect(empty.getAttribute('position')).toBeUndefined()
    expect(empty.getIndex()).toBeNull()

    const one = trackSurfaceGeometry([{ x: 0, z: 0, heading: 0 }], () => 1)
    expect(one.getAttribute('position')).toBeUndefined()
    expect(one.getIndex()).toBeNull()
  })

  it('emits two vertices per sample at the left + right of the centerline', () => {
    // Two samples both at heading 0 (tangent +x, perpendicular +z).
    // Right edge sits at z = +half, left edge at z = -half.
    const half = 0.8
    const geom = trackSurfaceGeometry(
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
      ],
      () => half,
    )
    const pos = geom.getAttribute('position')
    expect(pos).toBeDefined()
    if (!pos) throw new Error('unreachable')
    expect(pos.count).toBe(4)
    // Sample 0: right at (0, 0, +half), left at (0, 0, -half).
    expect(pos.array[0]).toBeCloseTo(0, 6)
    expect(pos.array[2]).toBeCloseTo(half, 6)
    expect(pos.array[3]).toBeCloseTo(0, 6)
    expect(pos.array[5]).toBeCloseTo(-half, 6)
    // Sample 1: right at (1, 0, +half), left at (1, 0, -half).
    expect(pos.array[6]).toBeCloseTo(1, 6)
    expect(pos.array[8]).toBeCloseTo(half, 6)
    expect(pos.array[9]).toBeCloseTo(1, 6)
    expect(pos.array[11]).toBeCloseTo(-half, 6)
  })

  it('indexes two triangles per segment for an N-sample strip', () => {
    const geom = trackSurfaceGeometry(
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
        { x: 2, z: 0, heading: 0 },
        { x: 3, z: 0, heading: 0 },
      ],
      () => 1,
    )
    const idx = geom.getIndex()
    expect(idx).not.toBeNull()
    if (!idx) throw new Error('unreachable')
    // 3 segments x 2 triangles x 3 vertices = 18 index entries.
    expect(idx.count).toBe(18)
  })

  it('produces an upward-facing winding on every triangle (visible from above)', () => {
    const geom = trackSurfaceGeometry(
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
      ],
      () => 1,
    )
    const idx = geom.getIndex()
    const pos = geom.getAttribute('position')
    if (!idx || !pos) throw new Error('unreachable')
    // For each triangle (a, b, c), the cross product
    // (b - a) x (c - a) at y = 0 reduces to the 2D wedge (uz * vx -
    // ux * vz). A positive value means the triangle's normal points
    // up (+y); the helper sorts indices to land in that branch.
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.array[i]
      const b = idx.array[i + 1]
      const c = idx.array[i + 2]
      const ax = pos.array[a * 3]
      const az = pos.array[a * 3 + 2]
      const bx = pos.array[b * 3]
      const bz = pos.array[b * 3 + 2]
      const cx = pos.array[c * 3]
      const cz = pos.array[c * 3 + 2]
      const ux = bx - ax
      const uz = bz - az
      const vx = cx - ax
      const vz = cz - az
      const wedge = uz * vx - ux * vz
      expect(wedge).toBeGreaterThan(0)
    }
  })

  it('honors the per-sample half-width resolver', () => {
    const widths = [1, 2, 3]
    const geom = trackSurfaceGeometry(
      [
        { x: 0, z: 0, heading: 0 },
        { x: 1, z: 0, heading: 0 },
        { x: 2, z: 0, heading: 0 },
      ],
      (i) => widths[i],
    )
    const pos = geom.getAttribute('position')
    if (!pos) throw new Error('unreachable')
    // Sample i has right edge at z = +widths[i], left at z = -widths[i].
    expect(pos.array[2]).toBeCloseTo(widths[0], 6)
    expect(pos.array[5]).toBeCloseTo(-widths[0], 6)
    expect(pos.array[8]).toBeCloseTo(widths[1], 6)
    expect(pos.array[11]).toBeCloseTo(-widths[1], 6)
    expect(pos.array[14]).toBeCloseTo(widths[2], 6)
    expect(pos.array[17]).toBeCloseTo(-widths[2], 6)
  })
})
