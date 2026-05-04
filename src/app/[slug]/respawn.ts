import type { Piece } from '@/lib/schemas'
import { cellToWorld, rotationToRadians, spawnAnchor } from './driveScene'
import { createVehicleState, type VehicleState } from './driveControls'

/**
 * Drive-mode respawn helper (REQ-067 respawn key).
 *
 * Pure module: no React, no DOM, no three.js. The drive scene client
 * owns the live vehicle state and the keyboard listener; this module
 * supplies the bound key code and the pure transition that resets the
 * vehicle pose to the spawn anchor with zero speed so the integration
 * loop picks up from a freshly-spawned car on the next tick.
 *
 * Why a key: a player who drives into a corner of the empty grid,
 * tips off the edge of the world, or wedges against a building has no
 * way back to the placed streets without reloading the page. Esc opens
 * the pause menu but does not relocate the car. R is the conventional
 * "stuck" / "reset" key in arcade driving games and is not bound to any
 * existing action in `DEFAULT_KEY_BINDINGS` from `driveControls.ts`
 * (the editor's R-for-rotate binding lives in a different page tree).
 *
 * The pause menu (REQ-039) freezes the integration loop so respawning
 * while paused has no visible effect until the menu closes; the drive
 * scene client gates the respawn listener on the same `isPaused` ref
 * the integration tick reads so a paused world cannot teleport the car
 * mid-pause.
 */

/**
 * The `KeyboardEvent.code` value that triggers a respawn. Matches the
 * arcade-driving convention; future settings (REQ-041) may rebind via a
 * settings pane but should preserve `KeyR` as the default.
 */
export const RESPAWN_KEY_CODE = 'KeyR'

/**
 * Compute the pose the vehicle should respawn to. Returns the world-
 * space `(x, z)`, the heading (radians around the world Y axis matching
 * the three.js convention used by `DriveSceneClient`), and a fresh
 * `VehicleState` with zero speed so the integrator does not pick up
 * residual velocity from the wreck.
 *
 * Heading is derived from the first placed piece's rotation so the car
 * faces the same direction it spawned in on page load (matches the
 * REQ-036 spawn-anchor contract); when the city has zero pieces the
 * helper falls back to heading 0 because the placeholder car never
 * mounts on an empty grid (see `DriveSceneClient.tsx`) and a defensive
 * default keeps the helper total.
 */
export function respawnVehicle(pieces: readonly Piece[]): VehicleState {
  const anchor = spawnAnchor(pieces)
  const { x, z } = cellToWorld(anchor.row, anchor.col)
  const heading = pieces.length > 0
    ? rotationToRadians(pieces[0].rotation)
    : 0
  return createVehicleState({ x, z, heading })
}
