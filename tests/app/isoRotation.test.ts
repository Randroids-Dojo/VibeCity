import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ISO_ROTATION_DEG,
  ISO_ROTATION_STEP_DEG,
  normalizeIsoRotation,
  rotateIsoCcw,
  rotateIsoCw,
} from '@/app/[slug]/edit/isoRotation'

describe('isoRotation constants (REQ-111 slice C)', () => {
  it('ISO_ROTATION_STEP_DEG is 90 (four cardinal snaps)', () => {
    expect(ISO_ROTATION_STEP_DEG).toBe(90)
  })

  it('DEFAULT_ISO_ROTATION_DEG is 0 (matches the slice-A iso baseline)', () => {
    expect(DEFAULT_ISO_ROTATION_DEG).toBe(0)
  })
})

describe('normalizeIsoRotation', () => {
  it('passes through canonical [0, 360) values unchanged', () => {
    expect(normalizeIsoRotation(0)).toBe(0)
    expect(normalizeIsoRotation(90)).toBe(90)
    expect(normalizeIsoRotation(180)).toBe(180)
    expect(normalizeIsoRotation(270)).toBe(270)
  })

  it('wraps values >= 360 back into the canonical range', () => {
    expect(normalizeIsoRotation(360)).toBe(0)
    expect(normalizeIsoRotation(450)).toBe(90)
    expect(normalizeIsoRotation(720)).toBe(0)
  })

  it('wraps negative values via positive-modulo', () => {
    expect(normalizeIsoRotation(-90)).toBe(270)
    expect(normalizeIsoRotation(-180)).toBe(180)
    expect(normalizeIsoRotation(-450)).toBe(270)
  })

  it('falls back to the default for non-finite input', () => {
    expect(normalizeIsoRotation(Number.NaN)).toBe(DEFAULT_ISO_ROTATION_DEG)
    expect(normalizeIsoRotation(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_ISO_ROTATION_DEG,
    )
    expect(normalizeIsoRotation(Number.NEGATIVE_INFINITY)).toBe(
      DEFAULT_ISO_ROTATION_DEG,
    )
  })
})

describe('rotateIsoCcw', () => {
  it('subtracts 90deg and wraps', () => {
    expect(rotateIsoCcw(0)).toBe(270)
    expect(rotateIsoCcw(90)).toBe(0)
    expect(rotateIsoCcw(180)).toBe(90)
    expect(rotateIsoCcw(270)).toBe(180)
  })

  it('four ccw rotations return to the start', () => {
    let r = 0
    for (let i = 0; i < 4; i++) r = rotateIsoCcw(r)
    expect(r).toBe(0)
  })

  it('normalizes a non-canonical input before stepping', () => {
    expect(rotateIsoCcw(450)).toBe(0)
    expect(rotateIsoCcw(-45)).toBe(225)
  })
})

describe('rotateIsoCw', () => {
  it('adds 90deg and wraps', () => {
    expect(rotateIsoCw(0)).toBe(90)
    expect(rotateIsoCw(90)).toBe(180)
    expect(rotateIsoCw(180)).toBe(270)
    expect(rotateIsoCw(270)).toBe(0)
  })

  it('four cw rotations return to the start', () => {
    let r = 0
    for (let i = 0; i < 4; i++) r = rotateIsoCw(r)
    expect(r).toBe(0)
  })

  it('rotateIsoCcw and rotateIsoCw are inverses', () => {
    for (const start of [0, 90, 180, 270]) {
      expect(rotateIsoCw(rotateIsoCcw(start))).toBe(start)
      expect(rotateIsoCcw(rotateIsoCw(start))).toBe(start)
    }
  })
})
