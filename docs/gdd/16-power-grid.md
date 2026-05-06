# 16. Power Grid

**Status:** not_started

Power is the first gating utility for zone growth. A zoned cell without power growth-stalls; an existing populated cell without power browns out, citizens get unhappy, and the cell decays. Power is generated at plants, transmitted via lines, and consumed per-zone-cell.

This file is the canonical spec for the power layer (REQ-085 through REQ-089).

## What this section covers

- **REQ-085** Power plant placement. Two v1 plant types: `coal` (cheap, dirty, 100MW) and `solar` (expensive, clean, 30MW). Plants are 2x2 multi-cell footprint pieces. Placement is via a new `Power` toolbar tab in the editor, alongside Streets / Buildings.
- **REQ-086** Power lines. Power flows through dedicated power-line cells (single-cell, snap-grid, like streets). Lines have a `voltage` notion only insofar as line cells form a connected component; a connected zone cell receives power from any plant in that component. No transformer / substation chain in v1.
- **REQ-087** Connectivity solver. Each tick, the engine computes which zone cells are connected to which plants via lines, sums plant capacity per connected component, divides among demanding cells. A cell is "powered" if its component has remaining capacity; "browned out" otherwise.
- **REQ-088** Drive-mode visible signal. From the car, a powered residential cell at night shows lit windows (the existing lit-window dot, REQ-110 will land it on this signal). A browned-out cell shows dark windows. Power lines are visibly wired in the drive view.
- **REQ-089** Pollution from plants. `coal` plants emit a per-tick pollution value into adjacent cells. Pollution feeds into citizen happiness (REQ-079) and zone growth gates (REQ-081).

## Schema sketch

```ts
City.sim.power = {
  plants: Array<{ id: string; kind: 'coal' | 'solar'; row: number; col: number; capacityMW: number }>
  lines: Array<{ row: number; col: number }>      // single-cell line pieces
  cellPowerStatus: Record<string, 'powered' | 'brownout' | 'unpowered'>
  pollution: Record<string, number>               // per-cell pollution score
}
```

## Out of scope for this section

- Wind / nuclear / hydro plant types (defer to v1.1 once coal / solar feel right).
- Per-line voltage class, transformers, substations. v1 is "connected component sums capacity".
- Power outages from disasters (lives in disasters layer, REQ-105 series).

### Build log

(no entries yet)
