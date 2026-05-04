# Settings

**Status:** done

VibeCity ships a settings pane that lets a player tune the chase camera, rebind
keyboard controls, and pick a touch input mode. All settings persist to the
browser's localStorage so the same browser remembers the player's preferences
across visits.

## What it is

- A persisted controls payload under the localStorage key `vibecity.controls`.
- A versioned envelope shape (`{ version: 1, controls: {...} }`) so a future
  migration that breaks the schema can detect a stale payload and reset to
  defaults rather than silently feed a malformed shape into the runtime.
- Three sub-fields: `camera` (height / distance / lookAhead / followSpeed /
  fov), `keyBindings` (`KeyboardEvent.code` to drive action map), and
  `touchMode` (`'dual-stick'` or `'single-stick'`).
- Pure persistence helpers in `src/lib/controlsPersistence.ts`:
  `loadControls()`, `saveControls(patch)`, `clearControls()`,
  `resolveControls(payload)`, `defaultControls()`.

## What it does

- `loadControls()` returns the fully-resolved controls shape merging any
  persisted partial over the defaults. Server-side, on a missing key, on
  malformed JSON, on a wrong-version envelope, on a payload that fails schema
  validation: returns defaults.
- `saveControls(patch)` accepts a partial payload, merges it over any
  previously-saved fields, and writes the v1 envelope. Concurrent-tab safe:
  reads the stored payload directly off localStorage before merging so a
  cross-tab write to an unrelated field is preserved.
- `clearControls()` removes the persisted envelope so future reads return
  defaults.
- The defaults live in this module as static literals (camera: chase-far
  preset matching `cameraRig.ts` constants; key bindings: WASD plus arrow
  keys matching `driveControls.ts`; touch mode: `'dual-stick'`).

## What it does NOT do

- It does NOT render a settings UI in v1. The persistence layer is the
  substrate; REQ-040 (camera tuning sliders), REQ-041 (keyboard rebinding
  pane), and REQ-042 (touch mode picker) ship the UI surfaces in their own
  slices.
- It does NOT migrate stale payloads. A wrong-version envelope is discarded
  and the user sees defaults. A future migration helper could attempt a
  salvage; v1 prefers safe defaults over a half-restored shape.
- It does NOT sync settings across devices. Settings live in the browser's
  localStorage and do not roundtrip to KV.
- It is NOT shared with VibeRacer. The storage key uses the `vibecity.`
  namespace so a player tuning both projects keeps independent settings per
  project.

## Reuse from VibeRacer

VibeRacer persists its controls under its own localStorage key. VibeCity
duplicates the camera tuning constants, the drive action vocabulary, and the
touch mode union as static literals rather than importing the VibeRacer
modules so the persistence layer stays free of the drive runtime (which would
pull `three.js` into the home page if imported transitively). When a future
"import from VibeRacer" slice is in scope, the duplicated literals are the
join point a converter would target.

### Build log

- 2026-05-04: REQ-041 shipped. Added `src/app/[slug]/keyboardSettings.ts`
  with `DRIVE_ACTION_OPTIONS` (per-action `{ action, label, description }`
  records ordered throttle / brake / steerLeft / steerRight so a player
  reads forward / backward before left / right), `clampKeyBindings(input)`
  (runs `unknown` through `KeyBindingsSchema.safeParse` and falls back to
  `DEFAULT_KEY_BINDINGS` on a malformed payload), `bindingsByAction`
  (groups a `KeyBindings` map into per-action sorted code lists),
  `REBINDABLE_KEY_CODES` and `RESERVED_KEY_CODES` (the allowlist of codes
  the panel will accept and the reserved Esc / KeyM / KeyR set the panel
  refuses), `isRebindableKeyCode(code)`, `keyCodeDisplayLabel(code)`
  (renders `KeyW` as `W`, `ArrowUp` as `Up`, `Space` as `Space`),
  `setBinding` / `clearBinding` (atomic add / remove on a fresh map),
  and `keyBindingSignature` (deterministic sorted `code:action,...`
  string used by the scene root's `data-key-bindings` mirror). Added
  `src/app/[slug]/KeyboardSettingsPanel.tsx` rendering a controlled-
  component panel inside the pause menu (REQ-039) with one row per
  drive action, a Rebind capture button that listens for the next
  `KeyboardEvent` on `window` and commits if the code is in the
  rebindable allowlist (Escape cancels, reserved codes are silently
  ignored), a Cancel button while capturing, and a Clear button per
  row that removes every binding for that action. Wired
  `src/app/[slug]/DriveSceneClient.tsx` to load the persisted bindings
  on the same first-mount `useEffect` that hydrates the camera tuning
  and touch mode, hold them in React state plus a ref the integration
  loop reads each frame so a rebind made while paused takes effect on
  resume without re-attaching the integration effect, persist via
  `saveControls({ keyBindings })` on every change, route
  `inputFromPressedKeys(pressedKeys, keyBindingsRef.current)` through
  the live ref, gate the keydown / keyup listeners on the live ref's
  binding shape so a rebind to a non-default key starts working
  immediately, expose `data-key-bindings` on the scene root for tests,
  and render `<KeyboardSettingsPanel />` immediately after
  `<TouchSettingsPanel />` inside the pause menu so the three panels
  stack as a single settings drawer. The reserved key codes
  (Escape / KeyM / KeyR) cannot be bound via the capture so the
  pause toggle (REQ-039), engine mute toggle (REQ-068), and respawn
  key (REQ-067) cannot collide with a player rebind. 45 unit tests in
  `tests/app/keyboardSettings.test.ts` cover the action options
  invariants (one option per `DriveActionSchema` enum value, no
  extras, every option has a non-empty label and description, unique
  values, throttle / brake before steerLeft / steerRight, race-term
  vocabulary lockdown), `clampKeyBindings` (non-object collapse,
  unknown-action collapse, valid pass-through, idempotent, fresh
  object, defaults pass-through, empty map valid), `bindingsByAction`
  (default grouping, alphabetical sort, empty map, fresh object),
  `REBINDABLE_KEY_CODES` (contains every default-binding code, every
  reserved code rejected by `isRebindableKeyCode`, unique entries),
  `isRebindableKeyCode` (WASD accepted, arrows accepted, Esc / M / R
  rejected, unknown codes rejected, empty rejected),
  `keyCodeDisplayLabel` (Key prefix stripped, Digit prefix stripped,
  arrow compass labels, Space verbatim, fallback for unknown shapes,
  empty input), `setBinding` (fresh add, replace existing, no mutation,
  no-op for non-rebindable codes, no-op for unknown actions, preserves
  other bindings, schema-valid), `clearBinding` (removes binding, no
  mutation, no-op for absent code, preserves others), and
  `keyBindingSignature` (sorted comma-separated, order-independent,
  empty map, default-bindings literal). E2e drive specs assert the
  scene root carries the default
  `data-key-bindings='ArrowDown:brake,ArrowLeft:steerLeft,ArrowRight:steerRight,ArrowUp:throttle,KeyA:steerLeft,KeyD:steerRight,KeyS:brake,KeyW:throttle'`
  attribute and that the `drive-keyboard-settings` testid resolves to
  zero elements when the pause menu is closed (the panel only mounts
  inside the pause menu which itself only opens with a car mounted).
  Files: `src/app/[slug]/keyboardSettings.ts`,
  `src/app/[slug]/KeyboardSettingsPanel.tsx`,
  `src/app/[slug]/DriveSceneClient.tsx`, `e2e/drive.spec.ts`,
  `tests/app/keyboardSettings.test.ts`. PR #N.
- 2026-05-04: REQ-042 shipped. Added `src/app/[slug]/touchSettings.ts` with
  `TOUCH_MODE_OPTIONS` (per-mode `{ value, label, description }` records,
  dual-stick first as the default and the more capable layout, single-stick
  second), `clampTouchMode(input)` (runs `unknown` through
  `TouchModeSchema.safeParse` and falls back to `DEFAULT_TOUCH_MODE` on a
  non-string or unknown enum value), and re-exports for `DEFAULT_TOUCH_MODE`
  and `TouchMode`. Added `src/app/[slug]/TouchSettingsPanel.tsx` rendering a
  controlled-component `role='radiogroup'` with one `role='radio'` button per
  option (button-as-radio so the entire label / description box is tappable;
  `aria-checked` and `data-selected` mirror the live selection) plus a Reset
  button inside the pause menu (REQ-039). Wired
  `src/app/[slug]/DriveSceneClient.tsx` to load the persisted touch mode on
  the same first-mount `useEffect` that hydrates the camera tuning, hold it
  in React state, persist via `saveControls({ touchMode })` on every change,
  expose `data-touch-mode` on the scene root for tests, and render
  `<TouchSettingsPanel />` immediately after `<CameraSettingsPanel />` inside
  the pause menu so the two panels stack as a single settings drawer. The
  runtime touch input handler (REQ-035) stays deferred to its own slice; the
  picker only persists the choice and the runtime layer will read
  `loadControls().touchMode` once REQ-035 lands. 10 unit tests in
  `tests/app/touchSettings.test.ts` cover the option-list invariants (one
  option per `TouchModeSchema` enum value, no extras, every option has a
  non-empty label and description, unique values, default-first ordering,
  race-term vocabulary lockdown), `clampTouchMode` (non-string collapse,
  unknown-enum collapse, valid pass-through, idempotent), and the
  `DEFAULT_TOUCH_MODE` re-export shape. E2e drive specs assert
  `data-touch-mode='dual-stick'` rides on the scene root and the
  `drive-touch-settings` testid resolves to zero elements when the pause menu
  is closed (the panel only mounts inside the pause menu which itself only
  opens with a car mounted). Files: `src/app/[slug]/touchSettings.ts`,
  `src/app/[slug]/TouchSettingsPanel.tsx`,
  `src/app/[slug]/DriveSceneClient.tsx`, `e2e/drive.spec.ts`,
  `tests/app/touchSettings.test.ts`. PR #N.
- 2026-05-04: REQ-040 shipped. Added `src/app/[slug]/cameraSettings.ts`
  with `CAMERA_SLIDER_BOUNDS` (per-field min / max / step / label),
  `clampCameraTuning(input)` (snaps every field to its slider step;
  non-finite inputs collapse to the field's min), `snapToSliderStep`,
  `toCameraRigParams(tuning)` (bridges the persisted shape to the
  chase rig's `CameraRigParams` by filling fixed fields from
  `cameraRig.ts`), and `CAMERA_SETTINGS_FIXED_RIG_FIELDS`. Added
  `src/app/[slug]/CameraSettingsPanel.tsx` rendering five sliders
  (height, distance, lookAhead, followSpeed, fov) plus a Reset button
  inside the pause menu (REQ-039); the panel is a controlled
  component, the parent owns the `CameraTuning` state and persists via
  `saveControls`. Wired `src/app/[slug]/DriveSceneClient.tsx` to load
  the persisted tuning on mount, hold it in a ref the integration loop
  reads each frame so a slider drag while paused updates the rig
  params on resume, expose `data-camera-*` mirrors on the scene root
  for tests, and update the perspective camera's fov imperatively when
  the slider changes. Slider step for height / distance / lookAhead is
  0.2 world units so the v1 defaults (6.4 / 14 / 6) sit exactly on a
  step; followSpeed step is 0.01; fov step is 1 degree. 22 unit tests
  in `tests/app/cameraSettings.test.ts` cover the bounds invariants
  (every field has a bound, every default sits inside, race-term
  vocabulary lockdown), `snapToSliderStep` (clamp below / above,
  in-range snap, non-finite, sub-unit float-noise-free, integer-step),
  `clampCameraTuning` (default round-trip, below-min / above-max
  clamp, non-finite collapse, fresh object), and `toCameraRigParams`
  (tunable fields pass through, fixed fields from defaults, default
  bridge equivalence). E2e drive specs assert
  `data-camera-fov="60"` / `data-camera-height="6.4"` /
  `data-camera-distance="14"` / `data-camera-look-ahead="6"` /
  `data-camera-follow-speed="0.12"` and that the
  `drive-camera-settings` testid resolves to zero elements when the
  pause menu is closed. Files: `src/app/[slug]/cameraSettings.ts`,
  `src/app/[slug]/CameraSettingsPanel.tsx`,
  `src/app/[slug]/DriveSceneClient.tsx`, `e2e/drive.spec.ts`,
  `tests/app/cameraSettings.test.ts`. PR #N.
- 2026-05-03: REQ-043 shipped. Added `src/lib/controlsPersistence.ts` with
  `CONTROLS_STORAGE_KEY = 'vibecity.controls'`, `CONTROLS_STORAGE_VERSION = 1`,
  `CameraTuningSchema` / `KeyBindingsSchema` / `TouchModeSchema` /
  `ControlsPayloadSchema` / `ControlsEnvelopeSchema`, the default literals
  (`DEFAULT_CAMERA_TUNING`, `DEFAULT_KEY_BINDINGS`, `DEFAULT_TOUCH_MODE`), the
  `Controls` resolved shape, and the `loadControls` / `saveControls` /
  `clearControls` / `resolveControls` / `defaultControls` helpers. 57 unit
  tests in `tests/lib/controlsPersistence.test.ts` cover the storage key
  namespace, the version invariants, every schema accept / reject path, the
  default values, the merge semantics of `resolveControls`, the
  malformed-payload fallbacks of `loadControls` (server, empty storage,
  throwing storage, malformed JSON, non-object JSON, wrong-version envelope,
  malformed envelope, payload that fails inner schema validation), the
  round-trip and concurrent-tab merge behavior of `saveControls`, the
  `clearControls` behavior, and a namespace-separation invariant. Files:
  `src/lib/controlsPersistence.ts`, `tests/lib/controlsPersistence.test.ts`.
  PR #N.
