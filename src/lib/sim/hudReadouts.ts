import {
  COMMERCIAL_JOBS_BY_DENSITY,
  INDUSTRIAL_JOBS_BY_DENSITY,
  type PopulationBucket,
  type PowerBucket,
  type ZonesBucket,
} from './state'

/**
 * Total job slots across the city, split by zone kind. Sums the
 * per-density job counts (`COMMERCIAL_JOBS_BY_DENSITY` /
 * `INDUSTRIAL_JOBS_BY_DENSITY`) across every zoned cell. Residential
 * cells contribute nothing; only commercial and industrial host jobs.
 *
 * Used by the editor HUD readout. The numbers are also implicit in the
 * RCI demand computation, but the HUD surfaces them directly so the
 * player can see absolute capacity rather than relative deltas.
 */
export interface CityJobSlots {
  commercial: number
  industrial: number
  total: number
}

export function cityJobSlots(zones: ZonesBucket): CityJobSlots {
  let commercial = 0
  let industrial = 0
  for (const cell of Object.values(zones.cells)) {
    if (cell.kind === 'commercial') {
      commercial += COMMERCIAL_JOBS_BY_DENSITY[cell.density]
    } else if (cell.kind === 'industrial') {
      industrial += INDUSTRIAL_JOBS_BY_DENSITY[cell.density]
    }
  }
  return { commercial, industrial, total: commercial + industrial }
}

/**
 * Average coal pollution exposure across populated cells. Mirrors the
 * `computeCityHappiness` per-populated-cell average so the HUD readout
 * matches the input that drives the happiness penalty. Returns 0 when
 * no cells are populated (no one to suffer the pollution).
 */
export function cityAvgPollution(
  power: PowerBucket,
  population: PopulationBucket,
): number {
  const populatedKeys = Object.keys(population.cells).filter(
    (key) => population.cells[key].residents > 0,
  )
  if (populatedKeys.length === 0) return 0
  let total = 0
  for (const key of populatedKeys) {
    total += power.pollution[key] ?? 0
  }
  return total / populatedKeys.length
}
