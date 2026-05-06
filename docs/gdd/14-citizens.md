# 14. Citizens

**Status:** not_started

Citizens are the agents that move into zoned residential space, work in commercial / industrial space, and produce the visible street-level life the player sees from inside the car. Without citizens, the city is geometry; with them, it is a place.

This file is the canonical spec for the citizens layer (REQ-075 through REQ-079).

## What this section covers

- **REQ-075** Citizen population. Each residential zone cell has a capacity (small-house = 4, mid-house = 12 per existing building taxonomy). Population is an integer per cell, never per-citizen-instance for v1. The "citizens" the player sees are render proxies, not addressable agents.
- **REQ-076** Citizen pedestrians. Sidewalk-adjacent residential and commercial cells spawn ambient pedestrian sprites that walk between cells. Pedestrians are pure render; they have no goals, no schedule, no path-finding. Density mirrors population.
- **REQ-077** NPC vehicle traffic. The existing `ambient AI traffic` dot ships as the citizen-vehicle layer: cars spawn at residential zones, follow placed streets, despawn at commercial / industrial zones. Loop closes; rerun. One vehicle per "trip" demand event from the population layer.
- **REQ-078** Trip demand. Each tick, a residential cell with population > 0 generates trip demand toward the nearest commercial / industrial cell. The trip demand is a single integer counter on the cell; the vehicle layer reads it and drains it as cars complete trips.
- **REQ-079** Population growth and decline. Residential zones grow toward capacity at a rate gated by available services (REQ-100 series), employment (REQ-080 series), and power (REQ-085 series). With no constraints, full capacity in ~30 in-game days. With constraints, growth slows or population leaves.

## Schema sketch

```ts
City.sim.population = {
  // Keyed by "row,col". Only present for cells with a residential zone.
  cells: Record<string, { residents: number; tripDemand: number }>
  totalPopulation: number
  totalTripDemand: number
}
```

## Out of scope for this section

- Per-citizen names, identities, schedules, social networks (out: violates the proxy-not-agent stance for v1).
- Citizen happiness as a per-citizen state (citizens are integers, not records; happiness is a per-cell average).
- Voice acting, citizen dialog (no text bubbles, no audio in v1).

### Build log

(no entries yet)
