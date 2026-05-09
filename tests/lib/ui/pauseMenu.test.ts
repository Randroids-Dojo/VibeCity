import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAUSE_STATE,
  PAUSE_KEY_CODE,
  closePauseMenu,
  isPaused,
  openPauseMenu,
  togglePauseState,
  type PauseState,
} from '@/lib/ui/pauseMenu'

/**
 * REQ-039 pause via Esc, REQ-038 Edit CTA in pause menu. The state
 * machine itself is the unit-tested surface here; the React overlay
 * and the keyboard wiring live in `DriveSceneClient.tsx` and ride on
 * top of these helpers.
 */

describe('PAUSE_KEY_CODE', () => {
  it('is Escape (the platform-standard menu / pause key)', () => {
    expect(PAUSE_KEY_CODE).toBe('Escape')
  })
})

describe('DEFAULT_PAUSE_STATE', () => {
  it('starts running so the drive scene mounts in motion', () => {
    expect(DEFAULT_PAUSE_STATE).toBe('running')
  })
})

describe('togglePauseState', () => {
  it('flips running to paused', () => {
    expect(togglePauseState('running')).toBe('paused')
  })

  it('flips paused to running', () => {
    expect(togglePauseState('paused')).toBe('running')
  })

  it('round-trips back to the original state after two toggles', () => {
    const states: PauseState[] = ['running', 'paused']
    for (const start of states) {
      expect(togglePauseState(togglePauseState(start))).toBe(start)
    }
  })

  it('does not mutate the input value', () => {
    const start: PauseState = 'running'
    const next = togglePauseState(start)
    expect(start).toBe('running')
    expect(next).toBe('paused')
  })
})

describe('openPauseMenu', () => {
  it('forces the state to paused regardless of the prior state', () => {
    expect(openPauseMenu('running')).toBe('paused')
    expect(openPauseMenu('paused')).toBe('paused')
  })
})

describe('closePauseMenu', () => {
  it('forces the state to running regardless of the prior state', () => {
    expect(closePauseMenu('paused')).toBe('running')
    expect(closePauseMenu('running')).toBe('running')
  })
})

describe('isPaused', () => {
  it('returns true only for the paused state', () => {
    expect(isPaused('paused')).toBe(true)
    expect(isPaused('running')).toBe(false)
  })

  it('matches the running default at startup', () => {
    expect(isPaused(DEFAULT_PAUSE_STATE)).toBe(false)
  })
})
