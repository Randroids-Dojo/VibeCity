---
title: "implement: REQ-070 substrate slice 4 of 4 - snapshotting (server-side trigger)"
status: closed
priority: 2
issue-type: task
created-at: "\"\\\"2026-05-05T23:07:01.987526-05:00\\\"\""
closed-at: "2026-05-05T23:28:34.900857-05:00"
close-reason: Slice 4/5 of REQ-070..074 substrate. Server-side snapshot writer with Q-013 1000-event threshold. 25 new tests. PR pending.
---

Snapshot policy per Q-013 default A: every 1000 events OR 30 minutes of sim time. Server-side Vercel Function triggered when the event count crosses the threshold reads the snapshot, replays the tail, writes the new snapshot, prunes archived events. Tests cover the trigger threshold and the prune-on-snapshot invariant. Slice 4 of 4 in the REQ-070..074 substrate. Blocked by slice 2 (event store) and slice 3 (engine to drive event volume).
