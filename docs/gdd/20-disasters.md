# 20. Disasters

**Status:** not_started

Disasters are reactive sim events that destroy infrastructure and damage citizen happiness. Players can ignore them in fair-weather mode; the loop is more interesting if they happen.

This file is the canonical spec for the disasters layer (REQ-105 through REQ-109).

## What this section covers

- **REQ-105** Disaster types. Five v1 disaster kinds: `fire`, `flood`, `tornado`, `earthquake`, `monster`. Each has a spawn-probability function and a damage profile.
- **REQ-106** Spawn triggers. Fire spawns proportional to industrial density and missing fire coverage. Flood is wall-clock seasonal (in-game spring). Tornado / earthquake / monster are pseudo-random with low base rate; a settings toggle disables all disaster spawning ("fair-weather mode").
- **REQ-107** Damage profile. Each disaster has a footprint (single-cell for fire spawn, multi-cell for tornado swath). Damaged cells lose population and infrastructure connectivity. Service stations within range respond (fire to fire, hospital to monster damage, etc.).
- **REQ-108** Recovery. Damaged cells decay-rebuild over N ticks if services are present. Without services, the cells stay rubble.
- **REQ-109** Drive-mode visible signal. Active disasters are visually unmistakable from the car. Fire shows flame particles; flood shows water level; tornado shows rotating debris column.

## Schema sketch

```ts
City.sim.disasters = {
  active: Array<{ id: string; kind: DisasterKind; cells: Array<{ row: number; col: number }>; spawnedAtTick: number }>
  fairWeatherMode: boolean
  cellDamage: Record<string, number>  // 0 to 1, decays back to 0 with services
}
```

## Out of scope for this section

- Player-triggered disasters (the SimCity Disasters menu). v1 is all autonomous-spawn; a debug menu can land later.
- Disaster save-state per-tick replay. The active list is the truth; partial damage is the mutation log.

### Build log

(no entries yet)
