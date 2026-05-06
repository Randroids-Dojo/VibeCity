---
title: "implement: REQ-070 substrate slice 5 of 5 - React hook + DOM wiring + sim view integration"
status: open
priority: 1
issue-type: task
created-at: "2026-05-05T23:22:00.177706-05:00"
---

Wire the pure SimEngine helpers into a React hook (useSimEngine(slug)) that owns the setInterval tick loop, visibilitychange flush trigger, idle-flush watcher, and POST/GET coordination with /api/city/[slug]/events. Lands at the same time as the first sim view consumer so the hook ships with a real caller. Blocked by slice 4 (snapshot writer) only if the React hook needs the snapshot read path on cold load; can ship before slice 4 with snapshot=null fallback. Slice 5 of 5 in the REQ-070..074 substrate.
