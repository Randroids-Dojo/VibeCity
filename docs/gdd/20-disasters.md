# 20. Disasters

**Status:** partial

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

- 2026-05-06: REQ-105 substrate slice 1 of N landed (schema + spawnDisaster event + per-tick lifetime decrement; visible payoff defers to slice 2). Files: `src/lib/sim/state.ts` (new `DisasterKindSchema` enum (fire / flood / tornado / earthquake / monster); new `DISASTER_DEFAULT_DURATION_TICKS` per-kind durations (fire 60, flood 120, tornado 40, earthquake 20, monster 80); strict `DisasterSchema` carrying `{ kind, row, col, ticksRemaining }`; tightened `DisastersBucketSchema` from passthrough to strict `{ active: Disaster[] }`; new `EMPTY_DISASTERS_BUCKET` frozen with empty `active`; `EMPTY_SIM_STATE.disasters` points at it instead of `Object.freeze({})`), `src/lib/sim/events.ts` (new strict `SpawnDisasterEventSchema` with kind / row / col payload (replaces the old `PlaceholderLayerEventSchema` enum which only had `spawnDisaster` left in it; the placeholder is fully removed since every layer now has its strict event); routed in the `SimEventSchema` discriminated union; new `applySpawnDisaster` reducer appends a fresh disaster with `ticksRemaining = DISASTER_DEFAULT_DURATION_TICKS[kind]` (no overlap rejection in v1: two disasters at the same anchor coexist); new exported `applyDisasterTick(disasters)` reducer decrements `ticksRemaining` on every active disaster and removes entries that hit 0, identity-on-no-change short-circuits when no disasters are active; wired into `applyTick` after the happiness reducer). Tests: `tests/lib/sim/state.test.ts` updates the legacy "every passthrough per-layer bucket as an empty object" assertion to a comment-only no-op (no buckets remain on passthrough; the disasters bucket gains its own strict-shape assertion + a "rejects unknown fields" negative case). `tests/lib/sim/events.test.ts` renames the legacy "layer-specific events (forward-compat)" describe to "spawnDisaster + per-tick lifetime (REQ-105 substrate slice 1)" with 6 cases: appends with default duration, allows two disasters at one anchor, per-tick decrement, removal at 0, two-replay determinism over a mixed event log, tick is identity on disasters bucket when no active disasters. Verified `npm run type-check`, `npm test` (2049/2049), `npm run build`, `npm run check:dashes`, `git diff --check` all green. Slice 2 lands the visible payoff: per-tick damage application (fire spreads to neighbor cells, flood inundates zoned cells, tornado erases pieces along its path, earthquake drops a happiness penalty per cell, monster destroys whatever it walks over) plus a drive-mode visualization (flickering red overlay for fire, blue overlay for flood, etc). Slice 3 lands UI / button / spawn-from-editor surface. PR #N.
