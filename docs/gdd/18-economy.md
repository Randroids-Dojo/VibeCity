# 18. Economy

**Status:** partial

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

- 2026-05-06: REQ-095 economy slice 1 of N landed (treasury + per-tick income/maintenance + HUD readout). Files: `src/lib/sim/state.ts` (tightened `EconomyBucketSchema` from passthrough to strict `{ treasury, lastTickIncome, lastTickMaintenance }`; new `INITIAL_TREASURY = 20000`, `LINE_MAINTENANCE_PER_TICK = 0.05`, `PLANT_MAINTENANCE_PER_TICK = 0.5` constants; `EMPTY_ECONOMY_BUCKET` frozen with treasury at INITIAL_TREASURY), `src/lib/sim/events.ts` (extended `applyTick` to call new exported pure helper `applyEconomyTick(economy, population, power, taxRates)`; income = `population.totalPopulation * taxRates.residential` per tick, maintenance = line count * 0.05 + plant count * 0.5; treasury accumulates the net delta; identity-on-no-change short-circuits when income, maintenance, and treasury all match the input bucket so a static city does not allocate per tick), `src/app/[slug]/edit/EditorClient.tsx` (added `editor-sim-treasury` readout span next to the population readout; renders `$N,NNN` formatted with `toLocaleString('en-US')`; turns red when treasury < 0). Tests: `tests/lib/sim/state.test.ts` adds 1 case for the strict `EMPTY_SIM_STATE.economy` shape (treasury 20000, income 0, maintenance 0). `tests/lib/sim/events.test.ts` adds 8 cases under "per-tick economy (REQ-095 slice 1)" covering: treasury starts at INITIAL_TREASURY, paused sim does not change treasury, no-infrastructure tick = no income / no maintenance, single line maintenance = 0.05/tick, single coal plant maintenance = 0.5/tick, residents generate income at residential rate (4 residents at 7% = 0.28/tick), two-replay determinism, setTaxRate flips income on next tick. `e2e/sim.spec.ts` adds 1 new case "treasury starts at 20000 and decreases as power infrastructure is placed" that pauses, asserts treasury=20000, places a coal plant (no tick fires while paused so treasury stays at 20000), unpauses to 4x, polls treasury via expect.poll until it drops below 20000 (proves the per-tick maintenance loop runs against the placed plant). Verified `npm run type-check`, `npm test` (1912/1912), `npm run build`, `npm run check:dashes`, `git diff --check` all green; `npx playwright test e2e/sim.spec.ts --project=chromium` 12/12 local. Slice 2 of REQ-095 lands the build-cost deduction on infrastructure placement and the bankruptcy countdown (treasury < 0 for N consecutive ticks shows a "Bankruptcy in N seconds" warning then offers reset budget / reset city). Commercial / industrial revenue depends on REQ-083 job slots; ships when those land. PR #N.
