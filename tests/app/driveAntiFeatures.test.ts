import { describe, expect, it } from 'vitest'
import {
  RACE_HUD_FORBIDDEN_TERMS,
  RACE_HUD_FORBIDDEN_TESTIDS,
  containsRaceHudVocabulary,
} from '@/app/[slug]/driveAntiFeatures'
import {
  HUD_CONTROLS_HINT_LINES,
  HUD_SPEED_LABEL,
  HUD_SPEED_UNIT,
} from '@/app/[slug]/driveHud'

/**
 * REQ-037 drive-mode anti-feature lockdown: NO laps, NO checkpoints,
 * NO HUD lap timer. The forbidden term list and the forbidden testid
 * list are exported as constants so the e2e suite and the unit tests
 * share the same vocabulary contract.
 */

describe('RACE_HUD_FORBIDDEN_TERMS', () => {
  it('exposes a non-empty list of terms', () => {
    expect(RACE_HUD_FORBIDDEN_TERMS.length).toBeGreaterThan(0)
  })

  it('lists every term in lowercase so the matcher can normalize input cheaply', () => {
    for (const term of RACE_HUD_FORBIDDEN_TERMS) {
      expect(term).toBe(term.toLowerCase())
      expect(term.length).toBeGreaterThan(0)
      expect(term).toBe(term.trim())
    }
  })

  it('contains no duplicate terms', () => {
    const unique = new Set(RACE_HUD_FORBIDDEN_TERMS)
    expect(unique.size).toBe(RACE_HUD_FORBIDDEN_TERMS.length)
  })

  it('includes the core race vocabulary VibeCity rejects', () => {
    expect(RACE_HUD_FORBIDDEN_TERMS).toContain('lap')
    expect(RACE_HUD_FORBIDDEN_TERMS).toContain('checkpoint')
    expect(RACE_HUD_FORBIDDEN_TERMS).toContain('lap timer')
  })
})

describe('RACE_HUD_FORBIDDEN_TESTIDS', () => {
  it('exposes a non-empty list of testids', () => {
    expect(RACE_HUD_FORBIDDEN_TESTIDS.length).toBeGreaterThan(0)
  })

  it('namespaces every testid under the drive surface', () => {
    for (const id of RACE_HUD_FORBIDDEN_TESTIDS) {
      expect(id.startsWith('drive-')).toBe(true)
      expect(id).toBe(id.trim())
      expect(id.length).toBeGreaterThan('drive-'.length)
    }
  })

  it('contains no duplicate testids', () => {
    const unique = new Set(RACE_HUD_FORBIDDEN_TESTIDS)
    expect(unique.size).toBe(RACE_HUD_FORBIDDEN_TESTIDS.length)
  })

  it('covers the headline race-HUD elements VibeCity forbids', () => {
    expect(RACE_HUD_FORBIDDEN_TESTIDS).toContain('drive-lap-timer')
    expect(RACE_HUD_FORBIDDEN_TESTIDS).toContain('drive-checkpoint')
    expect(RACE_HUD_FORBIDDEN_TESTIDS).toContain('drive-race-timer')
  })
})

describe('containsRaceHudVocabulary', () => {
  it('returns true for the bare forbidden single-word terms', () => {
    expect(containsRaceHudVocabulary('lap')).toBe(true)
    expect(containsRaceHudVocabulary('checkpoint')).toBe(true)
    expect(containsRaceHudVocabulary('podium')).toBe(true)
  })

  it('returns true for case variations of the forbidden terms', () => {
    expect(containsRaceHudVocabulary('LAP')).toBe(true)
    expect(containsRaceHudVocabulary('Checkpoint')).toBe(true)
    expect(containsRaceHudVocabulary('PoDiUm')).toBe(true)
  })

  it('returns true for the forbidden multi-word terms', () => {
    expect(containsRaceHudVocabulary('lap timer')).toBe(true)
    expect(containsRaceHudVocabulary('Best Time today')).toBe(true)
    expect(containsRaceHudVocabulary('Welcome to the leaderboard')).toBe(true)
  })

  it('returns true when the forbidden term sits in a sentence', () => {
    expect(containsRaceHudVocabulary('Press R to reset the lap')).toBe(true)
    expect(containsRaceHudVocabulary('You crossed a checkpoint!')).toBe(true)
  })

  it('returns false for innocuous words that contain a forbidden token as a substring', () => {
    // "elapsed" contains "lap" but is not the same word; "flap" and "clap" similar.
    expect(containsRaceHudVocabulary('elapsed')).toBe(false)
    expect(containsRaceHudVocabulary('flap')).toBe(false)
    expect(containsRaceHudVocabulary('clap')).toBe(false)
    expect(containsRaceHudVocabulary('overlapping')).toBe(false)
    expect(containsRaceHudVocabulary('checkpointing')).toBe(false)
  })

  it('returns false for HUD vocabulary VibeCity actually ships', () => {
    expect(containsRaceHudVocabulary('throttle')).toBe(false)
    expect(containsRaceHudVocabulary('brake')).toBe(false)
    expect(containsRaceHudVocabulary('steer left')).toBe(false)
    expect(containsRaceHudVocabulary('Speed wu/s')).toBe(false)
    expect(containsRaceHudVocabulary('M: mute engine')).toBe(false)
    expect(containsRaceHudVocabulary('Esc: pause')).toBe(false)
    expect(containsRaceHudVocabulary('R: respawn')).toBe(false)
  })

  it('returns false for the empty string', () => {
    expect(containsRaceHudVocabulary('')).toBe(false)
  })

  it('returns false for non-string inputs', () => {
    // Defensive: a tuning bug that puts a number or null into the HUD
    // overlay must not throw inside the matcher.
    expect(containsRaceHudVocabulary(undefined)).toBe(false)
    expect(containsRaceHudVocabulary(null)).toBe(false)
    expect(containsRaceHudVocabulary(0)).toBe(false)
    expect(containsRaceHudVocabulary(123)).toBe(false)
    expect(containsRaceHudVocabulary({})).toBe(false)
    expect(containsRaceHudVocabulary([])).toBe(false)
  })
})

describe('Drive HUD strings respect the REQ-037 anti-feature', () => {
  it('keeps every controls-hint line free of race vocabulary', () => {
    for (const line of HUD_CONTROLS_HINT_LINES) {
      expect(containsRaceHudVocabulary(line)).toBe(false)
    }
  })

  it('keeps the speed label and unit free of race vocabulary', () => {
    expect(containsRaceHudVocabulary(HUD_SPEED_LABEL)).toBe(false)
    expect(containsRaceHudVocabulary(HUD_SPEED_UNIT)).toBe(false)
  })
})
