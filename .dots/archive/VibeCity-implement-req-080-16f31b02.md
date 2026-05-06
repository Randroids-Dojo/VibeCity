---
title: "implement: REQ-080 zoning slice 1 of N - schema + placeZone/eraseZone events + reducer"
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"2026-05-06T00:03:18.196443-05:00\\\"\""
closed-at: "2026-05-06T00:09:28.807464-05:00"
close-reason: REQ-080 zoning slice 1/N. Schema (ZoneKind, ZoneDensity, ZoneCell, ZonesBucket strict) + placeZone/eraseZone events + reducer cases. 39 new tests. PR pending.
---

First REQ-080 slice. No UI; just the substrate-layer extension. Tighten ZonesBucketSchema from passthrough to strict with the zone-state shape (Map of cellKey to {kind, density}). Define PlaceZoneEvent and EraseZoneEvent payload schemas (kind in residential/commercial/industrial, row, col). Implement applyPlaceZoneEvent and applyEraseZoneEvent reducers that mutate the zones bucket. Wire into the existing applySimEvent dispatch (replace the no-op fallthrough for these two event types). Tests cover the schema + reducer. Zone-painting UI, demand bars, per-tick growth calculations land in follow-on slices.
