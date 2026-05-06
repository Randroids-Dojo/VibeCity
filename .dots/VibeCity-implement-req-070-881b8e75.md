---
title: "implement: REQ-070 substrate slice 3 of 4 - simEngine.ts client-side scheduler + flush trigger"
status: open
priority: 1
issue-type: task
created-at: "2026-05-05T23:06:59.183642-05:00"
---

New src/lib/sim/engine.ts: 4Hz tick scheduler (setInterval(..., 250)), event-batch buffer, flush trigger on visibilitychange='hidden' / 5s idle / explicit save. Tests: tests/lib/sim/engine.test.ts. Slice 3 of 4 in the REQ-070..074 substrate. Blocked by slice 2 for the POST endpoint to flush against.
