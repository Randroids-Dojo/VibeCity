import { describe, expect, it } from 'vitest'
import {
  EDITOR_HISTORY_MAX_PAST,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '@/lib/editor'
import { EMPTY_CITY, type City } from '@/lib/schemas'
import { placePiece } from '@/app/[slug]/edit/editorState'

/**
 * REQ-023 (editor undo / redo via immutable history stack).
 *
 * Tests cover the pure history math ported from VibeRacer's
 * `editorHistory.ts`. The React component layer (toolbar buttons,
 * keyboard shortcuts) is exercised by the editor Playwright spec.
 */

describe('createHistory', () => {
  it('seeds the present with the initial value', () => {
    const h = createHistory(EMPTY_CITY)
    expect(h.present).toBe(EMPTY_CITY)
  })

  it('starts with empty past and future stacks', () => {
    const h = createHistory(EMPTY_CITY)
    expect(h.past).toEqual([])
    expect(h.future).toEqual([])
  })

  it('reports neither undo nor redo available on a fresh history', () => {
    const h = createHistory(EMPTY_CITY)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})

describe('pushHistory', () => {
  it('moves the prior present onto the past stack and sets the new present', () => {
    const h0 = createHistory(EMPTY_CITY)
    const next = placePiece(EMPTY_CITY, 'straight', 0, 0)
    const h1 = pushHistory(h0, next)
    expect(h1.present).toBe(next)
    expect(h1.past).toEqual([EMPTY_CITY])
    expect(h1.future).toEqual([])
  })

  it('returns the same history when next is reference-equal to the present', () => {
    const h = createHistory(EMPTY_CITY)
    const same = pushHistory(h, EMPTY_CITY)
    expect(same).toBe(h)
    expect(same.past).toEqual([])
  })

  it('clears the future stack on a fresh push', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    const v2 = placePiece(v1, 'left90', 0, 1)
    let h = createHistory(v0)
    h = pushHistory(h, v1)
    h = pushHistory(h, v2)
    h = undoHistory(h)
    expect(h.future).toEqual([v2])
    const v1b = placePiece(v1, 'right90', 1, 0)
    h = pushHistory(h, v1b)
    expect(h.future).toEqual([])
    expect(h.present).toBe(v1b)
  })

  it('caps the past stack length at EDITOR_HISTORY_MAX_PAST', () => {
    let h = createHistory<City>({
      pieces: [],
      buildings: [],
    })
    // Push more entries than the cap; row picks a unique cell each
    // time so every push is a fresh object reference.
    const total = EDITOR_HISTORY_MAX_PAST + 5
    for (let i = 0; i < total; i++) {
      const next: City = {
        pieces: [{ type: 'straight', row: i, col: 0, rotation: 0 }],
        buildings: [],
      }
      h = pushHistory(h, next)
    }
    expect(h.past.length).toBe(EDITOR_HISTORY_MAX_PAST)
    // The most recent past entry should be the second-to-last value
    // pushed; the very first values fell off the front of the stack.
    const lastPast = h.past[h.past.length - 1]
    expect(lastPast.pieces[0].row).toBe(total - 2)
  })

  it('does not mutate the input history', () => {
    const h0 = createHistory(EMPTY_CITY)
    const next = placePiece(EMPTY_CITY, 'straight', 0, 0)
    const h1 = pushHistory(h0, next)
    expect(h1).not.toBe(h0)
    expect(h0.past).toEqual([])
    expect(h0.present).toBe(EMPTY_CITY)
  })
})

describe('undoHistory', () => {
  it('returns the same history when there is nothing to undo', () => {
    const h = createHistory(EMPTY_CITY)
    expect(undoHistory(h)).toBe(h)
  })

  it('moves the present onto future and pops the latest past into present', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    const h0 = createHistory(v0)
    const h1 = pushHistory(h0, v1)
    const undone = undoHistory(h1)
    expect(undone.present).toBe(v0)
    expect(undone.past).toEqual([])
    expect(undone.future).toEqual([v1])
  })

  it('walks back through multiple pushes one step at a time', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    const v2 = placePiece(v1, 'left90', 0, 1)
    let h = createHistory(v0)
    h = pushHistory(h, v1)
    h = pushHistory(h, v2)
    h = undoHistory(h)
    expect(h.present).toBe(v1)
    h = undoHistory(h)
    expect(h.present).toBe(v0)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(true)
  })

  it('does not mutate the input history', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    const h0 = createHistory(v0)
    const h1 = pushHistory(h0, v1)
    const undone = undoHistory(h1)
    expect(undone).not.toBe(h1)
    expect(h1.present).toBe(v1)
  })
})

describe('redoHistory', () => {
  it('returns the same history when there is nothing to redo', () => {
    const h = createHistory(EMPTY_CITY)
    expect(redoHistory(h)).toBe(h)
  })

  it('replays the most recent undo', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    let h = createHistory(v0)
    h = pushHistory(h, v1)
    h = undoHistory(h)
    expect(h.present).toBe(v0)
    h = redoHistory(h)
    expect(h.present).toBe(v1)
    expect(h.past).toEqual([v0])
    expect(h.future).toEqual([])
  })

  it('walks forward through multiple undos one step at a time', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    const v2 = placePiece(v1, 'left90', 0, 1)
    let h = createHistory(v0)
    h = pushHistory(h, v1)
    h = pushHistory(h, v2)
    h = undoHistory(h)
    h = undoHistory(h)
    expect(h.present).toBe(v0)
    h = redoHistory(h)
    expect(h.present).toBe(v1)
    h = redoHistory(h)
    expect(h.present).toBe(v2)
    expect(canRedo(h)).toBe(false)
  })

  it('does not mutate the input history', () => {
    const v0 = EMPTY_CITY
    const v1 = placePiece(v0, 'straight', 0, 0)
    let h = createHistory(v0)
    h = pushHistory(h, v1)
    const undone = undoHistory(h)
    const redone = redoHistory(undone)
    expect(redone).not.toBe(undone)
    expect(undone.future).toEqual([v1])
  })
})

describe('canUndo / canRedo flags', () => {
  it('flips canUndo on after the first push', () => {
    const v1 = placePiece(EMPTY_CITY, 'straight', 0, 0)
    let h = createHistory(EMPTY_CITY)
    expect(canUndo(h)).toBe(false)
    h = pushHistory(h, v1)
    expect(canUndo(h)).toBe(true)
  })

  it('flips canRedo on after an undo and off after a fresh push', () => {
    const v1 = placePiece(EMPTY_CITY, 'straight', 0, 0)
    const v1b = placePiece(EMPTY_CITY, 'left90', 0, 0)
    let h = createHistory(EMPTY_CITY)
    h = pushHistory(h, v1)
    expect(canRedo(h)).toBe(false)
    h = undoHistory(h)
    expect(canRedo(h)).toBe(true)
    h = pushHistory(h, v1b)
    expect(canRedo(h)).toBe(false)
  })
})

describe('round-trip with the editor reducers (REQ-023 + REQ-020 + REQ-022)', () => {
  it('place then undo restores the empty city by reference', () => {
    const v1 = placePiece(EMPTY_CITY, 'straight', 0, 0)
    let h = createHistory(EMPTY_CITY)
    h = pushHistory(h, v1)
    h = undoHistory(h)
    expect(h.present).toBe(EMPTY_CITY)
  })

  it('place, undo, redo lands on the placed city by reference', () => {
    const v1 = placePiece(EMPTY_CITY, 'straight', 0, 0)
    let h = createHistory(EMPTY_CITY)
    h = pushHistory(h, v1)
    h = undoHistory(h)
    h = redoHistory(h)
    expect(h.present).toBe(v1)
  })
})
