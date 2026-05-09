---
title: Adopt @randroid/game-kit editor-history for the city editor
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T22:37:52.087473-05:00"
---

VibeCity has a city editor under src/editor/. game-kit/src/editor-history.ts is a generic EditorHistory<T> undo/redo stack that handles reference-equal no-ops, redo-branch clearing, and a 100-entry past cap. If VibeCity's editor does not yet have undo/redo (or has its own implementation), evaluate adopting the kit version. Add ../game-kit as a file: dep, wrap the city state in EditorHistory<CityState>, route mutations through pushHistory.
