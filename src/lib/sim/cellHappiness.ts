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
  if (!Number.isFinite(row) || !Number.isFinite(col)) return 0
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
