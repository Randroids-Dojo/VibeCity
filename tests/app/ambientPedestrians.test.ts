import { describe, it, expect } from 'vitest'
import {
  PEDESTRIANS_PER_CELL_CAP,
  pedestrianAnchors,
  pedestrianCountForResidents,
  pedestrianOffsetWithinCell,
} from '@/app/[slug]/ambientPedestrians'
import type { PopulationBucket } from '@/lib/sim/state'

const cellToWorld = (row: number, col: number) => ({
  x: col * 10,
  z: row * 10,
})

const emptyPopulation = (): PopulationBucket => ({
  cells: {},
  totalPopulation: 0,
  totalTripDemand: 0,
  cityHappiness: 100,
  highestMilestoneReached: 0,
  lastMilestoneTick: 0,
})

describe('pedestrianAnchors', () => {
  it('returns an empty array for a population with no cells', () => {
    expect(pedestrianAnchors(emptyPopulation(), cellToWorld)).toEqual([])
  })

  it('skips cells with residents = 0', () => {
    const population: PopulationBucket = {
      cells: {
        '0,0': { residents: 0, tripDemand: 0, unhappyTicks: 0 },
      },
      totalPopulation: 0,
      totalTripDemand: 0,
      cityHappiness: 100,
      highestMilestoneReached: 0,
      lastMilestoneTick: 0,
    }
    expect(pedestrianAnchors(population, cellToWorld)).toEqual([])
  })

  it('emits one anchor per populated cell at the world-projected position with tiered count', () => {
    const population: PopulationBucket = {
      cells: {
        '0,0': { residents: 4, tripDemand: 0, unhappyTicks: 0 },
        '1,2': { residents: 12, tripDemand: 0, unhappyTicks: 0 },
      },
      totalPopulation: 16,
      totalTripDemand: 0,
      cityHappiness: 100,
      highestMilestoneReached: 0,
      lastMilestoneTick: 0,
    }
    const anchors = pedestrianAnchors(population, cellToWorld)
    expect(anchors).toHaveLength(2)
    expect(anchors[0]).toEqual({
      x: 0,
      z: 0,
      cellRow: 0,
      cellCol: 0,
      count: 1,
    })
    expect(anchors[1]).toEqual({
      x: 20,
      z: 10,
      cellRow: 1,
      cellCol: 2,
      count: 2,
    })
  })

  it('caps count at PEDESTRIANS_PER_CELL_CAP for density-3 residents (40+)', () => {
    const population: PopulationBucket = {
      cells: {
        '0,0': { residents: 40, tripDemand: 0, unhappyTicks: 0 },
      },
      totalPopulation: 40,
      totalTripDemand: 0,
      cityHappiness: 100,
      highestMilestoneReached: 0,
      lastMilestoneTick: 0,
    }
    const anchors = pedestrianAnchors(population, cellToWorld)
    expect(anchors).toHaveLength(1)
    expect(anchors[0].count).toBe(PEDESTRIANS_PER_CELL_CAP)
  })

  it('iterates cell keys in sorted order for replay stability', () => {
    const population: PopulationBucket = {
      cells: {
        '5,3': { residents: 1, tripDemand: 0, unhappyTicks: 0 },
        '0,9': { residents: 1, tripDemand: 0, unhappyTicks: 0 },
        '2,2': { residents: 1, tripDemand: 0, unhappyTicks: 0 },
      },
      totalPopulation: 3,
      totalTripDemand: 0,
      cityHappiness: 100,
      highestMilestoneReached: 0,
      lastMilestoneTick: 0,
    }
    const anchors = pedestrianAnchors(population, cellToWorld)
    expect(anchors.map((a) => `${a.cellRow},${a.cellCol}`)).toEqual([
      '0,9',
      '2,2',
      '5,3',
    ])
  })
})

describe('pedestrianCountForResidents', () => {
  it('returns 0 for residents <= 0', () => {
    expect(pedestrianCountForResidents(0)).toBe(0)
    expect(pedestrianCountForResidents(-3)).toBe(0)
  })

  it('returns 1 for density-1 cells (1..4 residents)', () => {
    expect(pedestrianCountForResidents(1)).toBe(1)
    expect(pedestrianCountForResidents(4)).toBe(1)
  })

  it('returns 2 for density-2 cells (5..12 residents)', () => {
    expect(pedestrianCountForResidents(5)).toBe(2)
    expect(pedestrianCountForResidents(12)).toBe(2)
  })

  it('returns PEDESTRIANS_PER_CELL_CAP (4) for density-3 cells (13+)', () => {
    expect(pedestrianCountForResidents(13)).toBe(PEDESTRIANS_PER_CELL_CAP)
    expect(pedestrianCountForResidents(40)).toBe(PEDESTRIANS_PER_CELL_CAP)
    expect(pedestrianCountForResidents(1000)).toBe(PEDESTRIANS_PER_CELL_CAP)
  })
})

describe('pedestrianOffsetWithinCell', () => {
  it('returns the four corners of a small square inside the cell', () => {
    const cellSize = 100
    expect(pedestrianOffsetWithinCell(0, cellSize)).toEqual({
      dx: -18,
      dz: -18,
    })
    expect(pedestrianOffsetWithinCell(1, cellSize)).toEqual({
      dx: 18,
      dz: -18,
    })
    expect(pedestrianOffsetWithinCell(2, cellSize)).toEqual({
      dx: -18,
      dz: 18,
    })
    expect(pedestrianOffsetWithinCell(3, cellSize)).toEqual({
      dx: 18,
      dz: 18,
    })
  })

  it('wraps modulo 4 for indices >= 4', () => {
    const cellSize = 100
    expect(pedestrianOffsetWithinCell(4, cellSize)).toEqual({
      dx: -18,
      dz: -18,
    })
    expect(pedestrianOffsetWithinCell(7, cellSize)).toEqual({
      dx: 18,
      dz: 18,
    })
  })
})
