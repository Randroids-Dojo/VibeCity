# 7. Editor

**Status:** partial

The editor is the build half of VibeCity's "build it, drive it, build more" loop. It lives at `/<slug>/edit` (REQ-007) and renders a snap-grid surface where authors place street pieces and buildings. The editor writes through `PUT /api/city/<slug>` (REQ-014, REQ-025) and round-trips with the drive view at `/<slug>` via the Drive CTA in its toolbar (REQ-026).

This file is the canonical spec for the editor requirements (REQ-016 through REQ-027). The first slice lands the snap-grid surface (REQ-016); piece palette, place / rotate / erase, undo / redo, pan / zoom, autosave, and footprint validation each ship as their own slices.

## Snap grid (REQ-016)

The grid is a fixed-size square of cells centered on `(0, 0)`. Each cell maps to one `(row, col)` coordinate in the city schema. v1 ships a `GRID_RADIUS = 8` window (a 17 by 17 visible cell grid) which is enough for a small starter city loop without forcing pan / zoom into this slice.

Coordinates follow VibeRacer's editor convention: row indices grow downward (south), column indices grow rightward (east). Negative rows / cols are legitimate cell coordinates so the grid extends in every direction around the origin.

The grid renders as SVG, sized to `GRID_PIXEL_SIZE = GRID_DIAMETER * CELL_PIXELS` (32 px per cell in v1). The origin cell `(0, 0)` is highlighted so authors have a visual anchor when zero pieces are placed.

The grid is presentational: it consumes a `City` and emits SVG with one `<rect>` per cell. Place / rotate / erase (REQ-020 onward) and pan / zoom (REQ-024) layer onto this surface in their own slices. The `occupiedPieceCells(city)` helper exists today as the constant-time occupancy lookup that REQ-027 (overlap prevention) will use.

The world-space `CELL_SIZE` (in three.js units) used by the future drive-mode scene lives separately. The editor sizes cells for screen comfort without coupling to physics units.

## Piece palette (REQ-017, REQ-018, REQ-019, REQ-058, REQ-060)

The palette exposes the piece taxonomy from `PieceTypeSchema`. Authors pick a piece, then click the grid to place it (REQ-020). Future slices wire the palette UI (`F-007` for arc45 and diagonal glyphs) and rotation (REQ-021) / erase (REQ-022) tools.

## Tools

- Place piece (REQ-020): click a cell to place the currently-selected piece type.
- Rotate (REQ-021): 90deg increments.
- Erase (REQ-022): remove the piece under the selected cell.
- Undo / redo (REQ-023): immutable history stack ported from VibeRacer's `editorHistory.ts`.
- Pan and zoom (REQ-024): camera controls over the grid.
- Autosave (REQ-025): every mutation writes through `PUT /api/city/<slug>` (REQ-014).
- Drive CTA (REQ-026): toolbar button that switches to drive mode at `/<slug>`.
- Overlap prevention (REQ-027): footprint validation rejects placements that would overlap an existing piece's footprint.

## Out of scope for v1

- Multi-select / box-select.
- Copy / paste of subgrids.
- Per-piece metadata (color, decorations).
- Per-author favorites palette.
- Procedural seed cities; v1 always starts with `EMPTY_CITY`.

### Build log

- 2026-05-03: REQ-016 landed. Files: `src/app/[slug]/edit/snapGrid.ts` (`GRID_RADIUS`, `GRID_DIAMETER`, `CELL_PIXELS`, `GRID_PIXEL_SIZE`, `cellKey`, `pieceFootprintCells`, `occupiedPieceCells`, `gridCells`, `cellToPixel`), `src/app/[slug]/edit/SnapGridView.tsx` (presentational SVG component that renders the grid plus an origin highlight and a filled cell per occupied footprint cell), `src/app/[slug]/edit/page.tsx` (renders `<SnapGrid city={EMPTY_CITY} />` between the heading and the Drive CTA), `tests/app/snapGrid.test.ts` (constants invariants, cellKey shape, gridCells enumeration / order, cellToPixel anchor cases, pieceFootprintCells single / explicit / multi-cell, occupiedPieceCells empty / aggregate / dedupe). The grid renders for the empty city (zero pieces) and is ready for REQ-017 / REQ-020 to layer the palette and click-to-place tools on top. PR #N.
