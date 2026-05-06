# 17. Water and Sewage

**Status:** not_started

Water is the second gating utility for zone growth. Same shape as power: plants pump water, pipes transmit, cells consume. Sewage is the dual: cells produce waste, sewage pipes route to treatment, untreated waste tanks citizen happiness.

This file is the canonical spec for the water + sewage layer (REQ-090 through REQ-094).

## What this section covers

- **REQ-090** Water source placement. v1 source types: `water-tower` (small, 50 units) and `pump-station` (large, 200 units, requires placement near a water tile when terrain ships). Editor toolbar `Water` tab.
- **REQ-091** Water pipes. Single-cell pipe pieces, snap-grid, like power lines but visually distinct (blue tint).
- **REQ-092** Sewage layer. Each populated cell produces N waste per tick. Waste flows toward the nearest connected `sewage-treatment` plant via dedicated sewage-pipe cells. Untreated waste accumulates and tanks happiness.
- **REQ-093** Connectivity solver. Mirrors REQ-087 (power) shape: per-tick connected-component sum.
- **REQ-094** Drive-mode visible signal. Water towers are visible from the car (tall cylindrical primitives). Sewage plants are large and unmistakable. Underground pipes are NOT visible in drive mode (placement-only signal).

## Schema sketch

```ts
City.sim.water = {
  sources: Array<{ id: string; kind: 'water-tower' | 'pump-station'; row: number; col: number; capacityUnits: number }>
  pipes: Array<{ row: number; col: number; kind: 'water' | 'sewage' }>
  treatmentPlants: Array<{ id: string; row: number; col: number; capacityUnits: number }>
  cellWaterStatus: Record<string, 'served' | 'unserved'>
  cellWasteAccumulation: Record<string, number>
}
```

## Out of scope for this section

- Terrain water (rivers, lakes). v1 is flat ground; pump-stations work anywhere until terrain ships.
- Per-pipe diameter, flow rate physics. Treat as connected-component capacity sum.

### Build log

(no entries yet)
