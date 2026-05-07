'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { BuilderId, City, Slug } from '@/lib/schemas'
import { useSimEngine } from '@/lib/sim/useSimEngine'
import { solvePowerStatus, type CellPowerStatus } from '@/lib/sim/powerSolver'
import {
  BUILDING_LIT_WINDOW_HEX_NIGHT,
  BUILDING_LIT_WINDOW_INTENSITY_NIGHT,
  STREETLAMP_HEX_NIGHT,
  STREETLAMP_INTENSITY_NIGHT,
  TIME_OF_DAY_PALETTE,
  cityDayNumber,
  dayRolloverFlashing,
  resolveTimeOfDay,
  zoneEmissiveHex,
  zoneEmissiveIntensity,
} from './timeOfDay'
import {
  AMBIENT_LIGHT_INTENSITY,
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CAMERA_HEIGHT,
  CAMERA_NEAR,
  CAR_BODY_COLOR,
  CAR_BODY_HEIGHT,
  CAR_CABIN_COLOR,
  CAR_CABIN_HEIGHT,
  CAR_CABIN_LENGTH,
  CAR_CABIN_OFFSET,
  CAR_CABIN_WIDTH,
  BRAKE_LIGHT_DEPTH,
  BRAKE_LIGHT_HEIGHT,
  BRAKE_LIGHT_WIDTH,
  CAR_LENGTH,
  CAR_WHEEL_COLOR,
  CAR_WHEEL_RADIUS,
  CAR_WHEEL_THICKNESS,
  CAR_WIDTH,
  brakeLightColor,
  brakeLightOffsets,
  suspensionBobOffset,
  CELL_SIZE,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  GROUND_COLOR,
  PIECE_GROUND_LIFT,
  SKY_COLOR,
  buildingColorFor,
  buildingFootprintWorldSize,
  buildingHeightFor,
  buildingRoofColorFor,
  buildingRoofFootprintFor,
  buildingRoofHeightFor,
  buildingRoofY,
  carBodyY,
  carCabinY,
  CAR_MODEL_SCALE,
  CAR_MODEL_URL,
  CAR_MODEL_YAW_OFFSET,
  carWheelOffsets,
  cellToWorld,
  cityWorldBounds,
  pieceColorFor,
  pieceFootprintWorldCells,
  rotationToRadians,
  spawnAnchor,
} from './driveScene'
import {
  ambientCarCountForPopulation,
  dirToHeadingY,
  spawnAmbientFleet,
  stepAmbientCar,
  streetCellWorldCenters,
  type AmbientCar,
} from './ambientTraffic'
import {
  pedestrianAnchors,
  pedestrianOffsetWithinCell,
} from './ambientPedestrians'
import { pieceFootprintCells } from './edit/snapGrid'
import {
  MAX_SPEED,
  applyDriveStep,
  createVehicleState,
  inputFromPressedKeys,
} from './driveControls'
import { createCameraRig, updateCameraRig } from './cameraRig'
import {
  CAMERA_SLIDER_BOUNDS,
  clampCameraTuning,
  toCameraRigParams,
} from './cameraSettings'
import { CameraSettingsPanel } from './CameraSettingsPanel'
import { clampTouchMode } from './touchSettings'
import { TouchSettingsPanel } from './TouchSettingsPanel'
import {
  JOYSTICK_RADIUS,
  beginJoystick,
  createJoystick,
  endJoystick,
  joystickForTouch,
  joysticksToInput,
  mergeDriveInputs,
  moveJoystick,
  type JoystickState,
} from './touchInput'
import { clampKeyBindings, keyBindingSignature } from './keyboardSettings'
import { KeyboardSettingsPanel } from './KeyboardSettingsPanel'
import {
  DEFAULT_CAMERA_TUNING,
  DEFAULT_KEY_BINDINGS,
  DEFAULT_TOUCH_MODE,
  loadControls,
  saveControls,
  type CameraTuning,
  type KeyBindings,
  type TouchMode,
} from '@/lib/controlsPersistence'
import {
  DEFAULT_PAUSE_STATE,
  PAUSE_KEY_CODE,
  closePauseMenu,
  isPaused,
  togglePauseState,
  type PauseState,
} from './pauseMenu'
import {
  applyBuildingPenalty,
  buildingCellSet,
  isOnBuildingCell,
} from './buildingCollision'
import {
  applyOffStreetPenalty,
  closestStreetPiece,
  wheelOnStreet,
  type ClosestStreetPiece,
} from './offStreetPenalty'
import { buildTrackPath, validateConnections } from '@/lib/trackPath'
import {
  HUD_BRAKE_COLOR,
  HUD_BRAKE_LABEL,
  HUD_CITY_VALIDITY_LABEL,
  HUD_COMPASS_LABEL,
  HUD_CONTROLS_HINT_LINES,
  HUD_SPEED_DIRECTION_LABEL,
  HUD_SPEED_LABEL,
  HUD_SPEED_UNIT,
  HUD_SURFACE_LABEL,
  cityValidity,
  formatSpeed,
  headingToCompass,
  speedDirection,
  speedFraction,
  surfaceState,
} from './driveHud'
import { RESPAWN_KEY_CODE, respawnVehicle } from './respawn'
import { ENGINE_MUTE_KEY_CODE, EngineAudioRig } from './engineAudio'
import {
  SHARE_COPY_RESET_DELAY_MS,
  buildShareUrl,
  shareCopyAriaLabel,
  shareCopyLabel,
  type CopyShareStatus,
} from './shareUrl'
import {
  MINIMAP_BACKGROUND_COLOR,
  MINIMAP_BORDER_COLOR,
  MINIMAP_BUILDING_COLOR,
  MINIMAP_CAR_COLOR,
  MINIMAP_CAR_SIZE_PX,
  MINIMAP_PIECE_COLOR,
  MINIMAP_SIZE_PX,
  headingToMinimapDegrees,
  minimapBoundsForCity,
  worldToMinimap,
} from './driveMinimap'
import { SceneTransitionCurtain } from './SceneTransitionCurtain'

/**
 * Drive scene scaffold (REQ-044, REQ-045, REQ-046, REQ-053) plus the
 * driveable runtime (REQ-031 keyboard physics, REQ-033 chase camera,
 * REQ-034 keyboard input, REQ-047 placeholder car).
 *
 * Mounts a raw three.js scene on a canvas the React component owns.
 * When the city has at least one piece, the placeholder car spawns
 * at the deterministic spawn anchor (REQ-036), the keyboard listeners
 * attach to `window`, the integration loop runs `applyDriveStep` per
 * frame, and the chase camera rig (REQ-033) eases behind the car.
 * Empty cities keep the static aerial / orbit camera so the
 * empty-state prompt reads against a neutral framing of the origin.
 *
 * Streets render as flat colored quads at their grid cell, rotated by
 * the persisted rotation around the world Y axis. Buildings render as
 * extruded boxes per `buildingHeightFor(type)` and `buildingColorFor`.
 * The placeholder visuals match the GDD spec (REQ-045 / REQ-046) so
 * the build / drive loop closes ahead of the rendered geometry slices
 * that swap colored quads for textured glyphs.
 *
 * The component cleans up the renderer, scene, and resize listener on
 * unmount so navigating back to the editor (or to another slug) does
 * not leak WebGL contexts. The handle-resize loop is debounced via
 * `requestAnimationFrame` to avoid thrashing the renderer when the
 * viewport reflows during the editor / drive transition.
 */
/**
 * Visible joystick ring overlay for the touch input runtime (REQ-035).
 *
 * Renders a fixed-position circle anchored at the joystick's origin
 * with a smaller filled dot at the thumb position, clamped to the
 * radius along the angle of travel so the dot never escapes the ring.
 * The component does NOT subscribe to the joystick ref; the parent
 * triggers a re-render via the React state mirror flag every time the
 * pointer event listeners commit a state change, and the per-frame
 * thumb position update is reflected on the next React tick. The ring
 * is purely decorative; the integration loop reads the joystick state
 * directly via `joysticksToInput` for its sub-frame accuracy.
 */
function TouchJoystickRing({
  state,
  testid,
}: {
  state: JoystickState
  testid: string
}) {
  if (!state.active) return null
  const dx = state.currentX - state.originX
  const dy = state.currentY - state.originY
  const len = Math.hypot(dx, dy)
  const clampedDx = len <= JOYSTICK_RADIUS ? dx : (dx / len) * JOYSTICK_RADIUS
  const clampedDy = len <= JOYSTICK_RADIUS ? dy : (dy / len) * JOYSTICK_RADIUS
  // The ring sits at the origin; the thumb dot sits at the (clamped)
  // offset. The whole layer is `pointerEvents: 'none'` so it never
  // steals the next pointer event from the underlying canvas.
  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed',
        left: state.originX - JOYSTICK_RADIUS,
        top: state.originY - JOYSTICK_RADIUS,
        width: JOYSTICK_RADIUS * 2,
        height: JOYSTICK_RADIUS * 2,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: '2px solid rgba(247, 244, 238, 0.6)',
          background: 'rgba(34, 34, 34, 0.25)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: JOYSTICK_RADIUS + clampedDx - JOYSTICK_RADIUS / 4,
          top: JOYSTICK_RADIUS + clampedDy - JOYSTICK_RADIUS / 4,
          width: JOYSTICK_RADIUS / 2,
          height: JOYSTICK_RADIUS / 2,
          borderRadius: '50%',
          background: 'rgba(247, 244, 238, 0.85)',
        }}
      />
    </div>
  )
}

export function DriveSceneClient({
  slug,
  city,
  builderId,
}: {
  slug: Slug
  city: City
  builderId: BuilderId
}) {
  // Sim engine for zones / power state (REQ-088 slice 1 of 2: drive
  // visible signal). Mounting the engine in the drive view runs its
  // own tick stream alongside any concurrent editor session; the
  // server orders concurrent events by serverReceivedAt so both
  // surfaces converge. Zone state is read from `simRuntime.state.zones`
  // and rendered as flat colored ground quads in the scene.
  const simEngine = useSimEngine(slug, builderId)
  const simState = simEngine.runtime.state
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // HUD refs (REQ-066). The integration loop writes the live speed
  // readout and the bar fill imperatively so the React tree does not
  // re-render every frame; only the static text content (label, unit,
  // controls hint) renders through the React tree below.
  const hudSpeedValueRef = useRef<HTMLSpanElement | null>(null)
  const hudSpeedBarFillRef = useRef<HTMLDivElement | null>(null)
  // HUD surface ref (REQ-030, REQ-054, REQ-066). Mirrors the live
  // `surfaceState` text into a span inside the speed HUD so a player
  // who slows on a building cell or off the road sees why. The integration
  // loop writes the text and a `data-hud-surface` attribute imperatively
  // each frame; the empty default keeps the HUD silent on a clean street.
  const hudSurfaceRef = useRef<HTMLSpanElement | null>(null)
  // HUD direction ref (REQ-066). Mirrors the live `speedDirection` text
  // into a span inside the speed HUD so a player who is rolling
  // backward sees a "Reverse" label instead of having to read the
  // `data-hud-direction` data attribute. The integration loop writes
  // the text imperatively each frame inside `updateHud`; the empty
  // default keeps the HUD silent on idle and forward driving where the
  // speed bar already conveys the live state.
  const hudDirectionRef = useRef<HTMLSpanElement | null>(null)
  // HUD compass ref (REQ-066). Mirrors the live `headingToCompass` label
  // into a span inside the speed HUD so a player driving across a long
  // city sees their cardinal heading at a glance instead of relying on
  // the chase camera's relative orientation. The integration loop writes
  // the text imperatively each frame inside `updateHud`; the value is
  // always non-empty (the compass is informational rather than a
  // conditional alert) so the span stays mounted on every render.
  const hudCompassRef = useRef<HTMLSpanElement | null>(null)
  // F-013 slice 1: brake-input visible HUD pill. The span is mounted
  // whenever the HUD is visible (gated on `hasVehicle && !showPauseMenu`
  // alongside the rest of the dashboard); the integration loop writes
  // the label text imperatively each frame so the pill reads as the
  // brake label when `input.brake` is true and as an empty string when
  // it is false. The empty-string default keeps the React tree from
  // re-rendering per frame (mirrors the speed / surface readouts).
  const hudBrakeRef = useRef<HTMLSpanElement | null>(null)
  // Minimap car marker ref (REQ-069). The integration loop writes the
  // live `transform` attribute on the SVG group each tick so the
  // marker tracks the car position and heading without forcing a
  // React re-render. The static silhouette (piece / building rects)
  // renders through the React tree once per city change.
  const minimapCarRef = useRef<SVGGElement | null>(null)
  const isEmpty = city.pieces.length === 0 && city.buildings.length === 0

  // Pause state (REQ-039). The integration loop reads the live value
  // from `pauseStateRef` each frame so a paused world freezes without
  // unmounting the scene; the React state is what drives the overlay
  // rendering and the data-paused attribute. The two are kept in sync
  // in a single effect so a setState always updates the ref before the
  // next animation frame runs.
  const [pauseState, setPauseState] = useState<PauseState>(DEFAULT_PAUSE_STATE)
  const pauseStateRef = useRef<PauseState>(DEFAULT_PAUSE_STATE)
  useEffect(() => {
    pauseStateRef.current = pauseState
  }, [pauseState])

  const handleResume = useCallback(() => {
    setPauseState((prev) => closePauseMenu(prev))
  }, [])

  // Engine audio mute (REQ-068). The rig itself is lazily created on
  // the first user gesture inside the integration effect; the React
  // state here only tracks the mute toggle so the button label stays in
  // sync with the rig's silence and the data attribute mirror is
  // observable. The ref mirror lets the keyboard handler read the live
  // value without a stale closure capture across re-renders.
  const [engineMuted, setEngineMuted] = useState<boolean>(false)
  const engineMutedRef = useRef<boolean>(false)
  useEffect(() => {
    engineMutedRef.current = engineMuted
  }, [engineMuted])
  // The live rig handle. Stays null until the first user gesture inside
  // the integration effect creates it; the toggle button reads the ref
  // to call `setMuted` without re-rendering.
  const engineRigRef = useRef<EngineAudioRig | null>(null)
  // F-013 slice 2: shared material for the two brake-light tail pads.
  // Both meshes use the same `MeshBasicMaterial` so a single per-frame
  // `color.set(...)` call flips both pads in lockstep.
  const brakeLightMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const handleToggleEngineMute = useCallback(() => {
    setEngineMuted((prev) => {
      const next = !prev
      const rig = engineRigRef.current
      if (rig) rig.setMuted(next)
      return next
    })
  }, [])

  // Share-URL copy button state (REQ-006, REQ-053). The button lives
  // next to the slug pill and copies the canonical drive URL so a
  // visitor can hand the link to a friend without leaving the drive
  // view (Pillar 2: "Your city, your URL"). The status drives the
  // visible button label via `shareCopyLabel`; the timer ref clears
  // a stale reset timer if the player clicks again before the prior
  // success / error label has timed out so we never schedule two
  // overlapping resets.
  const [shareCopyStatus, setShareCopyStatus] =
    useState<CopyShareStatus>('idle')
  const shareCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  useEffect(() => {
    return () => {
      if (shareCopyResetTimerRef.current !== null) {
        clearTimeout(shareCopyResetTimerRef.current)
        shareCopyResetTimerRef.current = null
      }
    }
  }, [])
  const handleCopyShareUrl = useCallback(async () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : null
    const url = buildShareUrl(slug, origin)
    let nextStatus: CopyShareStatus = 'error'
    try {
      const clipboard =
        typeof navigator !== 'undefined' ? navigator.clipboard : null
      if (clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(url)
        nextStatus = 'copied'
      }
    } catch {
      nextStatus = 'error'
    }
    setShareCopyStatus(nextStatus)
    if (shareCopyResetTimerRef.current !== null) {
      clearTimeout(shareCopyResetTimerRef.current)
    }
    shareCopyResetTimerRef.current = setTimeout(() => {
      shareCopyResetTimerRef.current = null
      setShareCopyStatus('idle')
    }, SHARE_COPY_RESET_DELAY_MS)
  }, [slug])

  // Camera tuning state (REQ-040). Loaded from localStorage on mount
  // (server-render seeds with the defaults; the client effect below
  // hydrates from `loadControls`) so a returning player sees the same
  // chase rig framing across visits. The integration loop reads the
  // live value via `cameraTuningRef` each frame so a slider drag while
  // paused (the panel renders inside the pause menu) updates the rig
  // immediately on resume without re-attaching the integration effect.
  const [cameraTuning, setCameraTuning] = useState<CameraTuning>(
    DEFAULT_CAMERA_TUNING,
  )
  const cameraTuningRef = useRef<CameraTuning>(DEFAULT_CAMERA_TUNING)
  useEffect(() => {
    cameraTuningRef.current = cameraTuning
  }, [cameraTuning])
  // The camera object the integration effect creates is published to
  // this ref so the panel can update the FOV imperatively without
  // tearing down and rebuilding the scene; the projection matrix is
  // refreshed in the panel's onChange branch below.
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  // Refs for the auto day-night cycle (mass-appeal slice 3). The
  // bootstrap effect populates them; a separate effect mutates
  // their properties in place on each cycle boundary so the
  // visual flip happens without rebuilding the entire scene
  // (which would teleport the player car back to spawn).
  const sceneRef = useRef<THREE.Scene | null>(null)
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null)
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null)
  const groundMaterialRef = useRef<THREE.MeshLambertMaterial | null>(null)
  // Touch mode state (REQ-042). Loaded from localStorage on the same
  // first-mount effect as the camera tuning so a returning player sees
  // the same touch layout choice across visits. The runtime touch
  // input handler (REQ-035) reads `touchModeRef.current` each pointer
  // event and each frame so a mode change committed in the pause menu
  // takes effect immediately on resume without re-attaching the
  // integration effect.
  const [touchMode, setTouchMode] = useState<TouchMode>(DEFAULT_TOUCH_MODE)
  const touchModeRef = useRef<TouchMode>(DEFAULT_TOUCH_MODE)
  useEffect(() => {
    touchModeRef.current = touchMode
  }, [touchMode])
  // Touch joystick state (REQ-035). The drive scene's pointer event
  // listeners drive `beginJoystick` / `moveJoystick` / `endJoystick`
  // on these refs; the integration loop reads them via
  // `joysticksToInput` each frame and merges with the keyboard input.
  // Two refs (steer / throttle) so a dual-stick player can hold both
  // sticks simultaneously; the single-stick mode just leaves the
  // throttle ref inactive.
  const steerStickRef = useRef<JoystickState>(createJoystick())
  const throttleStickRef = useRef<JoystickState>(createJoystick())
  // React state for the visible joystick rings. Bumped via setActive*
  // when a stick activates / deactivates / moves so the SVG overlay
  // re-renders; the underlying joystick state is the ref above.
  const [steerStickActive, setSteerStickActive] = useState<boolean>(false)
  const [throttleStickActive, setThrottleStickActive] = useState<boolean>(false)
  // Key bindings state (REQ-041). Loaded from localStorage on the same
  // first-mount effect as the camera tuning and touch mode so a
  // returning player sees the same control layout. The integration
  // loop reads `keyBindingsRef.current` each frame so a rebind made
  // while paused (the panel renders inside the pause menu) takes
  // effect immediately on resume without re-attaching the integration
  // effect; the keydown / keyup listeners attached inside the
  // integration effect also read the live ref so a rebound key starts
  // working as soon as the panel commits the change.
  const [keyBindings, setKeyBindings] = useState<KeyBindings>(
    DEFAULT_KEY_BINDINGS,
  )
  const keyBindingsRef = useRef<KeyBindings>(DEFAULT_KEY_BINDINGS)
  useEffect(() => {
    keyBindingsRef.current = keyBindings
  }, [keyBindings])
  useEffect(() => {
    // Hydrate from localStorage on first mount. The server-render
    // already used the defaults so a fresh visit sees the same framing
    // as a returning player whose payload happens to match the
    // defaults; a returning player whose payload differs sees the rig
    // re-frame on the next animation tick.
    const persisted = loadControls()
    setCameraTuning(clampCameraTuning(persisted.camera))
    setTouchMode(clampTouchMode(persisted.touchMode))
    setKeyBindings(clampKeyBindings(persisted.keyBindings))
  }, [])
  const handleCameraTuningChange = useCallback((next: CameraTuning) => {
    const clamped = clampCameraTuning(next)
    setCameraTuning(clamped)
    saveControls({ camera: clamped })
    const camera = perspectiveCameraRef.current
    if (camera && camera.fov !== clamped.fov) {
      camera.fov = clamped.fov
      camera.updateProjectionMatrix()
    }
  }, [])
  const handleCameraTuningReset = useCallback(() => {
    setCameraTuning(DEFAULT_CAMERA_TUNING)
    saveControls({ camera: DEFAULT_CAMERA_TUNING })
    const camera = perspectiveCameraRef.current
    if (camera && camera.fov !== DEFAULT_CAMERA_TUNING.fov) {
      camera.fov = DEFAULT_CAMERA_TUNING.fov
      camera.updateProjectionMatrix()
    }
  }, [])
  const handleTouchModeChange = useCallback((next: TouchMode) => {
    const clamped = clampTouchMode(next)
    setTouchMode(clamped)
    saveControls({ touchMode: clamped })
  }, [])
  const handleTouchModeReset = useCallback(() => {
    setTouchMode(DEFAULT_TOUCH_MODE)
    saveControls({ touchMode: DEFAULT_TOUCH_MODE })
  }, [])
  const handleKeyBindingsChange = useCallback((next: KeyBindings) => {
    const clamped = clampKeyBindings(next)
    setKeyBindings(clamped)
    saveControls({ keyBindings: clamped })
  }, [])
  const handleKeyBindingsReset = useCallback(() => {
    setKeyBindings(DEFAULT_KEY_BINDINGS)
    saveControls({ keyBindings: DEFAULT_KEY_BINDINGS })
  }, [])

  // Memoize the bounds so the effect re-fits the camera only when the
  // city actually changes shape, not on every parent rerender.
  const bounds = useMemo(
    () => cityWorldBounds(city.pieces, city.buildings),
    [city.pieces, city.buildings],
  )

  // The deterministic spawn anchor (REQ-036). The marker renders only
  // when at least one piece exists; on an empty grid the empty-state
  // prompt owns the visual focus and a marker on the origin would just
  // sit on the ground plane with nothing to spawn against.
  const spawn = useMemo(() => spawnAnchor(city.pieces), [city.pieces])

  // Building cell set for the cell-level binary collision penalty
  // (REQ-030, Q-005 default A). Memoized so the cell-key Set is built
  // once per city change instead of every animation frame.
  const buildingCells = useMemo(
    () => buildingCellSet(city.buildings),
    [city.buildings],
  )

  // Track path substrate (REQ-064) for the per-wheel on-street test
  // (REQ-032). The substrate emits one locator per footprint cell of
  // every placed piece, so a multi-cell piece (mega sweep, hairpin)
  // reports on-street status from any of its footprint cells. Memoized
  // so the connected-graph walk runs once per city change instead of
  // every animation frame.
  const trackPath = useMemo(
    () => buildTrackPath({ pieces: city.pieces }),
    [city.pieces],
  )

  // City validity readout (REQ-066, REQ-019, REQ-064). The substrate-level
  // `validateConnections` returns the list of every connector port that
  // does not have an opposing neighbor; the count is the input to the HUD
  // city-validity label so a player driving a city with open ends sees a
  // visible explanation when they run out of road. Memoized so the walk
  // runs once per city change instead of every render. The actual HUD
  // label is rendered conditionally in the JSX below; the data attributes
  // ride on the scene root in every case so a test can assert the
  // substrate signal without inspecting the visible HUD.
  const unmatchedPortCount = useMemo(
    () => validateConnections({ pieces: city.pieces }).length,
    [city.pieces],
  )
  const cityValidityState = cityValidity(unmatchedPortCount)

  // Wheel offsets in the car's local frame (REQ-032). Mirrors the four
  // wheel positions baked into the placed mesh by `carWheelOffsets()`;
  // the per-frame on-street test rotates these by the live heading and
  // checks each wheel's cell against the multi-locator path substrate.
  // Memoized once because the offsets are constants.
  const wheelLocalOffsets = useMemo(
    () => carWheelOffsets().map(({ x, z }) => ({ x, z })),
    [],
  )

  // Minimap bounds (REQ-069). Memoized so the projection only
  // recomputes when the city footprint changes; the per-frame loop
  // reuses the same bounds to project the live car position.
  const minimapBounds = useMemo(
    () => minimapBoundsForCity(city.pieces, city.buildings),
    [city.pieces, city.buildings],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Capture the joystick refs once at effect-entry so the cleanup
    // branch reads the same `JoystickState` instances the listeners
    // wrote to (REQ-035). The ref values are pure data objects, not
    // DOM nodes, so capturing the identity is safe across re-renders.
    const capturedSteerStick = steerStickRef.current
    const capturedThrottleStick = throttleStickRef.current
    // Cancellation flag for async work (GLTFLoader). Flipped to
    // `true` in the cleanup branch so a deferred load that resolves
    // after unmount becomes a no-op.
    let cancelled = false

    // Renderer + scene + camera bootstrap. The canvas is owned by
    // React so the renderer attaches to it directly instead of
    // appending its own DOM node.
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    renderer.setPixelRatio(
      Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2),
    )

    // Resolve time-of-day from the persisted city mood (REQ-088 slice
    // 2 of 2). Day mode renders with the existing sky / ground / sun
    // palette; night mode dims the sky + ground and lights powered
    // zones via emissive material so the player driving at night
    // sees the city's power state rendered as warm windows on
    // residential, cool office lights on commercial, and brownout
    // flicker on under-capacity cells.
    const timeOfDay = resolveTimeOfDay(city.mood, simState.tick)
    const todPalette = TIME_OF_DAY_PALETTE[timeOfDay]
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(
      timeOfDay === 'night' ? todPalette.skyHex : SKY_COLOR,
    )

    // Camera FOV reads the persisted tuning at mount time (REQ-040) so
    // a returning player whose tuning differs from the defaults sees
    // the right framing on the first rendered frame; subsequent slider
    // changes update `camera.fov` and call `updateProjectionMatrix`
    // without tearing down the scene.
    const camera = new THREE.PerspectiveCamera(
      cameraTuningRef.current.fov,
      1,
      CAMERA_NEAR,
      CAMERA_FAR,
    )
    perspectiveCameraRef.current = camera

    // Lighting (REQ-044): ambient keeps unlit faces from going pure
    // black; the directional key light reads as noon from the south
    // east so extruded buildings cast a believable shadowless lift.
    // Day-vs-night lighting: night mode tones down both ambient and
    // directional so the powered-zone emissive contributions read as
    // the brightest things on the ground.
    const ambient = new THREE.AmbientLight(
      0xffffff,
      timeOfDay === 'night'
        ? todPalette.ambientIntensity
        : AMBIENT_LIGHT_INTENSITY,
    )
    ambientLightRef.current = ambient
    scene.add(ambient)
    const directional = new THREE.DirectionalLight(
      0xffffff,
      timeOfDay === 'night'
        ? todPalette.sunIntensity
        : DIRECTIONAL_LIGHT_INTENSITY,
    )
    directionalLightRef.current = directional
    directional.position.set(...DIRECTIONAL_LIGHT_POSITION)
    scene.add(directional)

    // Ground plane (REQ-044). Sized large enough to read past the
    // visible city without being so big that the depth buffer suffers.
    const groundSize = CELL_SIZE * 64
    const groundMaterial = new THREE.MeshLambertMaterial({
      color: timeOfDay === 'night' ? todPalette.groundHex : GROUND_COLOR,
    })
    groundMaterialRef.current = groundMaterial
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      groundMaterial,
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    // Aim the camera at the bounds center so a small starter city
    // fits in frame on first load. When the city is empty the bounds
    // are null and the camera frames the origin so the empty-state
    // overlay reads against the same neutral background. When a car
    // is mounted the chase rig (REQ-033) takes over below and the
    // initial frame is set to the rig's spawn pose.
    const orbitTarget = new THREE.Vector3(
      bounds?.centerX ?? 0,
      0,
      bounds?.centerZ ?? 0,
    )
    camera.position.set(
      orbitTarget.x + CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      orbitTarget.z + CAMERA_DISTANCE,
    )
    camera.lookAt(orbitTarget)

    // Zones (REQ-088 slice 1 of 2 drive-visible signal). Flat colored
    // quads sized to the cell, positioned slightly above the ground
    // and slightly below the pieces so a road over a zoned cell still
    // reads as a road. Per-kind color palette mirrors the editor's
    // SnapGridView so the surface stays consistent across views;
    // density-based opacity reads ungrown vs max-density at a glance.
    // Power-aware tinting (lit windows when powered at night) lands
    // in slice 2 of REQ-088 and reads from the same powerSolver helper
    // that the editor already uses.
    const zoneColors: Record<'residential' | 'commercial' | 'industrial', number> = {
      residential: 0x5fae5f,
      commercial: 0x5f8aae,
      industrial: 0xae8a5f,
    }
    const zoneOpacity: Record<0 | 1 | 2 | 3, number> = {
      0: 0.35,
      1: 0.55,
      2: 0.78,
      3: 1.0,
    }
    const zonePowerStatus = solvePowerStatus(simState.zones, simState.power)
    const zoneGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
    zoneGeometry.rotateX(-Math.PI / 2)
    for (const [key, zone] of Object.entries(simState.zones.cells)) {
      const [rowStr, colStr] = key.split(',')
      const row = Number(rowStr)
      const col = Number(colStr)
      if (!Number.isFinite(row) || !Number.isFinite(col)) continue
      const { x, z } = cellToWorld(row, col)
      const status: CellPowerStatus = zonePowerStatus[key] ?? 'unpowered'
      const emissiveHex = zoneEmissiveHex(timeOfDay, zone.kind, status)
      const emissiveIntensity = zoneEmissiveIntensity(timeOfDay, status)
      const material = new THREE.MeshLambertMaterial({
        color: zoneColors[zone.kind],
        transparent: true,
        opacity: zoneOpacity[zone.density],
        emissive: new THREE.Color(emissiveHex),
        emissiveIntensity,
      })
      const mesh = new THREE.Mesh(zoneGeometry, material)
      // Sit just above the ground (PIECE_GROUND_LIFT / 2) so a piece
      // quad on the same cell renders on top.
      mesh.position.set(x, PIECE_GROUND_LIFT / 2, z)
      mesh.userData = {
        type: 'zone',
        row,
        col,
        kind: zone.kind,
        density: zone.density,
        powerStatus: status,
      }
      scene.add(mesh)
    }

    // Street pieces (REQ-045). Flat colored quads at the cell center,
    // lifted slightly above the ground to avoid z-fighting. Multi-cell
    // pieces (mega sweep, hairpin, future arc45 / diagonal once
    // REQ-059's palette entries land) drop one quad per footprint cell
    // via `pieceFootprintWorldCells` so the placed footprint matches
    // the off-street penalty's `streetCellSet` and a builder does not
    // see visual holes between the anchor cell and the rest of a
    // multi-cell piece. The persisted rotation is applied to each
    // sub-quad; the v1 placeholder color is uniform across cells so a
    // rotated quad reads identically to the unrotated quad and the
    // sampled-centerline visuals (F-003) that need per-cell rotation
    // will land in the same iteration when the runtime port arrives.
    const pieceGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
    pieceGeometry.rotateX(-Math.PI / 2)
    for (const piece of city.pieces) {
      const material = new THREE.MeshLambertMaterial({
        color: pieceColorFor(piece.type),
      })
      const headingY = rotationToRadians(piece.rotation)
      for (const cell of pieceFootprintWorldCells(piece)) {
        const mesh = new THREE.Mesh(pieceGeometry, material)
        mesh.position.set(cell.x, PIECE_GROUND_LIFT, cell.z)
        mesh.rotation.y = headingY
        scene.add(mesh)
      }
    }

    // Streetlamps at intersection cells (lit-window slice). v1 lights
    // every intersection piece with a small post + glowing bulb at
    // night so the player sees the grid corners as ambient cues
    // rather than a uniform dark plane. Day mode renders the post
    // but no glow so the silhouette stays consistent across modes.
    const lampPostGeometry = new THREE.CylinderGeometry(
      CELL_SIZE * 0.04,
      CELL_SIZE * 0.04,
      CELL_SIZE * 0.6,
      8,
    )
    const lampPostMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3f33 })
    const lampBulbGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.08, 10, 10)
    const lampBulbMaterial = new THREE.MeshLambertMaterial({
      color: timeOfDay === 'night' ? STREETLAMP_HEX_NIGHT : 0x444444,
      emissive: new THREE.Color(
        timeOfDay === 'night' ? STREETLAMP_HEX_NIGHT : 0x000000,
      ),
      emissiveIntensity: timeOfDay === 'night' ? STREETLAMP_INTENSITY_NIGHT : 0,
    })
    for (const piece of city.pieces) {
      if (piece.type !== 'intersection') continue
      const { x, z } = cellToWorld(piece.row, piece.col)
      // Offset toward one corner of the cell so the post does not sit
      // in the center of the road. Quarter-cell inward from the +X +Z
      // corner reads as "northeast curb" at default rotation.
      const offset = CELL_SIZE * 0.35
      const postMesh = new THREE.Mesh(lampPostGeometry, lampPostMaterial)
      postMesh.position.set(x + offset, CELL_SIZE * 0.3, z + offset)
      postMesh.userData = {
        type: 'streetlamp-post',
        row: piece.row,
        col: piece.col,
      }
      scene.add(postMesh)
      const bulbMesh = new THREE.Mesh(lampBulbGeometry, lampBulbMaterial)
      bulbMesh.position.set(x + offset, CELL_SIZE * 0.65, z + offset)
      bulbMesh.userData = {
        type: 'streetlamp-bulb',
        row: piece.row,
        col: piece.col,
        litAtNight: timeOfDay === 'night',
      }
      scene.add(bulbMesh)
    }

    // Buildings (REQ-046). Extruded boxes sized to the cell footprint
    // with per-type heights and colors so the four placeholder
    // primitives form a visible silhouette vocabulary from the orbit
    // view. A second roof-cap mesh stacks on top of each body so the
    // four building types read with distinct silhouettes (small / mid
    // house get a peaked cap, shop gets a flat parapet, factory gets a
    // smokestack-style thin tall cap). Boxes are anchored at the cell
    // center on the ground plane and rotated by the persisted rotation.
    const bodyFootprint = buildingFootprintWorldSize()
    for (const building of city.buildings) {
      const height = buildingHeightFor(building.type)
      const { x, z } = cellToWorld(building.row, building.col)
      const headingY = rotationToRadians(building.rotation)
      const bodyGeometry = new THREE.BoxGeometry(
        bodyFootprint,
        height,
        bodyFootprint,
      )
      const bodyMaterial = new THREE.MeshLambertMaterial({
        color: buildingColorFor(building.type),
        emissive: new THREE.Color(
          timeOfDay === 'night' ? BUILDING_LIT_WINDOW_HEX_NIGHT : 0x000000,
        ),
        emissiveIntensity:
          timeOfDay === 'night' ? BUILDING_LIT_WINDOW_INTENSITY_NIGHT : 0,
      })
      const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial)
      bodyMesh.position.set(x, height / 2, z)
      bodyMesh.rotation.y = headingY
      bodyMesh.userData = {
        type: 'building-body',
        buildingType: building.type,
        litAtNight: timeOfDay === 'night',
      }
      scene.add(bodyMesh)

      // Roof cap (REQ-046 visual polish). Sits on top of the body so
      // the four building types have a stronger silhouette vocabulary
      // from the orbit camera. Sized via the per-type inset factor so
      // houses get a slightly-inset roof, the shop gets a near-full
      // parapet, and the factory's roof reads as a smokestack.
      const roofFootprint = buildingRoofFootprintFor(building.type)
      const roofHeight = buildingRoofHeightFor(building.type)
      const roofGeometry = new THREE.BoxGeometry(
        roofFootprint,
        roofHeight,
        roofFootprint,
      )
      const roofMaterial = new THREE.MeshLambertMaterial({
        color: buildingRoofColorFor(building.type),
      })
      const roofMesh = new THREE.Mesh(roofGeometry, roofMaterial)
      roofMesh.position.set(x, buildingRoofY(building.type), z)
      roofMesh.rotation.y = headingY
      scene.add(roofMesh)
    }

    // Water towers + sewage treatment plants (REQ-094). Underground
    // pipes are placement-only signals so they are NOT visible in
    // drive mode; only the source / plant primitives render. Water
    // towers read as a tall cylindrical silhouette (a stout column
    // with a wider tank cap on top) so the player can see them from
    // a few blocks away. Pump stations read as a low boxy structure.
    // Sewage treatment plants read as a low rectangular building
    // larger than a single residence so the silhouette is unmistakable
    // at street level.
    for (const source of simState.water.sources) {
      const { x, z } = cellToWorld(source.row, source.col)
      if (source.kind === 'water-tower') {
        const columnGeometry = new THREE.CylinderGeometry(
          CELL_SIZE * 0.18,
          CELL_SIZE * 0.18,
          CELL_SIZE * 1.6,
          12,
        )
        const columnMaterial = new THREE.MeshLambertMaterial({ color: 0xa9b5c0 })
        const columnMesh = new THREE.Mesh(columnGeometry, columnMaterial)
        columnMesh.position.set(x, CELL_SIZE * 0.8, z)
        columnMesh.userData = {
          type: 'water-tower-column',
          row: source.row,
          col: source.col,
        }
        scene.add(columnMesh)
        const tankGeometry = new THREE.CylinderGeometry(
          CELL_SIZE * 0.4,
          CELL_SIZE * 0.4,
          CELL_SIZE * 0.5,
          16,
        )
        const tankMaterial = new THREE.MeshLambertMaterial({ color: 0x5a8aae })
        const tankMesh = new THREE.Mesh(tankGeometry, tankMaterial)
        tankMesh.position.set(x, CELL_SIZE * 1.85, z)
        tankMesh.userData = {
          type: 'water-tower-tank',
          row: source.row,
          col: source.col,
        }
        scene.add(tankMesh)
      } else {
        const stationGeometry = new THREE.BoxGeometry(
          CELL_SIZE * 0.7,
          CELL_SIZE * 0.5,
          CELL_SIZE * 0.7,
        )
        const stationMaterial = new THREE.MeshLambertMaterial({ color: 0x3a6a8a })
        const stationMesh = new THREE.Mesh(stationGeometry, stationMaterial)
        stationMesh.position.set(x, CELL_SIZE * 0.25, z)
        stationMesh.userData = {
          type: 'pump-station',
          row: source.row,
          col: source.col,
        }
        scene.add(stationMesh)
      }
    }
    for (const plant of simState.water.treatmentPlants) {
      const { x, z } = cellToWorld(plant.row, plant.col)
      const buildingGeometry = new THREE.BoxGeometry(
        CELL_SIZE * 0.85,
        CELL_SIZE * 0.4,
        CELL_SIZE * 0.85,
      )
      const buildingMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3522 })
      const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial)
      buildingMesh.position.set(x, CELL_SIZE * 0.2, z)
      buildingMesh.userData = {
        type: 'sewage-treatment-plant',
        row: plant.row,
        col: plant.col,
      }
      scene.add(buildingMesh)
    }

    // Active disasters (REQ-105 slice 9). Each active disaster
    // renders as a kind-distinct primitive mesh at its anchor cell
    // so the player can see disasters from inside their car. v1
    // ships static meshes; future polish: tornado spin animation,
    // flood water-level rise, fire flame flicker.
    for (const disaster of simState.disasters.active) {
      const { x, z } = cellToWorld(disaster.row, disaster.col)
      if (disaster.kind === 'fire') {
        const flameGeometry = new THREE.ConeGeometry(
          CELL_SIZE * 0.3,
          CELL_SIZE * 1.2,
          12,
        )
        const flameMaterial = new THREE.MeshLambertMaterial({
          color: 0xff5a20,
          emissive: new THREE.Color(0xff8030),
          emissiveIntensity: 1.4,
        })
        const flameMesh = new THREE.Mesh(flameGeometry, flameMaterial)
        flameMesh.position.set(x, CELL_SIZE * 0.6, z)
        flameMesh.userData = {
          type: 'disaster-fire',
          row: disaster.row,
          col: disaster.col,
        }
        scene.add(flameMesh)
      } else if (disaster.kind === 'flood') {
        const waterGeometry = new THREE.PlaneGeometry(
          CELL_SIZE * 0.95,
          CELL_SIZE * 0.95,
        )
        waterGeometry.rotateX(-Math.PI / 2)
        const waterMaterial = new THREE.MeshLambertMaterial({
          color: 0x3a78a8,
          transparent: true,
          opacity: 0.55,
          emissive: new THREE.Color(0x4a98c8),
          emissiveIntensity: 0.4,
        })
        const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial)
        waterMesh.position.set(x, CELL_SIZE * 0.04, z)
        waterMesh.userData = {
          type: 'disaster-flood',
          row: disaster.row,
          col: disaster.col,
        }
        scene.add(waterMesh)
      } else if (disaster.kind === 'tornado') {
        const funnelGeometry = new THREE.CylinderGeometry(
          CELL_SIZE * 0.45,
          CELL_SIZE * 0.12,
          CELL_SIZE * 2.2,
          16,
        )
        const funnelMaterial = new THREE.MeshLambertMaterial({
          color: 0x4a4540,
          transparent: true,
          opacity: 0.78,
        })
        const funnelMesh = new THREE.Mesh(funnelGeometry, funnelMaterial)
        funnelMesh.position.set(x, CELL_SIZE * 1.1, z)
        funnelMesh.userData = {
          type: 'disaster-tornado',
          row: disaster.row,
          col: disaster.col,
        }
        scene.add(funnelMesh)
      } else if (disaster.kind === 'earthquake') {
        const dustGeometry = new THREE.SphereGeometry(
          CELL_SIZE * 0.55,
          12,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        )
        const dustMaterial = new THREE.MeshLambertMaterial({
          color: 0x8a6a3a,
          transparent: true,
          opacity: 0.55,
        })
        const dustMesh = new THREE.Mesh(dustGeometry, dustMaterial)
        dustMesh.position.set(x, 0, z)
        dustMesh.userData = {
          type: 'disaster-earthquake',
          row: disaster.row,
          col: disaster.col,
        }
        scene.add(dustMesh)
      } else if (disaster.kind === 'monster') {
        const monsterGroup = new THREE.Group()
        monsterGroup.name = 'disaster-monster'
        monsterGroup.position.set(x, 0, z)
        const bodyGeometry = new THREE.BoxGeometry(
          CELL_SIZE * 0.4,
          CELL_SIZE * 0.9,
          CELL_SIZE * 0.4,
        )
        const bodyMaterial = new THREE.MeshLambertMaterial({
          color: 0x5a2a4a,
        })
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial)
        bodyMesh.position.set(0, CELL_SIZE * 0.45, 0)
        monsterGroup.add(bodyMesh)
        const headGeometry = new THREE.SphereGeometry(
          CELL_SIZE * 0.25,
          12,
          8,
        )
        const headMaterial = new THREE.MeshLambertMaterial({
          color: 0x7a3a6a,
          emissive: new THREE.Color(0x402030),
          emissiveIntensity: 0.6,
        })
        const headMesh = new THREE.Mesh(headGeometry, headMaterial)
        headMesh.position.set(0, CELL_SIZE * 1.05, 0)
        monsterGroup.add(headMesh)
        monsterGroup.userData = {
          type: 'disaster-monster',
          row: disaster.row,
          col: disaster.col,
        }
        scene.add(monsterGroup)
      }
    }

    // Ambient AI traffic (drive-mode visual fun). N small NPC cars
    // pick random street cells + cardinal directions and drive in
    // straight lines at constant speed. When one leaves the grid
    // bounds it respawns elsewhere. The pure step / spawn logic
    // lives in `ambientTraffic.ts` so the math is unit-testable
    // without three.js. v1 keeps each car as a flat 4-wheeled box;
    // future polish: turning at intersections, collision, slowing
    // for the player.
    let ambientCars: AmbientCar[] = []
    const ambientCarMeshes: THREE.Group[] = []
    if (city.pieces.length > 0 && bounds) {
      const ambientStreetCells = streetCellWorldCenters(
        city.pieces,
        pieceFootprintCells,
        cellToWorld,
      )
      ambientCars = spawnAmbientFleet(
        ambientStreetCells,
        ambientCarCountForPopulation(simState.population.totalPopulation),
        Math.random,
      )
      const ambientBodyGeometry = new THREE.BoxGeometry(
        CELL_SIZE * 0.18,
        CELL_SIZE * 0.1,
        CELL_SIZE * 0.36,
      )
      const ambientWheelGeometry = new THREE.CylinderGeometry(
        CELL_SIZE * 0.04,
        CELL_SIZE * 0.04,
        CELL_SIZE * 0.04,
        10,
      )
      ambientWheelGeometry.rotateZ(Math.PI / 2)
      const ambientWheelMaterial = new THREE.MeshLambertMaterial({
        color: 0x222222,
      })
      for (const ambient of ambientCars) {
        const group = new THREE.Group()
        group.name = 'ambient-car'
        group.position.set(ambient.x, CELL_SIZE * 0.05, ambient.z)
        group.rotation.y = dirToHeadingY(ambient.dir)
        const bodyMaterial = new THREE.MeshLambertMaterial({
          color: ambient.colorHex,
        })
        const bodyMesh = new THREE.Mesh(ambientBodyGeometry, bodyMaterial)
        bodyMesh.position.set(0, CELL_SIZE * 0.05, 0)
        group.add(bodyMesh)
        for (const wheelOffset of [
          { x: -CELL_SIZE * 0.07, z: -CELL_SIZE * 0.12 },
          { x: CELL_SIZE * 0.07, z: -CELL_SIZE * 0.12 },
          { x: -CELL_SIZE * 0.07, z: CELL_SIZE * 0.12 },
          { x: CELL_SIZE * 0.07, z: CELL_SIZE * 0.12 },
        ]) {
          const wheel = new THREE.Mesh(
            ambientWheelGeometry,
            ambientWheelMaterial,
          )
          wheel.position.set(wheelOffset.x, CELL_SIZE * 0.02, wheelOffset.z)
          group.add(wheel)
        }
        group.userData = { type: 'ambient-car' }
        ambientCarMeshes.push(group)
        scene.add(group)
      }
    }

    // Ambient pedestrians (F-014). Small bobbing box meshes at every
    // populated zone cell, count capped at PEDESTRIANS_PER_CELL_CAP.
    // Pure render proxies (no goals, no schedule, no path-finding);
    // the per-mesh bob phase is offset by index so a count-4 cell
    // looks like a small group of people rather than a synchronized
    // animation. Gated on `city.pieces.length > 0` to mirror the
    // ambient-car / player-car branch: the empty-city state shows
    // the empty-state prompt and skips the integration loop, so
    // static pedestrians on an otherwise-empty surface would look
    // wrong.
    const pedestrianMeshes: { mesh: THREE.Mesh; phase: number }[] = []
    let pedestrianElapsed = 0
    // F-013 slice 4: accumulated unpaused time for the suspension bob
    // phase. Mirrors the pedestrian-bob pattern so pause / resume does
    // not advance the bob phase across the pause window (a wall-clock
    // `performance.now()` source would snap the car height on resume).
    let bobElapsed = 0
    if (city.pieces.length > 0 && simState.population.totalPopulation > 0) {
      const anchors = pedestrianAnchors(simState.population, cellToWorld)
      const pedGeometry = new THREE.BoxGeometry(
        CELL_SIZE * 0.06,
        CELL_SIZE * 0.18,
        CELL_SIZE * 0.06,
      )
      const pedMaterial = new THREE.MeshLambertMaterial({ color: 0xd9b48a })
      for (const anchor of anchors) {
        for (let i = 0; i < anchor.count; i++) {
          const { dx, dz } = pedestrianOffsetWithinCell(i, CELL_SIZE)
          const mesh = new THREE.Mesh(pedGeometry, pedMaterial)
          mesh.position.set(
            anchor.x + dx,
            CELL_SIZE * 0.09,
            anchor.z + dz,
          )
          mesh.userData = { type: 'ambient-pedestrian' }
          // Phase derived from cell + within-cell index so the bob
          // is deterministic and replay-stable.
          const phase =
            ((anchor.cellRow * 31 + anchor.cellCol * 17 + i * 7) % 100) /
            100 *
            Math.PI *
            2
          pedestrianMeshes.push({ mesh, phase })
          scene.add(mesh)
        }
      }
    }

    // Placeholder player vehicle (REQ-047). A primitive-composed car
    // (body + cabin + four wheels) sits at the deterministic spawn
    // anchor (REQ-036). The keyboard input slice (REQ-034) drives the
    // group's position and rotation each frame via `applyDriveStep`
    // from `driveControls.ts`. Rendered only when the city has at
    // least one piece; an empty city shows the empty-state prompt
    // instead and the integration loop / key listeners stay dormant.
    let car: THREE.Group | null = null
    if (city.pieces.length > 0) {
      const { x, z } = cellToWorld(spawn.row, spawn.col)
      car = new THREE.Group()
      car.name = 'placeholder-car'
      car.position.set(x, 0, z)
      car.rotation.y = rotationToRadians(city.pieces[0].rotation)

      const bodyMaterial = new THREE.MeshLambertMaterial({
        color: CAR_BODY_COLOR,
      })
      const bodyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(CAR_WIDTH, CAR_BODY_HEIGHT, CAR_LENGTH),
        bodyMaterial,
      )
      bodyMesh.position.set(0, carBodyY(), 0)
      bodyMesh.userData = { placeholder: true }
      car.add(bodyMesh)

      const cabinMaterial = new THREE.MeshLambertMaterial({
        color: CAR_CABIN_COLOR,
      })
      const cabinMesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          CAR_CABIN_WIDTH,
          CAR_CABIN_HEIGHT,
          CAR_CABIN_LENGTH,
        ),
        cabinMaterial,
      )
      // Cabin sits slightly toward the rear so the windscreen line
      // reads forward; the orbit camera then sees a clear nose.
      cabinMesh.position.set(0, carCabinY(), CAR_CABIN_OFFSET)
      cabinMesh.userData = { placeholder: true }
      car.add(cabinMesh)

      const wheelGeometry = new THREE.CylinderGeometry(
        CAR_WHEEL_RADIUS,
        CAR_WHEEL_RADIUS,
        CAR_WHEEL_THICKNESS,
        16,
      )
      // Cylinder is created along its local Y axis. Rotating around Z
      // by 90deg lays it on its side so the round face is the contact
      // patch and the axis runs left / right of the car body.
      wheelGeometry.rotateZ(Math.PI / 2)
      const wheelMaterial = new THREE.MeshLambertMaterial({
        color: CAR_WHEEL_COLOR,
      })
      for (const offset of carWheelOffsets()) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
        wheel.position.set(offset.x, CAR_WHEEL_RADIUS, offset.z)
        wheel.userData = { placeholder: true }
        car.add(wheel)
      }

      // F-013 slice 2: brake-light tail pads. Two small box meshes at
      // the rear of the car group, sharing one material so a single
      // per-frame `color.set(...)` flips both pads from dim red (idle)
      // to bright red (braking). Not flagged `placeholder` so they
      // ride alongside the GLB once it loads.
      const brakeLightGeometry = new THREE.BoxGeometry(
        BRAKE_LIGHT_WIDTH,
        BRAKE_LIGHT_HEIGHT,
        BRAKE_LIGHT_DEPTH,
      )
      const brakeLightMaterial = new THREE.MeshBasicMaterial({
        color: brakeLightColor(false),
      })
      brakeLightMaterialRef.current = brakeLightMaterial
      for (const padOffset of brakeLightOffsets()) {
        const pad = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial)
        pad.position.set(padOffset.x, padOffset.y, padOffset.z)
        pad.userData = { brakeLight: true, side: padOffset.side }
        car.add(pad)
      }

      scene.add(car)

      // Lazy-load the Kenney Car GLB (REQ-047 fidelity bump). Mounted
      // as a child of the same `car` group so the integrator's
      // position / rotation continue to drive the loaded model. The
      // placeholder body / cabin / wheel meshes stay in the tree but
      // are hidden once the GLB lands; if loading fails the
      // placeholders stay visible so the player still has a car.
      const carGroup = car
      const gltfLoader = new GLTFLoader()
      gltfLoader.load(
        CAR_MODEL_URL,
        (gltf) => {
          if (cancelled) return
          const inner = new THREE.Group()
          inner.rotation.y = CAR_MODEL_YAW_OFFSET
          inner.scale.setScalar(CAR_MODEL_SCALE)
          inner.add(gltf.scene)
          inner.userData = { type: 'car-glb' }
          for (const child of carGroup.children) {
            if (child.userData?.placeholder) child.visible = false
          }
          carGroup.add(inner)
        },
        undefined,
        (err) => {
          // Keep placeholder visible on load failure.
          // eslint-disable-next-line no-console
          console.warn('Failed to load car.glb', err)
        },
      )
    }

    // Resize handling. The canvas fills its parent; we read the parent
    // box size on mount and on resize so the renderer / camera stay in
    // sync as the page reflows.
    let resizeRafHandle: number | null = null
    const applySize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const requestResize = () => {
      if (resizeRafHandle !== null) return
      resizeRafHandle = window.requestAnimationFrame(() => {
        resizeRafHandle = null
        applySize()
        // Re-render after resize so the empty-state scaffold (no
        // animation loop running) refreshes on viewport changes.
        if (!car) renderer.render(scene, camera)
      })
    }
    applySize()
    window.addEventListener('resize', requestResize)

    // Keyboard input (REQ-034). Keys press / release into a `Set` keyed
    // on `KeyboardEvent.code` so the binding table is layout-stable
    // (works on QWERTY, AZERTY, Dvorak); the integration loop reads
    // the live set each frame via `inputFromPressedKeys`.
    //
    // Listeners attach to `window` so the canvas does not need focus
    // for steering to work; a click anywhere in the page does not
    // steal driving control. We do not call `preventDefault` on the
    // arrow keys when the user is typing in an input / textarea so
    // text-entry shortcuts (e.g. cursor move in a future settings
    // form) keep working; the v1 drive view has no such inputs but
    // the guard keeps the contract consistent with the editor's
    // keyboard handler.
    const pressedKeys = new Set<string>()
    const isTextTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      return target.isContentEditable
    }
    const isBoundKey = (code: string): boolean =>
      Object.prototype.hasOwnProperty.call(keyBindingsRef.current, code)
    const root = rootRef.current
    const updatePressedAttr = () => {
      if (!root) return
      const list = Array.from(pressedKeys).sort().join(' ')
      root.setAttribute('data-keys-pressed', list)
    }
    // Lazy engine audio rig (REQ-068). Browsers gate `AudioContext`
    // creation on the first user gesture; we build the rig the first
    // time the player presses a bound drive key so the page does not
    // log an autoplay warning on load. The rig handle is published to
    // the parent ref so the mute toggle button can read it without a
    // re-render and so the unmount cleanup branch can stop it.
    const ensureEngineAudio = () => {
      if (engineRigRef.current) return
      // The Web Audio API is only available in the browser; the
      // playwright webServer renders the empty city so this branch
      // never fires there, but the typeof guard keeps the SSR / Node
      // build green just in case.
      if (typeof window === 'undefined') return
      const Ctor =
        window.AudioContext ??
        (window as unknown as {
          webkitAudioContext?: typeof AudioContext
        }).webkitAudioContext
      if (!Ctor) return
      try {
        const ctx = new Ctor()
        const rig = new EngineAudioRig(ctx)
        engineRigRef.current = rig
        // Apply the live mute state before start so a player who muted
        // before the first gesture stays muted on first sound.
        rig.setMuted(engineMutedRef.current)
        // Fire-and-forget the resume / start; the rig's update calls
        // before the promise resolves are safely swallowed (start is a
        // no-op while not started).
        rig.start().catch(() => {
          // Swallow autoplay rejections; a future user gesture will
          // re-trigger this branch via `ensureEngineAudio`.
        })
        if (root) {
          root.setAttribute('data-engine-audio-started', 'true')
        }
      } catch {
        // AudioContext construction can throw on locked-down browsers
        // (cross-origin iframes, Safari private mode). The drive scene
        // stays fully playable without sound; the mute button keeps
        // working as a no-op so the UI does not regress.
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isBoundKey(event.code)) return
      if (isTextTarget(event.target)) return
      // Arrow keys scroll the page by default; cancel that so the
      // viewport does not jump while the player is steering.
      event.preventDefault()
      pressedKeys.add(event.code)
      updatePressedAttr()
      // First-gesture trigger for the engine audio rig. The keydown
      // event is the gesture; subsequent presses are no-ops once the
      // rig exists (`ensureEngineAudio` short-circuits on the ref).
      ensureEngineAudio()
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isBoundKey(event.code)) return
      pressedKeys.delete(event.code)
      updatePressedAttr()
    }
    const handleBlur = () => {
      // Releasing focus (alt-tab, devtools focus) should clear the
      // input so the car does not keep accelerating with no key down.
      pressedKeys.clear()
      updatePressedAttr()
    }
    // Pause toggle (REQ-039). Esc flips the pause state regardless of
    // whether other keys are held; the React state drives the overlay
    // and the integration loop reads the ref each frame to freeze the
    // world. Held keys are NOT cleared on pause so resuming with the
    // throttle still down keeps accelerating, matching driver intuition
    // ("I held W through the menu and the car kept going when I closed
    // it"). The text-target guard short-circuits before
    // `preventDefault` so an Esc inside a future input dismisses the
    // input as the browser default expects.
    const handlePauseKey = (event: KeyboardEvent) => {
      if (event.code !== PAUSE_KEY_CODE) return
      if (isTextTarget(event.target)) return
      event.preventDefault()
      setPauseState((prev) => togglePauseState(prev))
    }
    // Engine audio mute toggle (REQ-068). M flips the mute state and
    // also counts as the first user gesture so a player who lands on
    // the drive surface and presses M before any drive key still gets
    // the rig built (and immediately silenced). The text-target guard
    // mirrors the WASD / Esc handlers so a future input keeps M-as-text
    // working.
    const handleEngineMuteKey = (event: KeyboardEvent) => {
      if (event.code !== ENGINE_MUTE_KEY_CODE) return
      if (isTextTarget(event.target)) return
      event.preventDefault()
      ensureEngineAudio()
      handleToggleEngineMute()
    }
    if (car) {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      window.addEventListener('blur', handleBlur)
      window.addEventListener('keydown', handlePauseKey)
      window.addEventListener('keydown', handleEngineMuteKey)
    }
    updatePressedAttr()

    // Touch input (REQ-035). Pointer event listeners attach to `window`
    // so the canvas does not need focus for steering to work; touches
    // on interactive surfaces (buttons, links inside the pause menu)
    // skip the gesture so a tap on the Resume button does not also
    // start a steering joystick. Mirrors the keyboard handler's
    // text-target guard semantics.
    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false
      return target.closest('button, input, textarea, select, a') !== null
    }
    const updateTouchAttrs = () => {
      if (!root) return
      const steer = steerStickRef.current
      const thr = throttleStickRef.current
      root.setAttribute(
        'data-touch-steer-active',
        steer.active ? 'true' : 'false',
      )
      root.setAttribute(
        'data-touch-throttle-active',
        thr.active ? 'true' : 'false',
      )
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      if (isInteractiveTarget(event.target)) return
      const steer = steerStickRef.current
      const thr = throttleStickRef.current
      const which = joystickForTouch({
        mode: touchModeRef.current,
        clientX: event.clientX,
        viewportWidth:
          typeof window !== 'undefined' ? window.innerWidth : 0,
        steerActive: steer.active,
        throttleActive: thr.active,
      })
      if (which === 'none') return
      const target = which === 'steer' ? steer : thr
      beginJoystick(target, event.pointerId, event.clientX, event.clientY)
      // The first touch is also the user gesture that unlocks the engine
      // audio rig (REQ-068). Mirrors the keydown handler's gesture trigger
      // so a touch-only player still gets engine sound.
      ensureEngineAudio()
      if (which === 'steer') setSteerStickActive(true)
      else setThrottleStickActive(true)
      updateTouchAttrs()
      // Prevent the browser from scrolling / pinch-zooming the page
      // while the player is steering.
      event.preventDefault()
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      const steer = steerStickRef.current
      const thr = throttleStickRef.current
      if (steer.pointerId === event.pointerId) {
        moveJoystick(steer, event.clientX, event.clientY)
        setSteerStickActive(true)
      } else if (thr.pointerId === event.pointerId) {
        moveJoystick(thr, event.clientX, event.clientY)
        setThrottleStickActive(true)
      } else {
        return
      }
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      const steer = steerStickRef.current
      const thr = throttleStickRef.current
      let changed = false
      if (steer.pointerId === event.pointerId) {
        endJoystick(steer)
        setSteerStickActive(false)
        changed = true
      }
      if (thr.pointerId === event.pointerId) {
        endJoystick(thr)
        setThrottleStickActive(false)
        changed = true
      }
      if (changed) updateTouchAttrs()
    }
    if (car) {
      window.addEventListener('pointerdown', handlePointerDown, {
        passive: false,
      })
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
    }
    updateTouchAttrs()

    // Vehicle integration loop (REQ-031 first slice). Runs only when
    // the car is mounted; an empty city renders a single static frame
    // so the empty-state prompt is the visual focus and the integrator
    // does not burn frames updating a hidden mesh.
    let frameHandle: number | null = null
    let lastTimestamp: number | null = null
    let vehicle = car
      ? createVehicleState({
          x: car.position.x,
          z: car.position.z,
          heading: car.rotation.y,
        })
      : null
    const updateVehicleAttrs = () => {
      if (!root || !vehicle) return
      root.setAttribute('data-car-x', vehicle.x.toFixed(3))
      root.setAttribute('data-car-z', vehicle.z.toFixed(3))
      root.setAttribute('data-car-heading', vehicle.heading.toFixed(4))
      root.setAttribute('data-car-speed', vehicle.speed.toFixed(3))
    }
    // HUD speed readout + bar fill (REQ-066). The integration loop
    // writes the readout text and the bar transform imperatively so
    // the React tree does not re-render every frame; the static label
    // / unit / controls hint render through React below. The mirror
    // also exposes `data-hud-speed` and `data-hud-direction` on the
    // scene root so a test can read driving state without inspecting
    // the WebGL scene graph.
    const updateHud = () => {
      if (!vehicle) return
      const valueText = formatSpeed(vehicle.speed)
      const direction = speedDirection(vehicle.speed)
      const fraction = speedFraction(vehicle.speed)
      const compass = headingToCompass(vehicle.heading)
      if (hudSpeedValueRef.current) {
        hudSpeedValueRef.current.textContent = valueText
      }
      if (hudDirectionRef.current) {
        hudDirectionRef.current.textContent =
          HUD_SPEED_DIRECTION_LABEL[direction]
      }
      if (hudCompassRef.current) {
        hudCompassRef.current.textContent = HUD_COMPASS_LABEL[compass]
      }
      if (hudSpeedBarFillRef.current) {
        // CSS `transform: scaleX(...)` keeps the bar's reflow-free; the
        // bar element is the inner fill so the outer track is the full
        // width and the fill scales from the left origin.
        hudSpeedBarFillRef.current.style.transform = `scaleX(${fraction})`
      }
      if (root) {
        root.setAttribute('data-hud-speed', valueText)
        root.setAttribute('data-hud-direction', direction)
        root.setAttribute('data-hud-compass', compass)
      }
    }
    // HUD surface mirror (REQ-030, REQ-054, REQ-066). Collapses the
    // `onStreet` and `onBuilding` flags into a single surface state so
    // the HUD shows a label that explains the live speed cap to the
    // player. `building` wins over `off-street` because the building
    // cap is tighter than the off-street cap; the on-street default
    // emits an empty label so the HUD only adds a line when a penalty
    // is actually engaged. `data-hud-surface` rides on the scene root
    // so tests can assert the live state without inspecting the DOM.
    const updateHudSurface = (onStreet: boolean, onBuilding: boolean) => {
      const state = surfaceState(onStreet, onBuilding)
      const label = HUD_SURFACE_LABEL[state]
      if (hudSurfaceRef.current) {
        hudSurfaceRef.current.textContent = label
      }
      if (root) {
        root.setAttribute('data-hud-surface', state)
      }
    }
    // Minimap car marker mirror (REQ-069). The integration loop writes
    // the live position and heading onto the SVG group's transform each
    // tick so the marker tracks the car without a React re-render. The
    // bounds are null on an empty grid (no city footprint to project)
    // and the car is also unmounted in that branch, so the helper is a
    // no-op when either is missing. Live coords are also mirrored on
    // the scene root as `data-minimap-car-*` so a test can read the
    // projection without inspecting the SVG transform.
    const updateMinimap = () => {
      if (!vehicle || !minimapBounds) return
      const projected = worldToMinimap(vehicle.x, vehicle.z, minimapBounds)
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
        return
      }
      const rotationDeg = headingToMinimapDegrees(vehicle.heading)
      const marker = minimapCarRef.current
      if (marker) {
        marker.setAttribute(
          'transform',
          `translate(${projected.x.toFixed(3)} ${projected.y.toFixed(3)}) rotate(${rotationDeg.toFixed(3)})`,
        )
      }
      if (root) {
        root.setAttribute('data-minimap-car-x', projected.x.toFixed(3))
        root.setAttribute('data-minimap-car-y', projected.y.toFixed(3))
        root.setAttribute(
          'data-minimap-car-rotation',
          rotationDeg.toFixed(3),
        )
      }
    }
    // Building collision flag mirror (REQ-030). True only when the car
    // center cell sits on a building cell so a test can assert the
    // penalty is engaged without sampling the speed history.
    const updateOnBuildingAttr = (onBuilding: boolean) => {
      if (!root) return
      root.setAttribute('data-on-building', onBuilding ? 'true' : 'false')
    }
    // Off-street flag mirror (REQ-054). True when the car center cell
    // is NOT covered by any street piece so a test can assert the
    // penalty engages without sampling the speed history.
    const updateOffStreetAttr = (offStreet: boolean) => {
      if (!root) return
      root.setAttribute('data-off-street', offStreet ? 'true' : 'false')
    }
    // Closest-piece mirror (REQ-032 / REQ-065). Surfaces the locator
    // for the closest piece any of the four wheels is in contact with
    // (resolved via `wheelTrackContact` plus `pieceFootprintDistance`)
    // so a future debug HUD or per-piece-type off-street tuning can
    // read the closest piece without re-walking the path each frame.
    // `null` (no wheel on any piece) maps to empty-string attributes
    // and a `data-closest-piece='none'` flag so a test can assert the
    // off-piece state without inspecting the WebGL scene graph.
    const updateClosestPieceAttrs = (closest: ClosestStreetPiece | null) => {
      if (!root) return
      if (closest === null) {
        root.setAttribute('data-closest-piece', 'none')
        root.setAttribute('data-closest-piece-index', '')
        root.setAttribute('data-closest-piece-type', '')
        root.setAttribute('data-closest-piece-segment', '')
        root.setAttribute('data-closest-piece-wheel', '')
        return
      }
      root.setAttribute('data-closest-piece', 'on')
      root.setAttribute(
        'data-closest-piece-index',
        String(closest.pieceIndex),
      )
      root.setAttribute('data-closest-piece-type', closest.pieceType)
      root.setAttribute('data-closest-piece-segment', closest.segmentId)
      root.setAttribute(
        'data-closest-piece-wheel',
        String(closest.wheelIndex),
      )
    }
    if (vehicle) {
      updateVehicleAttrs()
      const initialOnBuilding = isOnBuildingCell(
        vehicle.x,
        vehicle.z,
        buildingCells,
      )
      const initialOnStreet = wheelOnStreet(
        vehicle,
        wheelLocalOffsets,
        trackPath,
        city.pieces,
        CELL_SIZE,
      )
      updateOnBuildingAttr(initialOnBuilding)
      updateOffStreetAttr(!initialOnStreet)
      updateClosestPieceAttrs(
        closestStreetPiece(
          vehicle,
          wheelLocalOffsets,
          trackPath,
          city.pieces,
          CELL_SIZE,
        ),
      )
      updateHud()
      updateHudSurface(initialOnStreet, initialOnBuilding)
      updateMinimap()
    }

    // Chase camera rig (REQ-033). Initialized from the spawn pose so
    // the first rendered frame already has the camera behind the car
    // instead of starting at the orbit pose and lerping in. Updated
    // each tick toward the latest car pose; the rig's per-frame lerp
    // makes the camera ease through turns instead of snapping.
    const rig =
      vehicle && car
        ? createCameraRig(
            vehicle.x,
            vehicle.z,
            vehicle.heading,
            toCameraRigParams(cameraTuningRef.current),
          )
        : null
    const cameraLookTarget = new THREE.Vector3()
    const applyChaseCamera = () => {
      if (!rig) return
      camera.position.set(rig.position.x, rig.position.y, rig.position.z)
      cameraLookTarget.set(rig.target.x, rig.target.y, rig.target.z)
      camera.lookAt(cameraLookTarget)
    }
    const updateCameraAttrs = () => {
      if (!root || !rig) return
      root.setAttribute('data-camera-x', rig.position.x.toFixed(3))
      root.setAttribute('data-camera-z', rig.position.z.toFixed(3))
    }
    if (rig) {
      applyChaseCamera()
      updateCameraAttrs()
    }

    // Respawn key (REQ-067). R resets the car to the spawn anchor with
    // zero speed so a player who tipped off the world or wedged against
    // a building can recover without reloading the page. Skipped while
    // paused so a paused world cannot teleport the car mid-pause; the
    // pressed-key set is cleared so a held throttle does not relaunch
    // the freshly-spawned car on the next frame. The text-target guard
    // mirrors the WASD / Esc handlers so a future input on the drive
    // surface keeps R-as-text working. The chase camera rig snaps to
    // the new pose so it does not ease in from the wreck position on
    // the next tick.
    const handleRespawnKey = (event: KeyboardEvent) => {
      if (event.code !== RESPAWN_KEY_CODE) return
      if (isTextTarget(event.target)) return
      if (isPaused(pauseStateRef.current)) return
      if (!vehicle || !car) return
      event.preventDefault()
      vehicle = respawnVehicle(city.pieces)
      car.position.x = vehicle.x
      car.position.z = vehicle.z
      car.rotation.y = vehicle.heading
      pressedKeys.clear()
      updatePressedAttr()
      updateVehicleAttrs()
      const respawnOnBuilding = isOnBuildingCell(
        vehicle.x,
        vehicle.z,
        buildingCells,
      )
      const respawnOnStreet = wheelOnStreet(
        vehicle,
        wheelLocalOffsets,
        trackPath,
        city.pieces,
        CELL_SIZE,
      )
      updateOnBuildingAttr(respawnOnBuilding)
      updateOffStreetAttr(!respawnOnStreet)
      updateClosestPieceAttrs(
        closestStreetPiece(
          vehicle,
          wheelLocalOffsets,
          trackPath,
          city.pieces,
          CELL_SIZE,
        ),
      )
      updateHud()
      updateHudSurface(respawnOnStreet, respawnOnBuilding)
      updateMinimap()
      if (rig) {
        const snap = createCameraRig(
          vehicle.x,
          vehicle.z,
          vehicle.heading,
          toCameraRigParams(cameraTuningRef.current),
        )
        rig.position.x = snap.position.x
        rig.position.y = snap.position.y
        rig.position.z = snap.position.z
        rig.target.x = snap.target.x
        rig.target.y = snap.target.y
        rig.target.z = snap.target.z
        applyChaseCamera()
        updateCameraAttrs()
      }
      // Engine audio (REQ-068). Snap the rig to the idle pitch on
      // respawn so a player who was at full throttle when they pressed
      // R does not hear the engine note hold over from the wreck.
      const rigEngine = engineRigRef.current
      if (rigEngine) rigEngine.update(0)
    }
    if (car) {
      window.addEventListener('keydown', handleRespawnKey)
    }

    const tick = (timestamp: number) => {
      frameHandle = window.requestAnimationFrame(tick)
      if (lastTimestamp === null) {
        lastTimestamp = timestamp
        renderer.render(scene, camera)
        return
      }
      // Pause check (REQ-039). When paused, the loop still runs (so the
      // overlay can render against the live canvas) but skips the
      // integration step and resets `lastTimestamp` so the first frame
      // after resume does not back-integrate the elapsed pause duration.
      if (isPaused(pauseStateRef.current)) {
        lastTimestamp = timestamp
        // Engine audio (REQ-068). A paused world should fall silent so
        // the menu reads against quiet. The rig respects the explicit
        // mute toggle (M) by re-applying the player's choice on resume
        // through the per-frame `update` call below; here we just call
        // `update(0)` so the gain ramps to idle and the pitch settles
        // to the idle frequency without a click.
        const rigPaused = engineRigRef.current
        if (rigPaused) rigPaused.update(0)
        renderer.render(scene, camera)
        return
      }
      const dt = (timestamp - lastTimestamp) / 1000
      lastTimestamp = timestamp
      if (vehicle && car) {
        const keyboardInput = inputFromPressedKeys(
          pressedKeys,
          keyBindingsRef.current,
        )
        // Touch input (REQ-035). Merged with the keyboard input via a
        // per-action OR so a player can hold W and tap touch at the
        // same time and the integrator just sees throttle on.
        const touchInputForFrame = joysticksToInput(
          steerStickRef.current,
          throttleStickRef.current,
          touchModeRef.current,
        )
        const input = mergeDriveInputs(keyboardInput, touchInputForFrame)
        // F-013 slice 1: brake-input mirror. The pill stays mounted
        // alongside the rest of the dashboard; the integration loop
        // writes the label text and a `data-brake-active` attribute
        // each frame so a player sees a visible cue when they are
        // actively braking. F-013 slice 2 layers a 3D tail-light
        // material swap on top: when `input.brake` is true, the two
        // rear tail pads flip from dim red to bright red so the brake
        // cue reads in the world as well as in the HUD. The tire-
        // screech audio cue and the suspension-bob visual cue stay
        // deferred to follow-on slices.
        if (brakeLightMaterialRef.current) {
          brakeLightMaterialRef.current.color.setHex(
            brakeLightColor(input.brake),
          )
        }
        if (root) {
          root.setAttribute(
            'data-brake-active',
            input.brake ? 'true' : 'false',
          )
        }
        if (hudBrakeRef.current) {
          hudBrakeRef.current.textContent = input.brake
            ? HUD_BRAKE_LABEL
            : ''
        }
        vehicle = applyDriveStep(vehicle, input, dt)
        // Off-street penalty (REQ-054) with per-wheel detection
        // (REQ-032). Applied first so a player who veers off the road
        // bleeds before any building-cell stack on top fires. The two
        // penalties stack at the same call site because a building
        // cell is also off-street; the more aggressive of the two
        // (the building cap is tighter) wins. The on-street test now
        // walks the four wheel offsets through the multi-locator
        // substrate (REQ-064 + REQ-065) so a multi-cell piece (mega
        // sweep, hairpin) reports on-street status from any of its
        // footprint cells and a tire hanging off the road does not
        // flip the whole car off-street while another tire still
        // contacts a piece.
        const onStreet = wheelOnStreet(
          vehicle,
          wheelLocalOffsets,
          trackPath,
          city.pieces,
          CELL_SIZE,
        )
        vehicle = applyOffStreetPenalty(vehicle, onStreet, dt)
        // Building cell penalty (REQ-030, Q-005 default A). After the
        // integrator advances the car, check whether the new center
        // cell sits on a building cell and pull the speed back to the
        // building penalty range. The position has already advanced
        // for this frame; the next frame's integration starts from the
        // capped speed so a held throttle on a building cell sees the
        // car drift to a slow crawl instead of pushing through.
        const onBuilding = isOnBuildingCell(
          vehicle.x,
          vehicle.z,
          buildingCells,
        )
        vehicle = applyBuildingPenalty(vehicle, onBuilding, dt)
        car.position.x = vehicle.x
        car.position.z = vehicle.z
        // F-013 slice 4: speed-proportional suspension bob. Phase
        // advances with the integration loop's `dt` so pause / resume
        // does not snap the car height (a wall-clock source would
        // advance during pause and produce a jump on the first resumed
        // frame). Amplitude scales with |vehicle.speed| / MAX_SPEED so
        // a stopped car reads as flat.
        bobElapsed += dt
        car.position.y = suspensionBobOffset(
          vehicle.speed,
          bobElapsed,
          MAX_SPEED,
        )
        car.rotation.y = vehicle.heading
        updateVehicleAttrs()
        updateOnBuildingAttr(onBuilding)
        updateOffStreetAttr(!onStreet)
        // Closest-piece readout (REQ-032 / REQ-065). Called after the
        // integrator advances the car so the locator reflects the live
        // post-penalty pose. Resolves through `wheelTrackContact` plus
        // `pieceFootprintDistance` so a multi-cell piece (hairpin, mega
        // sweep) the wheel sits on resolves to that piece rather than
        // an overlapping neighbor; pure helper, no allocation beyond
        // the picked record.
        updateClosestPieceAttrs(
          closestStreetPiece(
            vehicle,
            wheelLocalOffsets,
            trackPath,
            city.pieces,
            CELL_SIZE,
          ),
        )
        updateHud()
        updateHudSurface(onStreet, onBuilding)
        updateMinimap()
        // Engine audio (REQ-068). The rig's `update` is a no-op until
        // `start()` resolves and is also a no-op while muted, so the
        // call here is unconditional. Once the rig is live the
        // oscillator frequency and the gain track the live speed.
        const rig = engineRigRef.current
        if (rig) rig.update(vehicle.speed)
      }
      if (rig && vehicle) {
        updateCameraRig(
          rig,
          vehicle.x,
          vehicle.z,
          vehicle.heading,
          toCameraRigParams(cameraTuningRef.current),
        )
        applyChaseCamera()
        updateCameraAttrs()
      }
      // Ambient traffic step. Mirrors the per-frame integration; the
      // pure helper handles bounds + respawn so the loop here just
      // forwards each car through `stepAmbientCar` and copies the
      // result onto the matching mesh.
      if (ambientCars.length > 0 && bounds) {
        const ambientStreetCells = streetCellWorldCenters(
          city.pieces,
          pieceFootprintCells,
          cellToWorld,
        )
        for (let i = 0; i < ambientCars.length; i++) {
          const next = stepAmbientCar(
            ambientCars[i],
            dt,
            bounds,
            ambientStreetCells,
            Math.random,
          )
          ambientCars[i] = next
          const mesh = ambientCarMeshes[i]
          mesh.position.x = next.x
          mesh.position.z = next.z
          mesh.rotation.y = dirToHeadingY(next.dir)
        }
      }
      // Ambient pedestrian bob (F-014). Per-mesh phase keeps the
      // crowd looking lively without synchronizing every figure.
      // Drive the sine input with an accumulated unpaused time so
      // pause / resume does not snap mesh heights (the wall-clock
      // `timestamp / 1000` would advance during pause and produce
      // a jump on the first resumed frame).
      if (pedestrianMeshes.length > 0) {
        pedestrianElapsed += dt
        for (const { mesh, phase } of pedestrianMeshes) {
          mesh.position.y =
            CELL_SIZE * 0.09 +
            Math.sin(pedestrianElapsed * 2.5 + phase) * CELL_SIZE * 0.012
        }
      }
      renderer.render(scene, camera)
    }
    if (car) {
      frameHandle = window.requestAnimationFrame(tick)
    } else {
      // No car mounted: single render pass for the static scaffold.
      renderer.render(scene, camera)
    }

    return () => {
      cancelled = true
      window.removeEventListener('resize', requestResize)
      if (resizeRafHandle !== null) {
        window.cancelAnimationFrame(resizeRafHandle)
        resizeRafHandle = null
      }
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
        frameHandle = null
      }
      if (car) {
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('keyup', handleKeyUp)
        window.removeEventListener('blur', handleBlur)
        window.removeEventListener('keydown', handlePauseKey)
        window.removeEventListener('keydown', handleRespawnKey)
        window.removeEventListener('keydown', handleEngineMuteKey)
        window.removeEventListener('pointerdown', handlePointerDown)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
        // Release any active joysticks so a tab switch mid-touch does
        // not leave the throttle stuck on. Refs captured inside the
        // effect closure so the cleanup branch reads the same instance
        // the listeners wrote to (the ref values are JoystickState
        // objects, not DOM nodes, so they cannot have changed identity).
        endJoystick(capturedSteerStick)
        endJoystick(capturedThrottleStick)
      }
      // Drop the camera ref (REQ-040) so a stale slider change after
      // the scene unmounts cannot poke the disposed projection matrix.
      perspectiveCameraRef.current = null
      // Tear down the engine audio rig (REQ-068) so navigating away
      // from the slug does not leave an oscillator humming. The rig
      // owns its `AudioContext`; the `stop()` call ramps the gain to
      // zero before stopping so the silence does not click.
      const rigToStop = engineRigRef.current
      if (rigToStop) {
        rigToStop.stop()
        engineRigRef.current = null
      }
      // Dispose every geometry / material attached to the scene so
      // navigating away does not leak GPU memory across slugs.
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            for (const mat of obj.material) mat.dispose()
          } else {
            obj.material.dispose()
          }
        }
      })
      renderer.dispose()
    }
  }, [
    city.pieces,
    city.buildings,
    city.mood,
    bounds,
    spawn,
    buildingCells,
    trackPath,
    wheelLocalOffsets,
    minimapBounds,
    handleToggleEngineMute,
    simState.zones,
    simState.power,
    simState.water,
    simState.disasters,
    simState.population,
  ])

  // Auto day-night cycle visual update (mass-appeal slice 3).
  // When `mood.timeOfDay === 'auto'` the resolved day/night flips
  // every `DAY_NIGHT_CYCLE_TICKS / 2` ticks. Mutate the scene's
  // lighting + sky + ground in place via the refs populated above
  // so the cycle does NOT trigger a full bootstrap re-run (which
  // would teleport the player car back to spawn). Zone emissive
  // and lit-window materials stay at their bootstrap value; a
  // future polish slice can extend the in-place update to those.
  const cycleResolvedTimeOfDay = resolveTimeOfDay(city.mood, simState.tick)
  useEffect(() => {
    const palette = TIME_OF_DAY_PALETTE[cycleResolvedTimeOfDay]
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(
        cycleResolvedTimeOfDay === 'night' ? palette.skyHex : SKY_COLOR,
      )
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity =
        cycleResolvedTimeOfDay === 'night'
          ? palette.ambientIntensity
          : AMBIENT_LIGHT_INTENSITY
    }
    if (directionalLightRef.current) {
      directionalLightRef.current.intensity =
        cycleResolvedTimeOfDay === 'night'
          ? palette.sunIntensity
          : DIRECTIONAL_LIGHT_INTENSITY
    }
    if (groundMaterialRef.current) {
      groundMaterialRef.current.color = new THREE.Color(
        cycleResolvedTimeOfDay === 'night' ? palette.groundHex : GROUND_COLOR,
      )
    }
  }, [cycleResolvedTimeOfDay])

  // The placeholder car (REQ-047) renders only when at least one piece
  // exists. Mirrors the spawn-marker / empty-state branch above; we
  // expose the flag as a data attribute so Playwright can assert the
  // car is mounted on a non-empty city without inspecting the WebGL
  // scene graph.
  const hasVehicle = city.pieces.length > 0
  // Pause overlay (REQ-039 / REQ-038) renders only when the vehicle is
  // mounted AND the player has actually pressed Esc. The keyboard
  // listener that toggles the pause state is itself gated on
  // `hasVehicle` (the listener attach branch in the useEffect above)
  // so the menu cannot appear on the empty grid; the second check here
  // keeps the JSX honest if a future slice unbinds that gate.
  const showPauseMenu = hasVehicle && isPaused(pauseState)

  return (
    <div
      ref={rootRef}
      data-testid="drive-scene-root"
      data-slug={slug}
      data-piece-count={city.pieces.length}
      data-building-count={city.buildings.length}
      data-empty={isEmpty ? 'true' : 'false'}
      data-spawn-row={spawn.row}
      data-spawn-col={spawn.col}
      data-vehicle={hasVehicle ? 'true' : 'false'}
      data-controls-active={hasVehicle ? 'true' : 'false'}
      data-camera-mode={hasVehicle ? 'chase' : 'orbit'}
      data-time-of-day={resolveTimeOfDay(city.mood, simState.tick)}
      data-pause-state={pauseState}
      data-on-building="false"
      data-off-street="false"
      data-closest-piece="none"
      data-closest-piece-index=""
      data-closest-piece-type=""
      data-closest-piece-segment=""
      data-closest-piece-wheel=""
      data-hud-visible={hasVehicle && !showPauseMenu ? 'true' : 'false'}
      data-hud-speed="0"
      data-hud-direction="idle"
      data-hud-compass="N"
      data-hud-surface="street"
      data-brake-active="false"
      data-city-validity={cityValidityState}
      data-unmatched-port-count={unmatchedPortCount}
      data-engine-audio-muted={engineMuted ? 'true' : 'false'}
      data-engine-audio-started="false"
      data-share-copy-status={shareCopyStatus}
      data-minimap-visible={hasVehicle && !showPauseMenu ? 'true' : 'false'}
      data-minimap-piece-count={city.pieces.length}
      data-minimap-building-count={city.buildings.length}
      data-camera-height={cameraTuning.height}
      data-camera-distance={cameraTuning.distance}
      data-camera-look-ahead={cameraTuning.lookAhead}
      data-camera-follow-speed={cameraTuning.followSpeed}
      data-camera-fov={cameraTuning.fov}
      data-touch-mode={touchMode}
      data-touch-steer-active={steerStickActive ? 'true' : 'false'}
      data-touch-throttle-active={throttleStickActive ? 'true' : 'false'}
      data-key-bindings={keyBindingSignature(keyBindings)}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        color: '#f7f4ee',
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="drive-scene-canvas"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 4,
            background: 'rgba(34, 34, 34, 0.7)',
            fontSize: 14,
            fontFamily: 'system-ui, sans-serif',
            letterSpacing: 0.5,
          }}
        >
          <span data-testid="drive-scene-slug">{slug}</span>
        </div>
        <button
          type="button"
          data-testid="drive-share-copy"
          data-share-status={shareCopyStatus}
          aria-label={shareCopyAriaLabel(slug, shareCopyStatus)}
          title="Copy this city's share link"
          onClick={handleCopyShareUrl}
          style={{
            padding: '8px 12px',
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            color: shareCopyStatus === 'error' ? '#a3372a' : '#f7f4ee',
            background: 'rgba(34, 34, 34, 0.7)',
            border:
              shareCopyStatus === 'copied'
                ? '1px solid #6a8f5a'
                : shareCopyStatus === 'error'
                  ? '1px solid #a3372a'
                  : '1px solid #444',
            borderRadius: 4,
            cursor: 'pointer',
            letterSpacing: 0.4,
            lineHeight: 1,
          }}
        >
          {shareCopyLabel(shareCopyStatus)}
        </button>
      </div>
      <Link
        href={`/${slug}/edit`}
        data-testid="drive-edit-cta"
        data-slug={slug}
        aria-label={`Edit city ${slug}`}
        title="Edit this city"
        prefetch
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          padding: '8px 14px',
          fontSize: 14,
          fontFamily: 'system-ui, sans-serif',
          color: '#222',
          background: '#f7f4ee',
          border: '1px solid #d6cfbf',
          borderRadius: 4,
          textDecoration: 'none',
        }}
      >
        Edit
        <SceneTransitionCurtain target="edit" />
      </Link>
      {isEmpty ? (
        <div
          data-testid="drive-empty-prompt"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            pointerEvents: 'none',
            textAlign: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <p
            style={{
              fontSize: 14,
              margin: 0,
              opacity: 0.6,
              letterSpacing: 1,
            }}
          >
            VIBECITY
          </p>
          <h1
            style={{
              fontSize: 36,
              margin: 0,
              wordBreak: 'break-all',
              color: '#f7f4ee',
            }}
          >
            {slug}
          </h1>
          <p
            style={{
              fontSize: 16,
              margin: 0,
              opacity: 0.85,
              maxWidth: 360,
            }}
          >
            Place a road first. Open the editor and drop a Straight piece on
            the grid to start your city.
          </p>
          <Link
            href={`/${slug}/edit`}
            data-testid="drive-empty-create-cta"
            prefetch
            style={{
              pointerEvents: 'auto',
              marginTop: 8,
              padding: '10px 18px',
              fontSize: 14,
              color: '#222',
              background: '#f7f4ee',
              border: '1px solid #d6cfbf',
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            Open editor
            <SceneTransitionCurtain target="edit" />
          </Link>
        </div>
      ) : null}
      {hasVehicle && !showPauseMenu ? (
        <div
          data-testid="drive-hud-speed"
          aria-live="off"
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            padding: '8px 12px',
            borderRadius: 4,
            background: 'rgba(34, 34, 34, 0.7)',
            color: '#f7f4ee',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            letterSpacing: 0.5,
            minWidth: 140,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {HUD_SPEED_LABEL}
            </span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>
              {HUD_SPEED_UNIT}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
            }}
          >
            <span
              ref={hudSpeedValueRef}
              data-testid="drive-hud-speed-value"
              style={{
                fontSize: 28,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
              }}
            >
              0
            </span>
            <span
              ref={hudDirectionRef}
              data-testid="drive-hud-direction"
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: '#e0c878',
              }}
            />
          </div>
          <div
            style={{
              minHeight: 14,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              ref={hudSurfaceRef}
              data-testid="drive-hud-surface"
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: '#f5b94a',
              }}
            />
            <span
              ref={hudCompassRef}
              data-testid="drive-hud-compass"
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: '#a3c8a3',
              }}
            >
              N
            </span>
            <span
              ref={hudBrakeRef}
              data-testid="drive-hud-brake"
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: HUD_BRAKE_COLOR,
                fontWeight: 600,
              }}
            />
            {(() => {
              const dayNumber = cityDayNumber(simState.tick)
              const flashing = dayRolloverFlashing(simState.tick)
              return (
                <span
                  data-testid="drive-hud-day"
                  data-sim-day={dayNumber}
                  data-day-flash={flashing ? 'active' : 'idle'}
                  style={{
                    fontSize: 11,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: flashing ? '#9be0a3' : '#cbb88a',
                    fontWeight: flashing ? 700 : undefined,
                  }}
                >
                  {`Day ${dayNumber}`}
                </span>
              )
            })()}
          </div>
          {cityValidityState === 'open' ? (
            <div
              style={{
                minHeight: 14,
                display: 'flex',
                alignItems: 'baseline',
              }}
            >
              <span
                data-testid="drive-hud-city-validity"
                data-city-validity={cityValidityState}
                data-unmatched-port-count={unmatchedPortCount}
                style={{
                  fontSize: 11,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: '#9bb6e0',
                }}
              >
                {HUD_CITY_VALIDITY_LABEL[cityValidityState]}
              </span>
            </div>
          ) : null}
          <div
            data-testid="drive-hud-speed-bar"
            style={{
              marginTop: 6,
              height: 4,
              width: '100%',
              background: 'rgba(255, 255, 255, 0.18)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              ref={hudSpeedBarFillRef}
              data-testid="drive-hud-speed-bar-fill"
              style={{
                height: '100%',
                width: '100%',
                background: '#f7f4ee',
                transformOrigin: 'left center',
                transform: 'scaleX(0)',
              }}
            />
          </div>
        </div>
      ) : null}
      {hasVehicle && !showPauseMenu ? (
        <div
          data-testid="drive-hud-controls"
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            padding: '8px 12px',
            borderRadius: 4,
            background: 'rgba(34, 34, 34, 0.7)',
            color: '#f7f4ee',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12,
            letterSpacing: 0.3,
            lineHeight: 1.6,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          {HUD_CONTROLS_HINT_LINES.map((line) => (
            <div key={line}>{line}</div>
          ))}
          <div>M: {engineMuted ? 'unmute' : 'mute'} engine</div>
        </div>
      ) : null}
      {hasVehicle && !showPauseMenu && minimapBounds ? (
        <div
          data-testid="drive-minimap"
          aria-label="Minimap"
          style={{
            position: 'absolute',
            top: 64,
            right: 16,
            width: MINIMAP_SIZE_PX,
            height: MINIMAP_SIZE_PX,
            padding: 4,
            borderRadius: 6,
            background: MINIMAP_BACKGROUND_COLOR,
            border: `1px solid ${MINIMAP_BORDER_COLOR}`,
            pointerEvents: 'none',
          }}
        >
          <svg
            data-testid="drive-minimap-svg"
            xmlns="http://www.w3.org/2000/svg"
            width={MINIMAP_SIZE_PX}
            height={MINIMAP_SIZE_PX}
            viewBox={`0 0 ${MINIMAP_SIZE_PX} ${MINIMAP_SIZE_PX}`}
            style={{ display: 'block' }}
          >
            {city.pieces.flatMap((piece, pieceIndex) =>
              pieceFootprintWorldCells(piece).map((cell, cellIndex) => {
                const center = worldToMinimap(cell.x, cell.z, minimapBounds)
                const size = CELL_SIZE * minimapBounds.scale
                return (
                  <rect
                    key={`piece-${pieceIndex}-${cellIndex}`}
                    data-testid="drive-minimap-piece"
                    x={center.x - size / 2}
                    y={center.y - size / 2}
                    width={size}
                    height={size}
                    fill={MINIMAP_PIECE_COLOR}
                  />
                )
              }),
            )}
            {city.buildings.map((b, buildingIndex) => {
              const worldPos = cellToWorld(b.row, b.col)
              const center = worldToMinimap(
                worldPos.x,
                worldPos.z,
                minimapBounds,
              )
              const size = CELL_SIZE * minimapBounds.scale * 0.85
              return (
                <rect
                  key={`building-${buildingIndex}`}
                  data-testid="drive-minimap-building"
                  x={center.x - size / 2}
                  y={center.y - size / 2}
                  width={size}
                  height={size}
                  fill={MINIMAP_BUILDING_COLOR}
                />
              )
            })}
            <g
              ref={minimapCarRef}
              data-testid="drive-minimap-car"
              transform={`translate(${(MINIMAP_SIZE_PX / 2).toFixed(3)} ${(MINIMAP_SIZE_PX / 2).toFixed(3)}) rotate(0)`}
            >
              <polygon
                points={`0,${-MINIMAP_CAR_SIZE_PX / 2} ${MINIMAP_CAR_SIZE_PX / 2.4},${MINIMAP_CAR_SIZE_PX / 2} ${-MINIMAP_CAR_SIZE_PX / 2.4},${MINIMAP_CAR_SIZE_PX / 2}`}
                fill={MINIMAP_CAR_COLOR}
                stroke="#f7f4ee"
                strokeWidth={0.75}
              />
            </g>
          </svg>
        </div>
      ) : null}
      {hasVehicle && !showPauseMenu && steerStickActive ? (
        <TouchJoystickRing
          state={steerStickRef.current}
          testid="drive-touch-steer-ring"
        />
      ) : null}
      {hasVehicle &&
      !showPauseMenu &&
      throttleStickActive &&
      touchMode === 'dual-stick' ? (
        <TouchJoystickRing
          state={throttleStickRef.current}
          testid="drive-touch-throttle-ring"
        />
      ) : null}
      {hasVehicle ? (
        <button
          type="button"
          data-testid="drive-engine-mute-toggle"
          aria-pressed={engineMuted}
          aria-label={engineMuted ? 'Unmute engine' : 'Mute engine'}
          onClick={handleToggleEngineMute}
          style={{
            position: 'absolute',
            top: 16,
            right: 80,
            padding: '8px 12px',
            fontSize: 14,
            fontFamily: 'system-ui, sans-serif',
            color: '#f7f4ee',
            background: 'rgba(34, 34, 34, 0.7)',
            border: '1px solid #444',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {engineMuted ? 'Sound off' : 'Sound on'}
        </button>
      ) : null}
      {showPauseMenu ? (
        <div
          data-testid="drive-pause-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Paused"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: 'rgba(0, 0, 0, 0.6)',
            fontFamily: 'system-ui, sans-serif',
            // Sit above the slug label and Edit CTA so the menu owns
            // the click surface while paused (REQ-039).
            zIndex: 10,
          }}
        >
          <p
            style={{
              fontSize: 14,
              margin: 0,
              opacity: 0.6,
              letterSpacing: 1,
              color: '#f7f4ee',
            }}
          >
            PAUSED
          </p>
          <h2
            style={{
              fontSize: 32,
              margin: 0,
              color: '#f7f4ee',
            }}
          >
            {slug}
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              data-testid="drive-pause-resume"
              onClick={handleResume}
              autoFocus
              style={{
                padding: '10px 18px',
                fontSize: 14,
                fontFamily: 'inherit',
                color: '#f7f4ee',
                background: '#222',
                border: '1px solid #444',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Resume
            </button>
            <Link
              href={`/${slug}/edit`}
              data-testid="drive-pause-edit-cta"
              data-slug={slug}
              aria-label={`Edit city ${slug}`}
              prefetch
              style={{
                padding: '10px 18px',
                fontSize: 14,
                fontFamily: 'inherit',
                color: '#222',
                background: '#f7f4ee',
                border: '1px solid #d6cfbf',
                borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              Edit
              <SceneTransitionCurtain target="edit" />
            </Link>
          </div>
          <p
            style={{
              fontSize: 12,
              margin: 0,
              opacity: 0.7,
              color: '#f7f4ee',
            }}
          >
            Press Esc to resume.
          </p>
          <CameraSettingsPanel
            tuning={cameraTuning}
            onChange={handleCameraTuningChange}
            onReset={handleCameraTuningReset}
          />
          <TouchSettingsPanel
            mode={touchMode}
            onChange={handleTouchModeChange}
            onReset={handleTouchModeReset}
          />
          <KeyboardSettingsPanel
            bindings={keyBindings}
            onChange={handleKeyBindingsChange}
            onReset={handleKeyBindingsReset}
          />
        </div>
      ) : null}
    </div>
  )
}
