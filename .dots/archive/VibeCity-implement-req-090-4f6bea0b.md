---
title: "implement: REQ-090 water slice 2 of N - editor Water tab + 4 tools"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T12:59:32.194604-05:00\""
closed-at: "2026-05-06T13:02:27.421183-05:00"
close-reason: REQ-090 water slice 2/N. Water tab + 4 tools in editor. 1 new e2e. PR pending.
---

Add 'water' to PaletteCategory. WATER_PALETTE with 4 entries (water-tower, pump-station, water pipe, sewage pipe). Cell click dispatches placeWaterSource / runWaterPipe / eraseWaterPipe via sim engine. SnapGridView renders sources + pipes.
