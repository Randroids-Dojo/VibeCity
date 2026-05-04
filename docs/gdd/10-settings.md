# Settings

**Status:** partial

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
