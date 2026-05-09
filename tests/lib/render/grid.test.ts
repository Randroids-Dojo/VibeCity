import { describe, expect, it } from 'vitest'
import { cellKey, type GridCellCoord } from '@/lib/render/grid'

describe('cellKey', () => {
  it('encodes a positive (row, col) pair', () => {
    expect(cellKey(0, 0)).toBe('0,0')
    expect(cellKey(3, 7)).toBe('3,7')
  })

  it('encodes negative coordinates', () => {
    expect(cellKey(-1, -2)).toBe('-1,-2')
    expect(cellKey(-8, 8)).toBe('-8,8')
  })

  it('encodes large integer coordinates', () => {
    expect(cellKey(1000, 2000)).toBe('1000,2000')
  })

  it('produces stable keys across calls (pure function)', () => {
    expect(cellKey(5, 5)).toBe(cellKey(5, 5))
    expect(cellKey(5, 5)).not.toBe(cellKey(5, 6))
  })
})

describe('GridCellCoord type', () => {
  it('accepts an integer (row, col) shape', () => {
    const cell: GridCellCoord = { row: 1, col: 2 }
    expect(cell.row).toBe(1)
    expect(cell.col).toBe(2)
  })

  it('round-trips through cellKey', () => {
    const cell: GridCellCoord = { row: -3, col: 4 }
    expect(cellKey(cell.row, cell.col)).toBe('-3,4')
  })
})
