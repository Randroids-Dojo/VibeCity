import {
  COAL_POLLUTION_PER_TICK,
  COAL_POLLUTION_RADIUS_CELLS,
  powerLineKey,
  type PowerBucket,
} from './state'

const ORTHOGONAL_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

export function solveCoalPollution(power: PowerBucket): Record<string, number> {
  const pollution: Record<string, number> = {}
  for (const plant of power.plants) {
    if (plant.kind !== 'coal') continue
    for (const [dr, dc] of ORTHOGONAL_OFFSETS) {
      const key = powerLineKey(
        plant.row + dr * COAL_POLLUTION_RADIUS_CELLS,
        plant.col + dc * COAL_POLLUTION_RADIUS_CELLS,
      )
      pollution[key] = (pollution[key] ?? 0) + COAL_POLLUTION_PER_TICK
    }
  }
  return pollution
}

export function refreshPowerPollution(power: PowerBucket): PowerBucket {
  const pollution = solveCoalPollution(power)
  const previousKeys = Object.keys(power.pollution)
  const nextKeys = Object.keys(pollution)
  if (
    previousKeys.length === nextKeys.length &&
    nextKeys.every((key) => power.pollution[key] === pollution[key])
  ) {
    return power
  }
  return { ...power, pollution }
}
