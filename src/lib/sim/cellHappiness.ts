import {
  COVERAGE_HAPPINESS_WEIGHT,
  EARTHQUAKE_HAPPINESS_PENALTY,
  POLLUTION_HAPPINESS_WEIGHT,
  TAX_HAPPINESS_WEIGHT,
  TAX_NEUTRAL_RATE,
  WASTE_HAPPINESS_WEIGHT,
  WASTE_MAX_PER_CELL,
  type DisastersBucket,
  type PowerBucket,
  type ServicesBucket,
  type TaxRates,
  type WaterBucket,
  type ZonesBucket,
} from './state'
import { cellCoverage, coverageCount } from './servicesSolver'

/**
 * Per-cell happiness resolver (F-016 slice 1).
 *
 * Localizes the city-wide `computeCityHappiness` formula to a single
 * `(row, col)` cell. Used by:
 *
 *   - F-015 heatmap (planned): renders a color gradient per cell so
 *     the player sees WHICH neighborhoods are underserved.
 *   - F-016 resident abandonment (planned slice 2): decline triggers
 *     per-cell when local happiness sits below a threshold for N
 *     ticks; the city-wide happiness gate stays as the global growth
 *     governor.
 *
 * Slice 1 ships ONLY the pure resolver: no reducer change, no schema
 * change, no behavioral effect. The function reads the same five
 * inputs `computeCityHappiness` uses (waste, services coverage, tax,
 * coal pollution, active earthquakes) and applies the matching
 * weights so a cell sitting at the city's mean inputs reads the same
 * score the city-wide average reports. Abandoned-cell penalty stays
 * city-wide (it is a count of cells, not a per-cell signal) and is
 * not included here.
 *
 * Returns a 0..100 score clamped at both ends and rounded to one
 * decimal place to match the city-wide rounding.
 */
export function cellHappiness(
  row: number,
  col: number,
  water: WaterBucket,
  power: PowerBucket,
  services: ServicesBucket,
  zones: ZonesBucket,
  taxRates: TaxRates,
  disasters: DisastersBucket,
): number {
  if (
    !Number.isFinite(row) ||
    !Number.isFinite(col) ||
    !Number.isInteger(row) ||
    !Number.isInteger(col)
  ) {
    return 0
  }
  const key = `${row},${col}`
  const waste = water.wasteAccumulation[key] ?? 0
  const wastePenalty = (waste / WASTE_MAX_PER_CELL) * WASTE_HAPPINESS_WEIGHT
  let coveragePenalty = 0
  if (zones.cells[key] !== undefined) {
    const coverage = coverageCount(cellCoverage(row, col, services))
    coveragePenalty = (5 - coverage) * COVERAGE_HAPPINESS_WEIGHT
  } else {
    // Unzoned cells contribute zero coverage penalty (mirrors the
    // city-wide formula's membership gate). A cell that has not been
    // zoned has no residents to suffer the coverage gap.
    coveragePenalty = 0
  }
  const taxPenalty =
    Math.max(0, taxRates.residential - TAX_NEUTRAL_RATE) * TAX_HAPPINESS_WEIGHT
  const pollutionPenalty =
    (power.pollution[key] ?? 0) * POLLUTION_HAPPINESS_WEIGHT
  let earthquakePenalty = 0
  for (const disaster of disasters.active) {
    if (disaster.kind === 'earthquake') {
      earthquakePenalty += EARTHQUAKE_HAPPINESS_PENALTY
    }
  }
  const score =
    100 -
    wastePenalty -
    coveragePenalty -
    taxPenalty -
    pollutionPenalty -
    earthquakePenalty
  const clamped = Math.max(0, Math.min(100, score))
  return Math.round(clamped * 10) / 10
}

/**
 * Color map for the per-cell happiness heatmap (F-015). Maps a
 * 0..100 score to a hex color string: warm red at the floor, yellow
 * at the middle, fresh green at the ceiling. Scores outside the
 * range clamp; non-finite inputs collapse to the mid-yellow color
 * so a tuning bug cannot crash the editor render.
 *
 * Two linear segments meeting at score=50:
 *   - [0, 50]: red `#c74a3a` to yellow `#d9c84a`
 *   - [50, 100]: yellow `#d9c84a` to green `#3a8a3a`
 *
 * The midpoint color is desaturated slightly so a cell sitting at
 * the growth-stall threshold reads as cautionary-yellow rather than
 * a vivid alarm color.
 */
const HEATMAP_LOW: [number, number, number] = [0xc7, 0x4a, 0x3a]
const HEATMAP_MID: [number, number, number] = [0xd9, 0xc8, 0x4a]
const HEATMAP_HIGH: [number, number, number] = [0x3a, 0x8a, 0x3a]

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function rgbToHex(rgb: [number, number, number]): string {
  const hex = rgb
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex}`
}

export function happinessHeatmapColor(score: number): string {
  if (!Number.isFinite(score)) return rgbToHex(HEATMAP_MID)
  const clamped = Math.max(0, Math.min(100, score))
  if (clamped <= 50) {
    const t = clamped / 50
    return rgbToHex(lerpRgb(HEATMAP_LOW, HEATMAP_MID, t))
  }
  const t = (clamped - 50) / 50
  return rgbToHex(lerpRgb(HEATMAP_MID, HEATMAP_HIGH, t))
}

/**
 * Default opacity for the heatmap fill. Low enough that the
 * underlying cell color (origin marker, building, piece glyph) and
 * the zone overlay above stay readable; high enough to be visible
 * against the cream snap-grid background.
 */
export const HAPPINESS_HEATMAP_FILL_OPACITY = 0.32
