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
        // Residential cells at density 2 hold 12 residents each (per
        // RESIDENTIAL_CAPACITY_BY_DENSITY). Commercial / industrial
        // cells get 0 residents (jobs live on the same cells in their
        // own sim slice; v1 surfaces residents through the milestone
        // toast and the editor population readout).
        '4,4': { residents: 12, tripDemand: 0 },
        '4,6': { residents: 12, tripDemand: 0 },
        '6,4': { residents: 12, tripDemand: 0 },
        '6,6': { residents: 12, tripDemand: 0 },
        '3,4': { residents: 4, tripDemand: 0 },
        '3,6': { residents: 4, tripDemand: 0 },
        '7,4': { residents: 4, tripDemand: 0 },
        '7,6': { residents: 4, tripDemand: 0 },
      },
      totalPopulation: 12 * 4 + 4 * 4,
      totalTripDemand: 0,
      cityHappiness: 92,
      // Past the 40-resident milestone so the dopamine toast pings
      // immediately rather than waiting on a growth tick.
      highestMilestoneReached: 40,
      lastMilestoneTick: 0,
    },
    zones: {
      cells: {
        // Residential cluster at the four corners of the interior 3x3
        // pattern (density 2 = 12 residents each).
        '4,4': { kind: 'residential', density: 2 },
        '4,6': { kind: 'residential', density: 2 },
        '6,4': { kind: 'residential', density: 2 },
        '6,6': { kind: 'residential', density: 2 },
        '3,4': { kind: 'residential', density: 1 },
        '3,6': { kind: 'residential', density: 1 },
        '7,4': { kind: 'residential', density: 1 },
        '7,6': { kind: 'residential', density: 1 },
        // Commercial along the middle row interior.
        '5,4': { kind: 'commercial', density: 1 },
        '5,6': { kind: 'commercial', density: 1 },
        // Industrial on the south-east outskirts.
        '6,7': { kind: 'industrial', density: 1 },
        '7,7': { kind: 'industrial', density: 1 },
      },
    },
    power: {
      // Coal plant north of the loop; solar plant south of the loop.
      // Anchor cells use the bottom-right of each plant's 2x2 canonical
      // footprint per REQ-085. Power lines are intentionally empty for
      // v1; placing them requires a connected-component walk to a zone
      // that this demo leaves to a follow-on slice (the existing power
      // status overlay reads 'powered' from the solver, so v1 zones
      // render as 'unpowered' until lines + grid solver ship).
      plants: [
        { kind: 'coal', row: 0, col: 5 },
        { kind: 'solar', row: 10, col: 5 },
      ],
      lines: {},
    },
    water: {
      // Water tower west of the loop, sewage treatment east. v1 pipes
      // empty for the same reason as power lines: connectivity solver
      // wiring lands in its own slice.
      sources: [
        { kind: 'water-tower', row: 5, col: 0 },
        { kind: 'pump-station', row: 5, col: 11 },
      ],
      pipes: {},
      treatmentPlants: [{ row: 0, col: 0 }],
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
