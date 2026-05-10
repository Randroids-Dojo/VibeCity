import * as THREE from 'three'

/**
 * Procedural track-surface geometry. Game-agnostic.
 *
 * Builds one continuous triangle-strip ribbon from a centerline sample
 * stream so the entire driveable surface renders as a single mesh,
 * regardless of how the underlying pieces are shaped (straight,
 * corner, scurve, sweep, mega sweep, hairpin, arc45, diagonal). Direct
 * port of VibeRacer's `trackSurfaceGeometry`
 * (`../VibeRacer/src/game/sceneBuilder.ts:344` `polylineGeometry`,
 * plus the `continuousTrackSamples` walker on line 414). Pure: no
 * three.js consumer state, no DOM. The consumer feeds a sample array
 * and a per-sample half-width resolver; the helper returns a
 * `BufferGeometry` ready to wrap in a `MeshStandardMaterial`.
 *
 * Heading convention (consumer must align): tangent is
 * `(cos h, -sin h)` and the right-hand perpendicular is `(sin h, cos h)`.
 * Matches `src/lib/trackPath.ts` `SampledPoint.heading` (`atan2(-dz, dx)`)
 * and the same convention VibeRacer uses.
 *
 * Triangle winding produces a +Y normal so the road renders visible
 * from above without two-sided material. Pairs of vertices are laid
 * out as `[right, left, right, left, ...]` along travel; the index
 * buffer ties two triangles per segment.
 */

/**
 * One sample along the centerline. World-space `x` / `z`, tangent
 * `heading` in radians. Mirrors `src/lib/trackPath.ts` `SampledPoint`
 * so callers can pass that array in directly.
 */
export interface TrackSurfaceSample {
  x: number
  z: number
  heading: number
}

/**
 * Resolver: half-width at a given sample. v1 returns a constant; a
 * future slice can vary width per piece type via the index argument.
 */
export type HalfWidthFor = (sampleIndex: number) => number

/**
 * Build a triangle-strip ribbon along the supplied centerline samples.
 *
 * Returns an empty `BufferGeometry` (no attributes, no index) when
 * given fewer than two samples; the consumer's `THREE.Mesh` is safe
 * to mount but contributes no triangles. This is the empty-city /
 * single-sample path; the geometry can be replaced or hidden by the
 * caller.
 */
export function trackSurfaceGeometry(
  samples: readonly TrackSurfaceSample[],
  halfWidthFor: HalfWidthFor,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry()
  if (samples.length < 2) {
    return geom
  }
  // Two vertices per sample: right (perp = +cos heading, +sin heading)
  // and left (perp = -). Heading convention: tangent (cos h, -sin h),
  // right-hand perpendicular (sin h, cos h). Y = 0 so the consumer can
  // lift the whole mesh via the `<mesh>` `position.y` instead of
  // baking an offset into the geometry.
  const verts = new Float32Array(samples.length * 6)
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const half = halfWidthFor(i)
    const px = Math.sin(s.heading)
    const pz = Math.cos(s.heading)
    const offset = i * 6
    verts[offset] = s.x + px * half
    verts[offset + 1] = 0
    verts[offset + 2] = s.z + pz * half
    verts[offset + 3] = s.x - px * half
    verts[offset + 4] = 0
    verts[offset + 5] = s.z - pz * half
  }
  // Triangle winding must yield a +Y normal so the road faces up. The
  // vert layout is [right, left] per sample; the winding below pairs
  // with that layout to produce upward-facing faces. Mirrors
  // VibeRacer's `polylineGeometry`.
  const segmentCount = samples.length - 1
  const idx = new Uint32Array(segmentCount * 6)
  for (let i = 0; i < segmentCount; i++) {
    const base = i * 2
    const ax = verts[base * 3]
    const az = verts[base * 3 + 2]
    const bx = verts[(base + 2) * 3]
    const bz = verts[(base + 2) * 3 + 2]
    const cx = verts[(base + 1) * 3]
    const cz = verts[(base + 1) * 3 + 2]
    const ux = bx - ax
    const uz = bz - az
    const vx = cx - ax
    const vz = cz - az
    const facesUp = uz * vx - ux * vz > 0
    const at = i * 6
    if (facesUp) {
      idx[at] = base
      idx[at + 1] = base + 2
      idx[at + 2] = base + 1
      idx[at + 3] = base + 1
      idx[at + 4] = base + 2
      idx[at + 5] = base + 3
    } else {
      idx[at] = base
      idx[at + 1] = base + 1
      idx[at + 2] = base + 2
      idx[at + 3] = base + 1
      idx[at + 4] = base + 3
      idx[at + 5] = base + 2
    }
  }
  geom.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geom.setIndex(new THREE.BufferAttribute(idx, 1))
  geom.computeVertexNormals()
  return geom
}

/**
 * Flatten the per-piece sample arrays in an `OrderedPiece[]` order
 * into one continuous sample stream, skipping the duplicate sample at
 * each piece-to-piece boundary so the ribbon is gap-free. Mirrors
 * VibeRacer's `continuousTrackSamples`. Returns an empty array if no
 * piece in the order has samples.
 *
 * The shape `{ samples: SampledPoint[] | null }` matches the v1
 * `OrderedPiece` from `src/lib/trackPath.ts`; pieces with `samples ===
 * null` (arc45 / diagonal pre-F-003 / F-004) are skipped so the
 * ribbon spans the supported piece types without a hole.
 */
export function continuousTrackSamples(
  ordered: readonly { samples: TrackSurfaceSample[] | null }[],
): TrackSurfaceSample[] {
  const out: TrackSurfaceSample[] = []
  for (const op of ordered) {
    if (op.samples === null) continue
    for (const sample of op.samples) {
      const prev = out[out.length - 1]
      if (
        prev &&
        Math.abs(prev.x - sample.x) < 1e-7 &&
        Math.abs(prev.z - sample.z) < 1e-7
      ) {
        continue
      }
      out.push(sample)
    }
  }
  return out
}
