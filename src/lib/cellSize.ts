/**
 * World-space size of one grid cell in three.js units. City-scoped
 * because the value is a property of VibeCity's chosen unit system; a
 * future game-port branch picks its own.
 *
 * 4 units matches VibeRacer's `CELL_SIZE` so a future port of physics
 * (REQ-031) and wheel contact (REQ-032) inherits the same world-space
 * unit, and a saved city is reusable across both projects.
 *
 * Editor pixel sizing (`CELL_PIXELS = 32`) is decoupled from this so
 * the editor can size cells for screen comfort without coupling to
 * physics units.
 *
 * Lifted from `src/app/[slug]/driveScene.ts` so the trackPath
 * geometry layer (and future game-agnostic consumers) can read it
 * without importing through the app tree.
 */
export const CELL_SIZE = 4
