# 19. Services

**Status:** not_started

Services are the buildings the player places to satisfy citizen needs that money alone does not. Each service has a coverage radius; cells outside the coverage degrade. Services include police, fire, hospitals, schools, garbage.

This file is the canonical spec for the services layer (REQ-100 through REQ-104).

## What this section covers

- **REQ-100** Service building placement. Five v1 service types: `police-station`, `fire-station`, `hospital`, `school`, `garbage-depot`. Each has a fixed coverage radius (in cell units) and a per-tick maintenance cost.
- **REQ-101** Coverage solver. Each tick, the engine computes coverage by service-type for every populated cell. A cell may be covered by multiple stations; coverage is binary per service-type (covered or not).
- **REQ-102** Citizen happiness from services. Each missing service-type docks happiness by N points. The aggregate happiness gates zone growth (REQ-081) and influences trip demand patterns.
- **REQ-103** Service-specific behaviors. Police lower crime accumulation per tick; fire reduce fire-disaster spawn rate (REQ-105); hospitals reduce sickness; schools raise property value over many ticks; garbage depots prevent garbage accumulation that lowers happiness.
- **REQ-104** Drive-mode visible signal. Service buildings are visibly distinct from the car. Police lights flash when crime is active; fire trucks dispatch from fire stations during fire events.

## Schema sketch

```ts
City.sim.services = {
  stations: Array<{ id: string; kind: ServiceKind; row: number; col: number; coverageCells: number }>
  cellCoverage: Record<string, Record<ServiceKind, boolean>>
  cellCrimeAccumulation: Record<string, number>
  cellGarbageAccumulation: Record<string, number>
}
```

## Out of scope for this section

- Service vehicle path-finding (police cars do not actually drive to the crime cell in v1; the lights flash in place).
- Service quality tiers (a basic clinic vs a hospital). v1 is binary: present or absent.
- Funding sliders per service. Maintenance cost is fixed per-tick.

### Build log

(no entries yet)
