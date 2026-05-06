# 15. Zoning and Business

**Status:** not_started

Zoning is how the player tells the sim "this area is for housing" / "this area is for shops" / "this area is for factories". The sim then grows buildings into the zoned cells based on demand from the citizens and economy layers. Business is the commercial and industrial layer that consumes labor and produces tax revenue.

This file is the canonical spec for the zoning + business layer (REQ-080 through REQ-084).

## What this section covers

- **REQ-080** Zoning categories. Three zone types replace the existing four placeholder building types: `residential`, `commercial`, `industrial`. Each is paintable on the sim grid in any cell that does NOT contain a street piece. Density is implicit in v1 (every zone cell starts low-density and grows; no separate low/medium/high paint).
- **REQ-081** Zone-to-building growth. Each tick, a zoned cell with met demand from the population layer grows a building. The building primitive replaces the existing flat building cell render: `residential` grows `small-house` then `mid-house` then `apartment` (new); `commercial` grows `shop` then `mall` (new); `industrial` grows `factory` then `plant` (new). Growth is one density step per N ticks.
- **REQ-082** Demand readout. The sim-as-primary view (REQ-110 series) surfaces the current R / C / I demand bars (SimCity 2000 standard). Demand is a function of population, available power, available water, services, and economy.
- **REQ-083** Job slots. Commercial and industrial cells expose job slots proportional to their density. Population layer trip demand reads the nearest open job slot.
- **REQ-084** Schema and persistence. Zones live on the existing `city.buildings` array as a discriminated union of zoned vs flat-placeholder cells; the v1 placeholder building types stay supported during a migration period (a city saved before the sim layer landed should still load and render).

## Schema sketch

```ts
Zone = {
  kind: 'residential' | 'commercial' | 'industrial'
  density: 0 | 1 | 2 | 3       // 0 = empty zoned cell, 3 = max
  row: number
  col: number
  // grown building shape derives from kind + density at render time
}

City.buildings now includes Zone in addition to the v1 placeholder types.
```

## Out of scope for this section

- Mixed-use zoning (a single cell that is both residential and commercial). Not in SimCity 2000 either.
- Zone density paint (low / medium / high). v1 grows organically from low to high.
- Per-building decoration variants. The grown building visual is determined by kind + density only.

### Build log

(no entries yet)
