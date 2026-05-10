---
title: Adopt @randroids-dojo/vibekit editor-history for the city editor
status: closed
priority: 3
issue-type: task
created-at: "2026-05-08T23:28:53.309088-05:00"
closed-at: "2026-05-09T15:10:26.253557-05:00"
close-reason: "shipped in PR #203: src/lib/editor/history.ts re-exports from @randroids-dojo/vibekit; EditorClient.tsx already wraps City in EditorHistory<City> and routes mutations through pushHistory"
---

VibeCity has a city editor under src/editor/. ../VibeKit/src/editor-history.ts is a generic EditorHistory<T> undo/redo stack (ref-equal no-ops, redo-branch clearing, 100-entry past cap). If VibeCity's editor does not yet have undo/redo (or has its own), evaluate adopting the kit version. Add @randroids-dojo/vibekit as a file:../VibeKit dep, wrap the city state in EditorHistory<CityState>, route mutations through pushHistory.
