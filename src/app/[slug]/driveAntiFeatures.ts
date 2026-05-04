/**
 * Drive-mode anti-feature lockdown (REQ-037).
 *
 * Pure module: no React, no DOM, no three.js. The drive surface is a
 * city-builder loop, not a racing game; v1 explicitly forbids a lap
 * timer, checkpoints, lap counters, finish lines, race standings, or
 * any other race-scoring HUD. This file makes that anti-feature
 * machine-checkable so a future slice cannot quietly add race
 * vocabulary to the HUD without a test failing.
 *
 * Two surfaces are checked:
 *
 * 1. The vocabulary surface: any string that the drive HUD displays
 *    (`HUD_CONTROLS_HINT_LINES`, `HUD_SPEED_LABEL`, `HUD_SPEED_UNIT`,
 *    the engine-mute label) is filtered through `containsRaceHudVocabulary`
 *    in the unit tests so a copy edit cannot smuggle "lap" or
 *    "checkpoint" into a player-visible string.
 *
 * 2. The element surface: a fixed list of testids
 *    (`RACE_HUD_FORBIDDEN_TESTIDS`) is asserted absent in the e2e
 *    suite so a future slice cannot add a `data-testid="drive-lap-timer"`
 *    panel without a Playwright case failing.
 *
 * The forbidden term list is the conservative core race vocabulary;
 * if a future slice needs a term that overlaps innocuously (for
 * example "elapsed" in a settings pane), the test surface already
 * scopes the vocabulary check to the specific HUD strings rather
 * than the full source tree, so the lockdown does not infect unrelated
 * code.
 */

/**
 * The forbidden race-HUD terms. Lowercase, deduplicated, and ordered
 * by how likely they are to appear in a regression. The `containsRaceHudVocabulary`
 * helper does a case-insensitive whole-word match so partial matches
 * (e.g. "elapsed" containing "lap") do not trigger a false positive.
 */
export const RACE_HUD_FORBIDDEN_TERMS: ReadonlyArray<string> = [
  'lap',
  'laps',
  'checkpoint',
  'checkpoints',
  'lap timer',
  'lap counter',
  'finish line',
  'race time',
  'best time',
  'fastest lap',
  'leaderboard',
  'standings',
  'podium',
]

/**
 * The forbidden race-HUD testids. The e2e suite asserts each resolves
 * to zero elements on every drive view so a future slice cannot ship
 * a race HUD panel without the assertion failing.
 *
 * Naming convention: `drive-<concept>` so the vocabulary mirrors the
 * existing `drive-hud-speed`, `drive-hud-controls`, `drive-minimap`
 * testids the drive scene already uses.
 */
export const RACE_HUD_FORBIDDEN_TESTIDS: ReadonlyArray<string> = [
  'drive-lap-timer',
  'drive-lap-counter',
  'drive-checkpoint',
  'drive-checkpoint-banner',
  'drive-race-timer',
  'drive-finish-line',
  'drive-leaderboard',
  'drive-standings',
]

const WORD_BOUNDARY_PATTERN = /[a-z0-9]+/g

/**
 * Returns true if `text` contains any term from `RACE_HUD_FORBIDDEN_TERMS`
 * as a whole word (case-insensitive). Multi-word terms (e.g. "lap timer")
 * are matched as a contiguous lowercase substring after the input is
 * normalized; single-word terms are matched against tokens split on
 * non-alphanumeric boundaries so "elapsed" does not match "lap" and
 * "checkpointing" does not match "checkpoint".
 *
 * Non-string inputs (defensive against a tuning bug that puts a number
 * or null into a HUD overlay) return false so the helper does not
 * throw on unexpected input.
 */
export function containsRaceHudVocabulary(text: unknown): boolean {
  if (typeof text !== 'string' || text.length === 0) return false
  const lower = text.toLowerCase()
  const tokens = new Set(lower.match(WORD_BOUNDARY_PATTERN) ?? [])
  for (const term of RACE_HUD_FORBIDDEN_TERMS) {
    if (term.includes(' ')) {
      if (lower.includes(term)) return true
    } else if (tokens.has(term)) {
      return true
    }
  }
  return false
}
