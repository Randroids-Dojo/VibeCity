---
title: "implement: REQ-085 power slice 2 of N - editor Power tab + plant/line tools"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T11:02:19.979472-05:00\""
closed-at: "2026-05-06T11:05:47.699418-05:00"
close-reason: REQ-085 power slice 2/N. Editor Power tab + plant/line tools + render. 2 new e2e tests. PR pending.
---

Add 'power' category to PaletteCategory. Power palette: Coal Plant, Solar Plant, Power Line. Cell click dispatches placePowerPlant or runPowerLine via the sim engine. SnapGridView renders plants and line cells distinctly. Erase tool removes plants/lines. Connectivity solver still deferred to slice 3 (the UI lets the player WIRE the grid; slice 3 makes the wiring matter).
