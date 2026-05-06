# 13. Sim Engine Substrate

**Status:** not_started

The sim engine is the tick-driven simulation kernel that owns the city's mutable state between user inputs. Every other sim layer (citizens, zoning, power, water, economy, services, disasters) reads from and writes to the substrate this section defines. Without it the layers cannot coordinate; with it they layer cleanly.

## What this section covers

This file is the canonical spec for the sim engine substrate (REQ-070 through REQ-074).

- **REQ-070** Tick scheduler. The sim advances at a fixed rate (default 4 Hz, sim time != wall time so a paused tab does not lose state). Each tick: collect all pending intents, run layer steps in declared order, emit changed-set, persist if the changed-set is non-empty.
- **REQ-071** Sim time and speed. Wall-clock decoupled. UI exposes `Pause / 1x / 2x / 4x` (SimCity standard), persisted as `city.sim.speed` and applied to the next tick. Pause is a first-class state, not "speed 0".
- **REQ-072** SimState schema. Adds `city.sim` carrying tick count, current speed, last-tick timestamp, and per-layer state buckets (`sim.population`, `sim.zones`, `sim.power`, etc.). Buckets are `.strict()` zod schemas so a layer cannot smuggle in fields the loader does not understand.
- **REQ-073** Persisted sim state. Each tick that mutates state writes a delta to KV; the full city payload remains the canonical artifact. The version hash extends to include `city.sim` because the sim state IS the city, not metadata.
- **REQ-074** Layer registration and run order. Layers register against the engine in a fixed order: power -> water -> zoning -> citizens -> economy -> services -> disasters. Each layer's `step(state, dt)` is pure (input state -> output state); the engine threads results through the chain.

## Out of scope for this section

- Per-layer logic. Each layer ships in its own section file (14 through 20).
- Drive-side rendering of sim state. That lives in section 11 (scene) and the sim-as-primary view (section 21).
- Multiplayer sim consistency. Multiplayer remains out of scope per `99-out-of-scope.md`.

## Open questions

- Q-010 (to file): client-side vs server-side sim authority. A client-side sim is simpler to ship and offline-friendly; a server-side sim survives tab close and lets future cron-based long-game scenarios work. Recommended default: client-side, with the server route accepting full-state PUTs only (no per-tick deltas server-side).
- Q-011 (to file): sim speed maximum. SimCity 3000 used 1x / 2x / 3x; SimCity 4 used Pause / Turtle / Llama / Cheetah. Recommended default: Pause / 1x / 2x / 4x to keep the UI tight and avoid the "the sim runs faster than I can think" failure mode.

### Build log

(no entries yet; substrate has not shipped)
