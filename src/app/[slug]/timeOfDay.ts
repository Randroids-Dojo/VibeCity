import type { CityMood } from '@/lib/schemas'
import type { CellPowerStatus } from '@/lib/sim/powerSolver'
import type { ZoneKind } from '@/lib/sim/state'

/**
 * Time-of-day rendering helpers (REQ-088 slice 2 of 2: lit-windows
 * payoff in the drive scene).
 *
 * Reads `city.mood?.timeOfDay` and decides sky color, ground tint,
 * sun intensity, and per-zone emissive contribution. Pure helpers
 * with no three.js dependency so the unit tests can exercise the
 * shape without a renderer.
 *
 * v1 ships two modes: 'day' (the existing palette) and 'night' (a
 * darker sky + brighter emissive for powered zones). 'dusk' /
 * 'dawn' are reserved in the union for future polish; `resolveTimeOfDay`
 * collapses unknown values to 'day' so a malformed mood payload does
 * not break the renderer.
 */

export type TimeOfDay = 'day' | 'night'

/**
 * Auto-cycle length in sim ticks. At the default 4Hz tick rate this
 * is 60 wall-seconds per full day-night cycle (30s day + 30s night).
 * Mass-appeal slice 3: when `mood.timeOfDay === 'auto'` the renderer
 * flips state on each cycle boundary so the city visibly changes
 * over time without player input.
 */
export const DAY_NIGHT_CYCLE_TICKS = 240

/**
 * Resolve `city.mood?.timeOfDay` into a known mode.
 *
 *   - `undefined` / unknown: defaults to 'day' (v1 baseline).
 *   - `'day'` / `'night'`: locked by the player.
 *   - `'auto'`: phase-based on `tick`. The first half of each
 *     `DAY_NIGHT_CYCLE_TICKS` cycle is day, the second half is
 *     night. Two clients replaying the same tick render
 *     identically.
 */
export function resolveTimeOfDay(
  mood: CityMood | undefined | null,
  tick: number = 0,
): TimeOfDay {
  if (!mood) return 'day'
  if (mood.timeOfDay === 'night') return 'night'
  if (mood.timeOfDay === 'auto') {
    const phase = ((tick % DAY_NIGHT_CYCLE_TICKS) + DAY_NIGHT_CYCLE_TICKS) %
      DAY_NIGHT_CYCLE_TICKS
    return phase < DAY_NIGHT_CYCLE_TICKS / 2 ? 'day' : 'night'
  }
  return 'day'
}

/**
 * Per-mode sky / ground / sun rendering constants.
 *
 * Sky color: lighter blue for day, deep navy for night. Ground tint
 * darkens at night so the powered zones read as the brightest things
 * in the scene. Sun intensity drops to a moonlight-equivalent at
 * night; ambient stays slightly higher so the player can still see
 * unpowered zones rather than a completely black void.
 */
export interface TimeOfDayPalette {
  /** Hex color for `scene.background` and the sky dome. */
  skyHex: number
  /** Hex color for the flat ground plane. */
  groundHex: number
  /** Sun intensity (0..1+). Day at 1.0, night at 0.15. */
  sunIntensity: number
  /** Ambient light intensity. Day at 0.4, night at 0.25. */
  ambientIntensity: number
}

export const TIME_OF_DAY_PALETTE: Record<TimeOfDay, TimeOfDayPalette> = {
  day: {
    skyHex: 0xbfd9e8,
    groundHex: 0xf2ecd9,
    sunIntensity: 1.0,
    ambientIntensity: 0.4,
  },
  night: {
    skyHex: 0x0e1a2c,
    groundHex: 0x2a2f1e,
    sunIntensity: 0.15,
    ambientIntensity: 0.25,
  },
}

/**
 * Per-(time-of-day, zone-kind, power-status) emissive contribution
 * in hex. The emissive color is added to the material's base color,
 * so a value like `0x222222` is a subtle nudge while `0xff8c00` is
 * a strong warm glow.
 *
 * Day mode keeps the existing slice 1 visuals: brownout zones get a
 * subtle warning tint; everything else is `0x000000` (no emissive).
 *
 * Night mode is the lit-windows-at-night payoff:
 *
 * - Powered residential: warm orange / amber (`0xff8c00`-ish) reads
 *   as "homes lit at night"
 * - Powered commercial: cool blue-white reads as office / shop lights
 * - Powered industrial: dim red / orange reads as "running hot"
 * - Brownout: dim warm yellow ("flickering" in lieu of animation)
 * - Unpowered: stays dark; the ground tint plus low sun keeps the
 *   cell visible but unlit
 */
export function zoneEmissiveHex(
  timeOfDay: TimeOfDay,
  kind: ZoneKind,
  status: CellPowerStatus,
): number {
  if (timeOfDay === 'day') {
    if (status === 'brownout') return 0x222200
    return 0x000000
  }
  // night
  if (status === 'unpowered') return 0x000000
  if (status === 'brownout') return 0x332208
  // powered: kind-distinct lit color
  if (kind === 'residential') return 0xffa040
  if (kind === 'commercial') return 0x80c0ff
  return 0xa04020
}

/**
 * Day mode: zone emissive is essentially off (only brownout gets a
 * subtle tint). Night mode: zone emissive is the dominant visual
 * signal. The intensity multiplier scales how bright the emissive
 * reads against the dimmed sky / ground; the renderer applies it
 * via material.emissiveIntensity.
 */
export function zoneEmissiveIntensity(
  timeOfDay: TimeOfDay,
  status: CellPowerStatus,
): number {
  if (timeOfDay === 'day') {
    return status === 'brownout' ? 1.0 : 0
  }
  // night
  if (status === 'powered') return 1.6
  if (status === 'brownout') return 0.8
  return 0
}

/**
 * Per-building lit-window emissive at night (placement-layer payoff).
 * Buildings light up regardless of zone power status because the v1
 * `city.buildings` placeholders are not yet wired into the power
 * solver (zones drive the powered / unpowered classification). Once
 * REQ-046 buildings migrate into the zoning system, this can read
 * the cell's power status and dim unpowered buildings.
 *
 * Day mode: 0 (no emissive). Night mode: warm amber for residential-
 * shaped buildings, cooler white for commercial / utility buildings.
 */
export const BUILDING_LIT_WINDOW_HEX_NIGHT = 0xffb060
export const BUILDING_LIT_WINDOW_INTENSITY_NIGHT = 0.9

/**
 * Streetlamp emissive (lit at night, off during day). Lamps render at
 * intersection cells so the player driving at night sees the lit
 * grid corners as an ambient cue rather than a uniform dark plane.
 */
export const STREETLAMP_HEX_NIGHT = 0xffd278
export const STREETLAMP_INTENSITY_NIGHT = 1.4
