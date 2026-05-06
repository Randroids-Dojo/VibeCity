---
title: "implement: editor day/night toggle button (REQ-088 follow-on)"
status: closed
priority: 2
issue-type: task
created-at: "\"2026-05-06T11:52:16.181948-05:00\""
closed-at: "2026-05-06T11:57:14.462459-05:00"
close-reason: Editor day/night mood toggle. Toggle in sim-speed toolbar; isCityContentEqual extended to include mood. 1 e2e + 3 unit tests. PR pending.
---

Add Day/Night toggle to the editor sim-speed toolbar. Flips city.mood.timeOfDay between 'day' and 'night' via setCityWithHistory; autosave PUTs the new mood. e2e: toggle, switch to drive, observe data-time-of-day='night'.
