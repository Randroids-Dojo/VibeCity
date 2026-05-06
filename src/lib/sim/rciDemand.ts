import {
  COMMERCIAL_JOBS_BY_DENSITY,
  INDUSTRIAL_JOBS_BY_DENSITY,
  type PopulationBucket,
  type ZonesBucket,
} from './state'

/**
 * R/C/I demand readouts (REQ-082 slice 1).
 *
 * Mirrors the SimCity 2000 demand bars: the player wants three at-a-
 * glance signals for what to zone next. v1 ships raw signed-integer
 * deltas:
 *
 *   - residentialDemand = (commercial jobs + industrial jobs) - residents
 *     Positive when there are more jobs than residents (residents
 *     want to move in to fill them).
 *   - commercialDemand = residents - commercial jobs
 *     Positive when residents outnumber commercial jobs (residents
 *     want stores / offices to spend their money / time at).
 *   - industrialDemand = residents - industrial jobs
 *     Positive when residents outnumber industrial jobs (residents
 *     want factories / heavy industry to employ them).
 *
 * Job slot counts come from `COMMERCIAL_JOBS_BY_DENSITY` and
 * `INDUSTRIAL_JOBS_BY_DENSITY`. v1 has no employment-matching
 * reducer so a job slot is treated as filled regardless of total
 * residents; the demand metric uses raw counts to communicate the
 * city's broader supply / demand asymmetry.
 */

export interface RciDemand {
  residential: number
  commercial: number
  industrial: number
}

export function computeRciDemand(
  zones: ZonesBucket,
  population: PopulationBucket,
): RciDemand {
  let commercialJobs = 0
  let industrialJobs = 0
  for (const cell of Object.values(zones.cells)) {
    if (cell.kind === 'commercial') {
      commercialJobs += COMMERCIAL_JOBS_BY_DENSITY[cell.density]
    } else if (cell.kind === 'industrial') {
      industrialJobs += INDUSTRIAL_JOBS_BY_DENSITY[cell.density]
    }
  }
  const residents = population.totalPopulation
  return {
    residential: commercialJobs + industrialJobs - residents,
    commercial: residents - commercialJobs,
    industrial: residents - industrialJobs,
  }
}
