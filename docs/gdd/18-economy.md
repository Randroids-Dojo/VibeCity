# 18. Economy

**Status:** not_started

The economy layer is the money pressure that keeps the player from infinite-zoning. Citizens and businesses pay taxes, infrastructure costs to build and to maintain, services cost per-tick. Bankruptcy ends the session (player must reset) but does not destroy the slug.

This file is the canonical spec for the economy layer (REQ-095 through REQ-099).

## What this section covers

- **REQ-095** Tax revenue. Each populated residential / commercial / industrial cell pays per-tick tax based on density and a per-zone-type tax-rate slider. Default rates: residential 7%, commercial 7%, industrial 5%.
- **REQ-096** Build cost. Placing infrastructure (streets, plants, lines, pipes, buildings) deducts a one-time cost from the treasury. Costs scale with multi-cell footprint.
- **REQ-097** Maintenance cost. Each placed infrastructure cell costs per-tick maintenance. A power plant with broken transmission still costs maintenance.
- **REQ-098** Treasury HUD. Top-of-screen readout: current treasury, monthly net income / loss, tax-rate sliders. Always visible in sim view; collapsed in drive view.
- **REQ-099** Bankruptcy. Treasury below zero for 30 in-game days ends the session: a banner offers "reset budget" (treasury restored, infrastructure unchanged) or "reset city" (slug returns to empty).

## Schema sketch

```ts
City.sim.economy = {
  treasury: number
  taxRates: { residential: number; commercial: number; industrial: number }
  monthlyIncome: number
  monthlyMaintenance: number
  bankruptcyDaysRemaining: number  // counts down from 30 when treasury < 0
}
```

## Out of scope for this section

- Loans, bonds, debt instruments (defer to v1.1).
- Per-building specific costs beyond zone-type defaults.
- Inflation, interest rates.

### Build log

(no entries yet)
