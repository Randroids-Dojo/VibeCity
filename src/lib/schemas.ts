import { z } from 'zod'

/**
 * Slug schema for city URLs.
 *
 * Rules (REQ-008):
 *   - kebab-case
 *   - 1 to 128 chars
 *   - first char must be [a-z0-9]
 *   - remaining chars are [a-z0-9-]
 *
 * Ported from VibeRacer's `src/lib/schemas.ts` SlugSchema.
 */
export const SlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be kebab-case')

export type Slug = z.infer<typeof SlugSchema>

/**
 * Best-effort normalizer for raw user input.
 *
 * Lowercases, drops disallowed characters, strips a leading run of dashes,
 * and clamps to the schema's max length. Output is not guaranteed to pass
 * `SlugSchema.safeParse` (e.g. an all-dash input collapses to empty); the
 * caller must validate with `SlugSchema` before use.
 */
export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .slice(0, 128)
}

/**
 * Street piece taxonomy (REQ-017, REQ-018, REQ-019, REQ-058, REQ-060,
 * REQ-061, REQ-062).
 *
 * Mirrors VibeRacer's `PieceTypeSchema` (the editor vocabulary), plus
 * `intersection` which is VibeCity-specific (4-way junction extending
 * VibeRacer's planned 3-connector junction; see REQ-019).
 *
 * `arc45` (REQ-061) bridges a cardinal connector to a corner connector,
 * acting as the transition piece between cardinal-only runs (straight,
 * 90deg turns, sweeps) and diagonal runs. `diagonal` (REQ-062) chains
 * corner-to-corner across a single cell. Both are ported from VibeRacer
 * 2026-05-03 and depend on the 8-direction connector scaffold (REQ-063)
 * for connector validation; v1 ports the schema entries now so cities
 * can record placements ahead of the runtime port.
 *
 * The schema accepts every piece in the planned v1 taxonomy. Hiding a
 * piece from the palette UI is a separate concern; the schema does not
 * gate placeability beyond the type enum.
 */
export const PieceTypeSchema = z.enum([
  'straight',
  'left90',
  'right90',
  'scurve',
  'scurveLeft',
  'sweepRight',
  'sweepLeft',
  'megaSweepRight',
  'megaSweepLeft',
  'hairpin',
  'arc45',
  'diagonal',
  'intersection',
])
export type PieceType = z.infer<typeof PieceTypeSchema>

/**
 * Rotation in 90deg increments. Matches VibeRacer's `RotationSchema`.
 */
export const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
])
export type Rotation = z.infer<typeof RotationSchema>

/**
 * Multi-cell footprint cell offset (REQ-059). When omitted, callers
 * treat the piece as a single-cell footprint at `(row, col)`.
 */
const PieceFootprintCellSchema = z
  .object({
    dr: z.number().int(),
    dc: z.number().int(),
  })
  .strict()
export type PieceFootprintCell = z.infer<typeof PieceFootprintCellSchema>

/**
 * One street piece placed on the city grid (REQ-012, REQ-059).
 */
export const PieceSchema = z
  .object({
    type: PieceTypeSchema,
    row: z.number().int(),
    col: z.number().int(),
    rotation: RotationSchema,
    footprint: z.array(PieceFootprintCellSchema).min(1).optional(),
  })
  .strict()
export type Piece = z.infer<typeof PieceSchema>

/**
 * Building taxonomy for v1 (Q-004 default B).
 *
 * Four placeholder primitive types render as extruded boxes with
 * distinct silhouettes (REQ-028, REQ-046). v1 buildings have no
 * simulation behavior; they are visual variety for the drive view.
 */
export const BuildingTypeSchema = z.enum([
  'small-house',
  'mid-house',
  'shop',
  'factory',
])
export type BuildingType = z.infer<typeof BuildingTypeSchema>

/**
 * One building placed on the city grid (REQ-012, REQ-028, REQ-029).
 */
export const BuildingSchema = z
  .object({
    type: BuildingTypeSchema,
    row: z.number().int(),
    col: z.number().int(),
    rotation: RotationSchema,
  })
  .strict()
export type Building = z.infer<typeof BuildingSchema>

/**
 * Allowed `CityMood.timeOfDay` values (REQ-088 lit-window slice).
 *
 *   - `'day'`: the v1 baseline palette.
 *   - `'night'`: lit-window / streetlamp render layer in the drive
 *     scene.
 *   - `'dusk'`: reserved for a future palette slice; consumers that
 *     do not recognize it fall back to 'day' via `resolveTimeOfDay`
 *     in `src/app/[slug]/timeOfDay.ts`.
 *   - `'auto'`: the day-night cycle resolver (`resolveTimeOfDay`)
 *     phase-shifts between day and night across `DAY_NIGHT_CYCLE_TICKS`.
 *     Already in production via the mass-appeal slice.
 *
 * An undefined `timeOfDay` field stays undefined on the parsed object;
 * the runtime resolver collapses undefined to `'day'` so a city without
 * any mood reads as day mode. Pre-existing cities authored before this
 * tightening landed do not carry a `timeOfDay` field at all, so they
 * parse identically to before.
 */
export const TimeOfDaySchema = z.enum(['day', 'night', 'dusk', 'auto'])
export type TimeOfDayMood = z.infer<typeof TimeOfDaySchema>

/**
 * Optional per-city author "preferred mood": a time-of-day and / or
 * weather preset baked into the saved city version. Both fields are
 * optional so a city author can pick one, both, or neither. Mood is
 * NOT included in the version hash (REQ-013), so adding or changing
 * the mood on an existing city keeps every prior version reference
 * intact.
 *
 * `timeOfDay` is a literal union (`TimeOfDaySchema`); the lighting
 * module in `src/app/[slug]/timeOfDay.ts` is the canonical consumer.
 * `weather` stays an opaque short string because the weather palette
 * has not yet shipped; that field tightens in its own slice.
 */
export const CityMoodSchema = z
  .object({
    timeOfDay: TimeOfDaySchema.optional(),
    weather: z.string().min(1).max(32).optional(),
  })
  .strict()
export type CityMood = z.infer<typeof CityMoodSchema>

export const MAX_PIECES_PER_CITY = 256
export const MAX_BUILDINGS_PER_CITY = 512

/**
 * Sim state schema for the City.sim field (REQ-070..074 substrate
 * slice 1). Defined inline here as a `z.unknown()` placeholder so the
 * core schema stays parseable on cities that pre-date the sim layer
 * (sim is absent on v1 cities). The strict schema lives in
 * `src/lib/sim/state.ts`; consumers that need the full type validate
 * separately. This indirection avoids an import cycle between schemas.ts
 * (the v1 building blocks) and the sim subdirectory (which depends on
 * `BuilderIdSchema` from this file).
 *
 * Future hardening (a follow-on slice can flip this to import the
 * strict `SimStateSchema` directly once the import shape is sorted):
 * the tradeoff is that strict validation here would force every load
 * path to know about the sim layer, while the unknown-passthrough
 * keeps the core schema oblivious until the sim layer surfaces.
 */
const CitySimFieldSchema = z.unknown().optional()

/**
 * The canonical city payload (REQ-012, extended REQ-070 substrate).
 *
 * Strict on unknown fields: any extra key fails validation. Pieces
 * and buildings are arrays so an empty city (`pieces: [], buildings: []`)
 * is the v1 starting state for a fresh slug.
 *
 * `mood` is excluded from the version hash (REQ-013), so changing
 * mood does not produce a new version. Persistence rules are in
 * `docs/gdd/03-persistence.md`.
 *
 * `sim` is the substrate's sim state (REQ-072). Absent on pre-pivot
 * v1 cities; present after the first sim event fires on a slug. The
 * strict schema for the field lives in `src/lib/sim/state.ts`; this
 * file accepts unknown so the core schema does not depend on the sim
 * subdirectory.
 */
export const CitySchema = z
  .object({
    pieces: z.array(PieceSchema).max(MAX_PIECES_PER_CITY),
    buildings: z.array(BuildingSchema).max(MAX_BUILDINGS_PER_CITY),
    mood: CityMoodSchema.optional(),
    sim: CitySimFieldSchema,
  })
  .strict()
export type City = z.infer<typeof CitySchema>

/**
 * The empty city. Exported so callers (REQ-015 fallback path, fresh-slug
 * landing per REQ-010) can return a known-good payload without
 * reconstructing it.
 */
export const EMPTY_CITY: City = {
  pieces: [],
  buildings: [],
}

/**
 * Anonymous builder identity (REQ-009).
 *
 * UUID v4 issued on first visit and persisted in a long-lived cookie.
 * Mirrors VibeRacer's `RacerIdSchema`. Used by the persistence layer
 * (REQ-014) to gate writes: only the builder whose id matches the
 * `createdByBuilderId` recorded on a city version may overwrite that
 * city's `:latest`.
 */
export const BuilderIdSchema = z.string().uuid()
export type BuilderId = z.infer<typeof BuilderIdSchema>
