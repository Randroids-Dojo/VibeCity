---
title: "implement: REQ-085 power slice 1 of N - schema + place/erase events + reducer"
status: closed
priority: 1
issue-type: task
created-at: "\"2026-05-06T10:50:48.352502-05:00\""
closed-at: "2026-05-06T10:54:49.015739-05:00"
close-reason: REQ-085 power slice 1/N. Schema (PowerPlantKind, PowerPlant, PowerBucket strict) + placePowerPlant/runPowerLine/eraseLine events + reducer cases. 31 new tests. PR pending.
---

Tighten PowerBucketSchema from passthrough to strict. Add PlacePowerPlantEvent (kind: coal | solar; row, col), RunPowerLineEvent (row, col), EraseLineEvent (row, col). Reducers store plants in a list, lines in a Record keyed by 'row,col'. Connectivity solver and per-tick power calc land in slice 2. UI tools land in slice 3. First slice ships pure types + reducer + tests; mirrors REQ-080 slice 1 structure.
