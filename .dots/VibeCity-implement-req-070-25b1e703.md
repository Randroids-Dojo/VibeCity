---
title: "implement: REQ-070 sim engine substrate (tick scheduler + SimState schema)"
status: open
priority: 1
issue-type: task
created-at: "2026-05-05T22:36:02.353723-05:00"
---

Foundation for every other sim layer. Ship: tick scheduler at 4Hz default, city.sim schema with per-layer buckets and zod .strict() guards, layer registration with fixed run order (power -> water -> zoning -> citizens -> economy -> services -> disasters), pure step(state, dt) layer contract, persistence via existing PUT route. Q-010 (client-side vs server-side authority) defaults to client-side per the section file. See docs/gdd/13-sim-engine.md.
