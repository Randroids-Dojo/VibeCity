---
title: "implement: REQ-070 substrate slice 2 of 4 - KV persistence + /api/city/[slug]/events route"
status: open
priority: 1
issue-type: task
created-at: "2026-05-05T23:06:56.225708-05:00"
---

Server-side persistence for the sim event log. Extend src/lib/kv.ts with cityEvents(slug), citySnapshot(slug, eventCursor), citySnapshotIndex(slug). New src/app/api/city/[slug]/events/route.ts: POST appends event batch to the sorted set keyed by serverReceivedAt-authorBuilderId, GET returns tail since cursor, both validate cookie shape per REQ-009. Tests: tests/app/api.cityEvents.test.ts (POST appends, GET returns tail, ordering by serverReceivedAt with authorBuilderId tiebreak). Slice 2 of 4 in the REQ-070..074 substrate.
