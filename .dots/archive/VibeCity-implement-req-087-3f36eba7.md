---
title: "implement: REQ-087 power slice 3 of N - connectivity solver + visible power status on zones"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T11:11:37.124014-05:00\""
closed-at: "2026-05-06T11:15:28.486889-05:00"
close-reason: REQ-087 connectivity solver + visible power status on zones. 22 new solver tests + 1 e2e. PR pending.
---

Pure solver in src/lib/sim/powerSolver.ts: BFS connected components of plants+lines, capacity sum per component, per-zone-cell powered/brownout/unpowered classification (4-adjacent to a transmission cell). SnapGridView reads the solver result and tints zone overlays accordingly. e2e test verifies place plant+line+zone gives a powered status.
