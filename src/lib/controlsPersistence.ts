import { z } from 'zod'
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from './storage/localStorage'

/**
 * Controls persistence layer (REQ-043).
 *
 * Pure module: no DOM beyond the localStorage read / write at the
 * boundary. The future settings pane slices (REQ-040 camera tuning,
 * REQ-041 keyboard rebinding, REQ-042 touch mode) all read from and
 * write to this layer so the persisted shape is the contract every
 * future surface ships against.
 *
 * Storage key is `vibecity.controls`. The namespace is intentionally
 * separate from VibeRacer (which uses its own key) so a player who
 * tunes both projects keeps independent settings per project; a future
 * "import from VibeRacer" slice could opt-in copy the camera tuning
 * over without colliding on the storage key.
 *
 * The persisted payload is wrapped in a `{ version, controls }`
 * envelope so a future migration (e.g. a renamed field, a removed
 * binding) can detect a stale payload and reset to defaults rather
 * than silently feed a malformed shape into the runtime. The current
 * version is `1`; bumping it is the intended migration trigger.
 *
 * Defaults are sourced from the modules that own them:
 *   - Camera defaults from `cameraRig.ts` (CAMERA_RIG_HEIGHT etc.) but
 *     duplicated here as static numbers so this module does not pull
 *     the camera rig (and through it `driveScene.ts` and `three`) into
 *     the editor surface or into a future home-page settings link.
 *   - Key bindings defaults from `driveControls.ts` `DEFAULT_KEY_BINDINGS`
 *     but duplicated as a static object literal for the same reason.
 *   - Touch mode default `'dual-stick'` matches VibeRacer's default.
 *
 * The duplication is intentional. Three similar lines is better than a
 * premature abstraction; here each duplicated value also serves as an
 * isolation point so this module stays loadable on the home page and
 * editor surfaces (which never instantiate three.js or the drive
 * scene) without forcing those surfaces to bundle the drive runtime.
 *
 * SSR safety: every helper checks `typeof window` before touching
 * `localStorage` because the editor / drive page modules can be
 * imported by Next.js on the server. The helpers return defaults on
 * the server and only consult the live storage on the client.
 */

/**
 * The localStorage key the controls envelope is written under
 * (REQ-043). Separate namespace from VibeRacer's storage key so the
 * two projects keep independent persisted settings.
 */
export const CONTROLS_STORAGE_KEY = 'vibecity.controls'

/**
 * Persisted envelope schema version. Bump when the persisted shape
 * changes in a way that cannot be safely migrated by zod's optional
 * defaults; a stored payload with a different version is discarded
 * and the user sees defaults again.
 */
export const CONTROLS_STORAGE_VERSION = 1

/**
 * Camera tuning shape (REQ-040). All values are world units (height,
 * distance, lookAhead) or unitless (followSpeed lerp factor, fov
 * degrees). The settings pane will render these as sliders in a
 * future slice; the persistence layer accepts any finite number in
 * the documented bounds so a future rebalance does not have to bump
 * the storage version.
 */
export const CameraTuningSchema = z.object({
  height: z.number().finite().positive(),
  distance: z.number().finite().positive(),
  lookAhead: z.number().finite(),
  followSpeed: z.number().finite().min(0).max(1),
  fov: z.number().finite().positive().max(179),
})

export type CameraTuning = z.infer<typeof CameraTuningSchema>

/**
 * Default camera tuning (REQ-040). Numeric values mirror the constants
 * in `src/app/[slug]/cameraRig.ts` so a freshly-installed user sees
 * the same chase-far preset the v1 default ships with. CELL_SIZE is 4
 * world units (see `driveScene.ts`); height = 4 * 1.6 = 6.4, distance
 * = 4 * 3.5 = 14, lookAhead = 4 * 1.5 = 6. followSpeed mirrors
 * `CAMERA_RIG_POSITION_LERP = 0.12`. fov is the v1 perspective camera
 * field of view (60 degrees).
 */
export const DEFAULT_CAMERA_TUNING: CameraTuning = {
  height: 6.4,
  distance: 14,
  lookAhead: 6,
  followSpeed: 0.12,
  fov: 60,
}

/**
 * Drive action vocabulary (REQ-041). Mirrors `DriveAction` from
 * `driveControls.ts` so a future rebind UI emits the same action
 * names the integrator consumes. Duplicated rather than imported so
 * this module stays free of the drive runtime (see file docblock).
 */
export const DriveActionSchema = z.enum([
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
])

export type DriveActionName = z.infer<typeof DriveActionSchema>

/**
 * Key bindings shape (REQ-041). A many-to-one map from
 * `KeyboardEvent.code` to drive action names. The schema accepts any
 * non-empty string code (matching `KeyboardEvent.code` shape) so a
 * future rebind can persist a non-default code (e.g. `'KeyJ'`) without
 * having to bump the storage version. Empty bindings (a key bound to
 * no action) collapse via `safeParse` since a record with only the
 * default keys does not require user-set ones.
 */
export const KeyBindingsSchema = z.record(z.string().min(1), DriveActionSchema)

export type KeyBindings = z.infer<typeof KeyBindingsSchema>

/**
 * Default key bindings (REQ-041). Mirrors `DEFAULT_KEY_BINDINGS` in
 * `driveControls.ts`. WASD plus arrow keys cover both common keyboard
 * layouts; a rebind UI can either remove a default or add a new code
 * mapping to the same action.
 */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'steerLeft',
  ArrowLeft: 'steerLeft',
  KeyD: 'steerRight',
  ArrowRight: 'steerRight',
}

/**
 * Touch mode shape (REQ-042). VibeRacer's `useTouchControls` hook
 * supports two layouts: dual-stick (left thumb steers, right thumb
 * throttles / brakes) and single-stick (one virtual joystick mapped to
 * steer plus auto-throttle). VibeCity v1 ports both options under the
 * settings pane; the default is `'dual-stick'` matching VibeRacer.
 */
export const TouchModeSchema = z.enum(['dual-stick', 'single-stick'])

export type TouchMode = z.infer<typeof TouchModeSchema>

/**
 * Default touch mode (REQ-042). `'dual-stick'` is the more capable
 * default: a player can throttle and steer independently. The single-
 * stick alternative is for narrow viewports where two thumbs do not
 * fit comfortably.
 */
export const DEFAULT_TOUCH_MODE: TouchMode = 'dual-stick'

/**
 * The persisted controls payload (REQ-043). All sub-fields are
 * optional in the schema so a partial save (e.g. only the touch mode
 * was changed) does not have to write the entire envelope; the read
 * helper merges any missing fields with the defaults so the runtime
 * always sees a fully-populated shape.
 */
export const ControlsPayloadSchema = z.object({
  camera: CameraTuningSchema.optional(),
  keyBindings: KeyBindingsSchema.optional(),
  touchMode: TouchModeSchema.optional(),
})

export type ControlsPayload = z.infer<typeof ControlsPayloadSchema>

/**
 * The fully-resolved controls shape the runtime consumes. Every field
 * is required (the loader fills any missing values with defaults). A
 * caller that wants to persist a single change passes a partial via
 * `saveControls` and the next read reflects the change merged on top
 * of the rest of the saved or default values.
 */
export interface Controls {
  camera: CameraTuning
  keyBindings: KeyBindings
  touchMode: TouchMode
}

/**
 * The persisted envelope. The version field guards against schema
 * drift: a stored envelope with a different version is discarded by
 * the loader rather than fed into the schema validator (which might
 * accept it under a coincidence and return a stale shape).
 */
export const ControlsEnvelopeSchema = z.object({
  version: z.literal(CONTROLS_STORAGE_VERSION),
  controls: ControlsPayloadSchema,
})

export type ControlsEnvelope = z.infer<typeof ControlsEnvelopeSchema>

/**
 * Build the fully-resolved controls shape by merging a partial payload
 * over the defaults. Pure: callers pass an explicit payload so this
 * helper does not consult localStorage and is safe to call from any
 * surface (server-rendered home page, editor, drive scene).
 */
export function resolveControls(
  payload: ControlsPayload | null | undefined,
): Controls {
  return {
    camera: payload?.camera ?? DEFAULT_CAMERA_TUNING,
    keyBindings: payload?.keyBindings ?? DEFAULT_KEY_BINDINGS,
    touchMode: payload?.touchMode ?? DEFAULT_TOUCH_MODE,
  }
}

/**
 * Build the default controls shape. Equivalent to
 * `resolveControls(null)` but spelled out as a named helper so call
 * sites that want "controls before localStorage has been read" (e.g.
 * an SSR render before the client mount) stay self-documenting.
 */
export function defaultControls(): Controls {
  return resolveControls(null)
}

/**
 * Read the persisted controls payload from localStorage and merge it
 * over the defaults. Returns the defaults on the server (no `window`)
 * and on a client that has never written a value.
 *
 * Storage failure modes that fall through to defaults:
 *   - localStorage throws (private browsing mode, quota exceeded on
 *     read, blocked by the storage permissions policy).
 *   - The stored value is not a JSON object.
 *   - The envelope version does not match `CONTROLS_STORAGE_VERSION`.
 *   - The envelope fails schema validation (e.g. a future migration
 *     bump invalidates an old shape).
 *
 * Each fallback returns the defaults; the caller does not have to
 * distinguish between "never written" and "stored but invalid". A
 * malformed payload is left in place rather than auto-pruned so a
 * future migration helper could attempt a salvage; v1 just ignores
 * it.
 */
export function loadControls(): Controls {
  const raw = safeLocalStorageGet(CONTROLS_STORAGE_KEY)
  if (raw === null) return defaultControls()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultControls()
  }
  const envelope = ControlsEnvelopeSchema.safeParse(parsed)
  if (!envelope.success) return defaultControls()
  return resolveControls(envelope.data.controls)
}

/**
 * Write a partial controls update to localStorage. The patch is
 * merged over any previously-saved payload (read directly off
 * localStorage so a concurrent tab's write is preserved when this
 * tab patches an unrelated field) before being written back as a
 * fresh envelope. Returns `true` on a successful write, `false` when
 * the write was skipped (no `window`) or threw (quota / disabled
 * storage); callers can choose to retry or surface a UI hint.
 *
 * Empty patches (no field present) are written as a no-op to avoid a
 * version bump touching every saved field; callers that want to reset
 * to defaults call `clearControls` instead.
 */
export function saveControls(patch: ControlsPayload): boolean {
  const validated = ControlsPayloadSchema.safeParse(patch)
  if (!validated.success) return false

  const previous = readPersistedPayload()
  const next: ControlsPayload = {
    ...previous,
    ...validated.data,
  }
  const envelope: ControlsEnvelope = {
    version: CONTROLS_STORAGE_VERSION,
    controls: next,
  }
  return safeLocalStorageSet(CONTROLS_STORAGE_KEY, JSON.stringify(envelope))
}

/**
 * Remove the persisted controls envelope from localStorage. Future
 * reads return defaults. Returns `true` on a successful clear, `false`
 * on the server or when the storage call throws.
 */
export function clearControls(): boolean {
  return safeLocalStorageRemove(CONTROLS_STORAGE_KEY)
}

/**
 * Read the raw persisted payload (without merging defaults). Used
 * internally by `saveControls` so a partial patch preserves any
 * fields written by a concurrent tab. Returns an empty payload when
 * nothing is stored or the stored value is invalid; callers should
 * not need this for runtime reads (use `loadControls` instead).
 */
function readPersistedPayload(): ControlsPayload {
  const raw = safeLocalStorageGet(CONTROLS_STORAGE_KEY)
  if (raw === null) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  const envelope = ControlsEnvelopeSchema.safeParse(parsed)
  if (!envelope.success) return {}
  return envelope.data.controls
}
