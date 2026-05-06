---
title: "implement: REQ-081 per-tick zone growth reducer"
status: closed
priority: 2
issue-type: task
created-at: "\"2026-05-06T00:18:46.482985-05:00\""
closed-at: "2026-05-06T00:20:48.632271-05:00"
close-reason: REQ-081 slice 1/2. Unconditional per-tick zone growth (every 20 ticks density steps up to 3). 9 new tests. PR pending.
---

Extend applyTick so on every Nth tick (GROWTH_INTERVAL_TICKS = 20, ~5s at 4Hz default) every zoned cell with density < 3 advances by 1. Pure addition; no UI changes. Replay-safe (deterministic from event log alone). Visible payoff: paint a zone, watch its opacity climb from 0.35 to 1.0 over ~15s.
