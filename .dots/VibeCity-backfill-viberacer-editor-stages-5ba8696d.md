---
title: "implement: backfill VibeRacer Stage 1 + Stage 2 advanced editor features (F-002 follow-on)"
status: open
priority: 3
issue-type: task
created-at: "2026-05-08T23:47:05-05:00"
---

## Description

Adopt the editor advances VibeRacer shipped after the original VibeCity port.
F-002 in `docs/FOLLOWUPS.md` is the watcher; this dot is the concrete adoption
slice for everything past PR #80 / #81 / #83 / #84 (mega sweep, hairpin, arc45,
diagonal) that VibeCity has only at the schema level today.

The runtime behind those four pieces is captured in F-003 / F-004 / F-005 /
F-006 (sampled geometry, wheel contact, pace notes, difficulty scoring) and a
sibling dot already exists for that work
(`VibeCity-implement-arc45-diagonal-b4b77a2f.md`). This dot is for everything
upstream of those: the editor capabilities VibeRacer added on top.

## Upstream PRs to backfill

Walked from `git log src/game/editor.ts` in `../VibeRacer`. Target order is
dependency order, not commit order.

1. **VR #98: flex-angle straight piece**. Per-piece angle override on the
   straight piece. Adds a `transform` field to the piece schema. v1 in
   VibeRacer.
2. **VR #101: Stage 1 continuous-angle**. `transform` field is promoted from
   v1 straight-only to a generic field with a v1-to-v2 converter. Defines the
   future schema migration path; ports cleanly because VibeCity's CitySchema
   is already strict on unknowns and would just need a v2 bump.
3. **VR #103: Stage 2 Workstream A**. Runtime migration to transform-driven
   ports. Connector resolution stops reading per-type rotation tables and
   starts reading the piece's transform. Required before the editor UI can
   apply transforms.
4. **VR #104: Stage 2 Workstream B foundation**. Feature flag plus transform
   mutations plumbing. Editor learns to write transforms (not just rotation).
5. **VR #105: Stage 2 Workstream B slices 2-3**. Rendering refactor and rotate
   handle. The editor gets a draggable rotate handle on selected pieces.
6. **VR #106: Stage 2 Workstream B slice 4**. Free-placement drag with snap.
   Pieces can be dragged to non-grid-aligned positions, snapping back to grid
   on release.
7. **VR #108 / #111: Stage 2 Workstream B slice 6 plus loop reconciliation
   pass**. After a transform edit, recomputes the connected loop so the rest
   of the track follows the moved piece.

Out-of-scope for this dot (keep deferred):
- VR Phase 3 junction: VibeCity already has 4-way intersections (REQ-019), so
  this is a separate adoption call when upstream ships.
- The four runtime followups (F-003 to F-006): tracked by the sibling dot.
- Free-form continuous-angle for *all* piece types past straight: revisit per
  slice; some pieces (mega sweep, hairpin) may not benefit from per-piece
  angle.

## Suggested slice plan

Each numbered upstream PR is roughly one VibeCity slice. Slices land in the
listed order because each adds a runtime contract the next depends on.

- **Slice 1**: Schema bump. Add optional `transform` field to PieceSchema in
  `src/lib/schemas.ts`, write the v1-to-v2 converter (city load path), add
  zod tests. Mirrors VR #101 Stage 1 minus the editor UI. Lowest risk.
- **Slice 2**: Runtime migration. Switch
  `src/app/[slug]/edit/connectorGlyphs.ts` and `editorPreview.ts` to read
  transform-derived rotation when the field is present, falling back to the
  current `rotation: 0|90|180|270` enum otherwise. Mirrors VR #103.
- **Slice 3**: Editor write path. Toolbar / keyboard shortcut to nudge a
  selected piece's transform. Mirrors VR #104.
- **Slice 4**: Rotate handle. Draggable handle on the selected piece in
  `EditorClient.tsx`. Mirrors VR #105.
- **Slice 5**: Free-placement drag with snap. Mirrors VR #106.
- **Slice 6**: Loop reconciliation. Mirrors VR #108 + #111.

## Affected files (per slice; rough)

- `src/lib/schemas.ts`: piece transform field + version bump
- `src/app/[slug]/edit/EditorClient.tsx`: rotate handle, drag-and-snap UI
- `src/app/[slug]/edit/editorState.ts`: selection-with-transform reducer
- `src/app/[slug]/edit/editorPreview.ts`: transform-aware preview math
- `src/app/[slug]/edit/connectorGlyphs.ts`: transform-aware connector resolution
- `src/app/[slug]/edit/snapGrid.ts`: snap-on-release for free-placement drag
- `src/lib/cityVersion.ts` (or wherever the hash lives): include the new field
- `tests/lib/schemas.test.ts`, `tests/app/edit/*`: matching coverage

## Verify

- [ ] All six slices ship as separate PRs per slice discipline
- [ ] F-002 watch list in `docs/FOLLOWUPS.md` gets a `Resolved: PR #N` line
      appended for each adopted upstream PR (append-only, never delete)
- [ ] GDD coverage rows updated where applicable
- [ ] Existing v1 cities load and render unchanged after schema bump (the
      v1-to-v2 converter is exercised by load tests)
- [ ] Saved cities round-trip transform values through KV without loss
- [ ] No regression in `tests/lib/schemas.test.ts` or
      `tests/app/edit/EditorClient.spec.ts`
