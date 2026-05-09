---
title: Audit src/audio/ and src/share/ for game-kit contribution
status: open
priority: 4
issue-type: task
created-at: "2026-05-08T22:37:58.145899-05:00"
---

VibeCity has dedicated src/audio/ and src/share/ folders. Survey each for portable candidates: audio likely matches VibeRacer's audioEngine pattern (settings-coupled, defer until VibeRacer-decouple-audioengine-from lands); share helpers (URL signing, metadata formatting) may be portable as-is. Contribute back what qualifies under the game-kit contract (zero project imports, no framework, pure TS).
