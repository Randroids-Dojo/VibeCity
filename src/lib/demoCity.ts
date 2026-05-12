import type { City, Slug } from './schemas'

/**
 * Prebuilt showcase city served at /demo (no KV required). Hand-authored
 * so a fresh visitor can experience the full visual + simulation surface
 * the engine ships today without first laying down their own street grid.
 *
 * Scope intent: "kitchen sink, but coherent." The track is a single
 * closed rectangular loop using cardinal pieces (straight + left90 +
 * right90) with two scurve drop-ins for smooth-piece visual variety,
 * sized to give the buildings + zones inside room to breathe. The
 * building roster covers every type. The sim state pre-populates zones,
 * service buildings, power plants, and water infrastructure across the
 * five sim subsystems so the editor's overlay layers (zone density,
 * service coverage, power status, water status, waste accumulation)
 * all have something to render on first paint.
 *
 * The city loads through `loadCity.ts` when slug equals `DEMO_SLUG`;
 * the KV bypass means dev / preview environments without a configured
 * Upstash binding still surface a working demo. Saving from the editor
 * over the demo slug writes to KV as usual (open-edit per Q-008), so
 * the demo is a fork-on-edit starting point rather than a sacred
 * read-only payload.
 */

export const DEMO_SLUG: Slug = 'demo' as Slug

/**
 * The prebuilt showcase city. Pieces + buildings + mood are part of the
 * canonical City schema (see `schemas.ts`). The sim state goes into
 * `city.sim` as a schema-validated `SimState` so the editor / drive
 * surfaces see populated zones, services, power, and water on first
 * paint instead of a fully-empty starter state.
 *
 * Coordinates: the track loop spans rows 2 to 8 and cols 2 to 8 (a 7x7
 * outer ring around a 5x5 interior at rows 3 to 7, cols 3 to 7). The
 * sim entities sit on cells inside the loop plus a few outside (power
 * plants north, water + sewage west) so the editor renders both the
 * inhabited interior and the supporting infrastructure on the outskirts.
 */
export const DEMO_CITY: City = {
  pieces: [
    // Corners of the 7x7 outer ring (clockwise from NW).
    { type: 'right90', row: 2, col: 2, rotation: 0 },
    { type: 'left90', row: 2, col: 8, rotation: 0 },
    { type: 'right90', row: 8, col: 8, rotation: 180 },
    { type: 'left90', row: 8, col: 2, rotation: 180 },
    // Top edge straights (row 2, cols 3..7). Rotation 90 makes the
    // straight horizontal (E-W ports).
    { type: 'straight', row: 2, col: 3, rotation: 90 },
    { type: 'straight', row: 2, col: 4, rotation: 90 },
    { type: 'straight', row: 2, col: 5, rotation: 90 },
    { type: 'straight', row: 2, col: 6, rotation: 90 },
    { type: 'straight', row: 2, col: 7, rotation: 90 },
    // Right edge (col 8, rows 3..7). Rotation 0 is vertical (S-N ports).
    // The mid-segment is a scurveLeft drop-in for smooth-piece variety
    // (same S+N connector pattern as straight so the loop stays valid).
    { type: 'straight', row: 3, col: 8, rotation: 0 },
    { type: 'straight', row: 4, col: 8, rotation: 0 },
    { type: 'scurveLeft', row: 5, col: 8, rotation: 0 },
    { type: 'straight', row: 6, col: 8, rotation: 0 },
    { type: 'straight', row: 7, col: 8, rotation: 0 },
    // Bottom edge (row 8, cols 3..7). Horizontal.
    { type: 'straight', row: 8, col: 3, rotation: 90 },
    { type: 'straight', row: 8, col: 4, rotation: 90 },
    { type: 'straight', row: 8, col: 5, rotation: 90 },
    { type: 'straight', row: 8, col: 6, rotation: 90 },
    { type: 'straight', row: 8, col: 7, rotation: 90 },
    // Left edge (col 2, rows 3..7). Mid-segment scurve for smooth variety.
    { type: 'straight', row: 3, col: 2, rotation: 0 },
    { type: 'straight', row: 4, col: 2, rotation: 0 },
    { type: 'scurve', row: 5, col: 2, rotation: 0 },
    { type: 'straight', row: 6, col: 2, rotation: 0 },
    { type: 'straight', row: 7, col: 2, rotation: 0 },
  ],
  buildings: [
    // Interior buildings across the four placeholder types. Eight cells
    // on a 3x3 lattice inside the loop with the south-east corner cell
    // (7,7) reserved for the industrial zone overlay so building and
    // zone cells stay disjoint.
    { type: 'small-house', row: 3, col: 3, rotation: 0 },
    { type: 'shop', row: 3, col: 5, rotation: 0 },
    { type: 'small-house', row: 3, col: 7, rotation: 0 },
    { type: 'mid-house', row: 5, col: 3, rotation: 0 },
    { type: 'factory', row: 5, col: 5, rotation: 0 },
    { type: 'mid-house', row: 5, col: 7, rotation: 0 },
    { type: 'small-house', row: 7, col: 3, rotation: 0 },
    { type: 'shop', row: 7, col: 5, rotation: 0 },
  ],
  mood: {
    // 'auto' phase-cycles between day and night every
    // DAY_NIGHT_CYCLE_TICKS so a visitor sees both palettes plus the
    // lit-window / streetlamp render layer without flipping a toggle.
    timeOfDay: 'auto',
  },
  // Hand-authored sim state: zones, service buildings, power plants,
  // and water infrastructure live in `city.sim` per the REQ-072..074
  // substrate. The strict `SimStateSchema` validates these shapes; the
  // `City` schema's `sim: z.unknown().optional()` field accepts the
  // payload without forcing the core schema to import the sim layer.
  // Population counts mirror the residential zone densities through
  // `RESIDENTIAL_CAPACITY_BY_DENSITY` so the city milestone toast fires
  // on first sim tick (totalPopulation past the first 4-resident
  // threshold).
  sim: {
    tick: 0,
    simTimeMs: 0,
    speed: 1,
    taxRates: {
      residential: 0.07,
      commercial: 0.07,
      industrial: 0.05,
    },
    population: {
      cells: {
        // Interior residential cells (urban core). Density 2 holds 12
        // residents per cell, density 1 holds 4 (per
        // RESIDENTIAL_CAPACITY_BY_DENSITY).
        '4,4': { residents: 12, tripDemand: 0 },
        '4,6': { residents: 12, tripDemand: 0 },
        '6,4': { residents: 12, tripDemand: 0 },
        '6,6': { residents: 12, tripDemand: 0 },
        '3,4': { residents: 4, tripDemand: 0 },
        '3,6': { residents: 4, tripDemand: 0 },
        '7,4': { residents: 4, tripDemand: 0 },
        '7,6': { residents: 4, tripDemand: 0 },
        // North suburb residential. All five density-1 = 4 residents
        // each. Adjacent to row-0 power lines + coal plant so the
        // power overlay paints 'powered'.
        '1,3': { residents: 4, tripDemand: 0 },
        '1,4': { residents: 4, tripDemand: 0 },
        '1,5': { residents: 4, tripDemand: 0 },
        '1,6': { residents: 4, tripDemand: 0 },
        '1,7': { residents: 4, tripDemand: 0 },
      },
      // Interior: 4 * 12 + 4 * 4 = 64. North suburb: 5 * 4 = 20.
      totalPopulation: 12 * 4 + 4 * 4 + 4 * 5,
      totalTripDemand: 0,
      cityHappiness: 92,
      // Past the 40-resident milestone so the dopamine toast pings
      // immediately rather than waiting on a growth tick.
      highestMilestoneReached: 40,
      lastMilestoneTick: 0,
    },
    zones: {
      cells: {
        // Interior residential cluster, density 2 at the corners of
        // the 3x3 interior pattern (12 residents each).
        '4,4': { kind: 'residential', density: 2 },
        '4,6': { kind: 'residential', density: 2 },
        '6,4': { kind: 'residential', density: 2 },
        '6,6': { kind: 'residential', density: 2 },
        '3,4': { kind: 'residential', density: 1 },
        '3,6': { kind: 'residential', density: 1 },
        '7,4': { kind: 'residential', density: 1 },
        '7,6': { kind: 'residential', density: 1 },
        // Interior commercial along the middle row.
        '5,4': { kind: 'commercial', density: 1 },
        '5,6': { kind: 'commercial', density: 1 },
        // Interior industrial on the south-east corner.
        '6,7': { kind: 'industrial', density: 1 },
        '7,7': { kind: 'industrial', density: 1 },
        // North suburb residential strip (row 1, cols 3..7). Adjacent
        // to row-0 power lines + coal plant so the power overlay
        // paints 'powered' on first load.
        '1,3': { kind: 'residential', density: 1 },
        '1,4': { kind: 'residential', density: 1 },
        '1,5': { kind: 'residential', density: 1 },
        '1,6': { kind: 'residential', density: 1 },
        '1,7': { kind: 'residential', density: 1 },
        // South industrial belt (row 9, cols 3..7). Adjacent to
        // row-10 power lines + solar plant.
        '9,3': { kind: 'industrial', density: 1 },
        '9,4': { kind: 'industrial', density: 1 },
        '9,5': { kind: 'industrial', density: 1 },
        '9,6': { kind: 'industrial', density: 1 },
        '9,7': { kind: 'industrial', density: 1 },
      },
    },
    power: {
      // Coal plant north of the loop (row 0) feeds the north suburb;
      // solar plant south of the loop (row 10) feeds the south
      // industrial belt. v1 records plant anchors as single cells
      // (the 2x2 footprint resolution lands with REQ-085 slice 3).
      plants: [
        { kind: 'coal', row: 0, col: 5 },
        { kind: 'solar', row: 10, col: 5 },
      ],
      // Transmission lines extend each plant along its row so every
      // outskirts zone cell on the matching row is 4-adjacent to at
      // least one line or plant cell, which makes the power solver
      // mark them 'powered'. Interior zones inside the loop stay
      // 'unpowered' because the ring blocks line routing without
      // overlapping piece cells; that follow-on lands when the
      // editor's line-placement validator ships.
      lines: {
        '0,3': true,
        '0,4': true,
        '0,6': true,
        '0,7': true,
        '10,3': true,
        '10,4': true,
        '10,6': true,
        '10,7': true,
      },
    },
    water: {
      // Water-tower pair anchors the north suburb (row 0 cols 3 and 7,
      // 4-adjacent to row-1 zones), pump-station pair anchors the
      // south belt (row 10 cols 3 and 7, 4-adjacent to row-9 zones).
      // Two water pipes per row fill the cell gap so the middle zone
      // on each strip is also adjacent to transmission and the entire
      // row reads 'served'. Sources and pipes share row cells with the
      // power lines / plants from round 2 because the data layer treats
      // each utility as its own transmission graph; visually the editor
      // renders one overlay per layer so the co-located cells read as
      // a utilities corridor instead of conflicting placements.
      sources: [
        { kind: 'water-tower', row: 0, col: 3 },
        { kind: 'water-tower', row: 0, col: 7 },
        { kind: 'pump-station', row: 10, col: 3 },
        { kind: 'pump-station', row: 10, col: 7 },
      ],
      pipes: {
        // Water pipes fill the row-0 / row-10 gaps between source
        // cells so the middle outskirts column is also adjacent to a
        // transmission cell.
        '0,4': 'water',
        '0,5': 'water',
        '0,6': 'water',
        '10,4': 'water',
        '10,5': 'water',
        '10,6': 'water',
        // Sewage pipes co-locate with the outskirts zone cells
        // themselves. `pipes` is keyed per cell with a single kind, so
        // sewage cannot share cell keys with the row-0 / row-10 water
        // pipes; the row-1 / row-9 strip is the only set of cells
        // 4-adjacent to multiple outskirts zones without re-using the
        // water layer. The data layer treats zones and sewage pipes
        // as distinct layers on the same cell key, so the editor's
        // overlay renderer paints both without a conflict.
        '1,3': 'sewage',
        '1,4': 'sewage',
        '1,5': 'sewage',
        '1,6': 'sewage',
        '1,7': 'sewage',
        '9,3': 'sewage',
        '9,4': 'sewage',
        '9,5': 'sewage',
        '9,6': 'sewage',
        '9,7': 'sewage',
      },
      // Treatment plants anchor each sewage strip so the sewage solver
      // marks adjacent zones 'drained' (a strip with pipes but no
      // treatment plant reads 'unmanaged'). One plant per strip is
      // enough; the solver only needs reachability.
      treatmentPlants: [
        { row: 1, col: 2 },
        { row: 9, col: 2 },
      ],
      wasteAccumulation: {},
    },
    economy: {
      // Treasury seeded with the v1 starting cash so the player can
      // see the figure without first playing through a tick. The four
      // tick-history fields stay at zero; the next sim tick will
      // populate them with real income / maintenance numbers.
      treasury: 10000,
      lastTickIncome: 0,
      lastTickMaintenance: 0,
      bankruptcyTickCounter: 0,
      lastAutoBailoutTick: 0,
    },
    services: {
      // One of each service kind. Anchored on the five free interior
      // cells along rows 4 and 6 so service buildings never share a
      // cell with a placeholder building or a zone (verified by the
      // demoCity overlap audit in the test suite).
      buildings: [
        { kind: 'hospital', row: 4, col: 3 },
        { kind: 'police-station', row: 4, col: 5 },
        { kind: 'school', row: 4, col: 7 },
        { kind: 'fire-station', row: 6, col: 3 },
        { kind: 'garbage-depot', row: 6, col: 5 },
      ],
    },
    disasters: {
      active: [],
    },
  },
}
