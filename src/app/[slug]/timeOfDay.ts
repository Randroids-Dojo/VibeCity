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
 * Resolve `city.mood?.timeOfDay` into a known mode. Defaults to
 * 'day' on missing / unknown values so a v1 city without a mood
 * field renders identically to the pre-slice baseline.
 */
export function resolveTimeOfDay(mood: CityMood | undefined | null): TimeOfDay {
  if (!mood) return 'day'
  if (mood.timeOfDay === 'night') return 'night'
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
