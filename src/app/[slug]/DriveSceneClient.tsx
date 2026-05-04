'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { City, Slug } from '@/lib/schemas'
import {
  AMBIENT_LIGHT_INTENSITY,
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_HEIGHT,
  CAMERA_NEAR,
  CAR_BODY_COLOR,
  CAR_BODY_HEIGHT,
  CAR_CABIN_COLOR,
  CAR_CABIN_HEIGHT,
  CAR_CABIN_LENGTH,
  CAR_CABIN_OFFSET,
  CAR_CABIN_WIDTH,
  CAR_LENGTH,
  CAR_WHEEL_COLOR,
  CAR_WHEEL_RADIUS,
  CAR_WHEEL_THICKNESS,
  CAR_WIDTH,
  CELL_SIZE,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  GROUND_COLOR,
  PIECE_GROUND_LIFT,
  SKY_COLOR,
  buildingColorFor,
  buildingHeightFor,
  carBodyY,
  carCabinY,
  carWheelOffsets,
  cellToWorld,
  cityWorldBounds,
  pieceColorFor,
  pieceFootprintWorldCells,
  rotationToRadians,
  spawnAnchor,
} from './driveScene'
import {
  DEFAULT_KEY_BINDINGS,
  applyDriveStep,
  createVehicleState,
  inputFromPressedKeys,
} from './driveControls'
import { createCameraRig, updateCameraRig } from './cameraRig'
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
  isOnStreetCell,
  streetCellSet,
} from './offStreetPenalty'
import {
  HUD_CONTROLS_HINT_LINES,
  HUD_SPEED_LABEL,
  HUD_SPEED_UNIT,
  formatSpeed,
  speedDirection,
  speedFraction,
} from './driveHud'
import { RESPAWN_KEY_CODE, respawnVehicle } from './respawn'
import { ENGINE_MUTE_KEY_CODE, EngineAudioRig } from './engineAudio'
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
export function DriveSceneClient({
  slug,
  city,
}: {
  slug: Slug
  city: City
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // HUD refs (REQ-066). The integration loop writes the live speed
  // readout and the bar fill imperatively so the React tree does not
  // re-render every frame; only the static text content (label, unit,
  // controls hint) renders through the React tree below.
  const hudSpeedValueRef = useRef<HTMLSpanElement | null>(null)
  const hudSpeedBarFillRef = useRef<HTMLDivElement | null>(null)
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
  const handleToggleEngineMute = useCallback(() => {
    setEngineMuted((prev) => {
      const next = !prev
      const rig = engineRigRef.current
      if (rig) rig.setMuted(next)
      return next
    })
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

  // Street cell set for the off-street penalty (REQ-054). Mirrors the
  // building cell set above so the per-frame lookup is constant time;
  // multi-cell pieces (mega sweep, hairpin) expand to their full
  // footprint via `streetCellSet`.
  const streetCells = useMemo(
    () => streetCellSet(city.pieces),
    [city.pieces],
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

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SKY_COLOR)

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      1,
      CAMERA_NEAR,
      CAMERA_FAR,
    )

    // Lighting (REQ-044): ambient keeps unlit faces from going pure
    // black; the directional key light reads as noon from the south
    // east so extruded buildings cast a believable shadowless lift.
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    scene.add(ambient)
    const directional = new THREE.DirectionalLight(
      0xffffff,
      DIRECTIONAL_LIGHT_INTENSITY,
    )
    directional.position.set(...DIRECTIONAL_LIGHT_POSITION)
    scene.add(directional)

    // Ground plane (REQ-044). Sized large enough to read past the
    // visible city without being so big that the depth buffer suffers.
    const groundSize = CELL_SIZE * 64
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshLambertMaterial({ color: GROUND_COLOR }),
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

    // Buildings (REQ-046). Extruded boxes sized to the cell footprint
    // with per-type heights and colors so the four placeholder
    // primitives form a visible silhouette vocabulary from the orbit
    // view. Boxes are anchored at the cell center on the ground plane.
    for (const building of city.buildings) {
      const height = buildingHeightFor(building.type)
      const { x, z } = cellToWorld(building.row, building.col)
      const geometry = new THREE.BoxGeometry(
        CELL_SIZE * 0.85,
        height,
        CELL_SIZE * 0.85,
      )
      const material = new THREE.MeshLambertMaterial({
        color: buildingColorFor(building.type),
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, height / 2, z)
      mesh.rotation.y = rotationToRadians(building.rotation)
      scene.add(mesh)
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
        car.add(wheel)
      }

      scene.add(car)
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
      Object.prototype.hasOwnProperty.call(DEFAULT_KEY_BINDINGS, code)
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
      if (hudSpeedValueRef.current) {
        hudSpeedValueRef.current.textContent = valueText
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
    if (vehicle) {
      updateVehicleAttrs()
      updateOnBuildingAttr(
        isOnBuildingCell(vehicle.x, vehicle.z, buildingCells),
      )
      updateOffStreetAttr(
        !isOnStreetCell(vehicle.x, vehicle.z, streetCells),
      )
      updateHud()
      updateMinimap()
    }

    // Chase camera rig (REQ-033). Initialized from the spawn pose so
    // the first rendered frame already has the camera behind the car
    // instead of starting at the orbit pose and lerping in. Updated
    // each tick toward the latest car pose; the rig's per-frame lerp
    // makes the camera ease through turns instead of snapping.
    const rig =
      vehicle && car
        ? createCameraRig(vehicle.x, vehicle.z, vehicle.heading)
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
      updateOnBuildingAttr(
        isOnBuildingCell(vehicle.x, vehicle.z, buildingCells),
      )
      updateOffStreetAttr(
        !isOnStreetCell(vehicle.x, vehicle.z, streetCells),
      )
      updateHud()
      updateMinimap()
      if (rig) {
        const snap = createCameraRig(vehicle.x, vehicle.z, vehicle.heading)
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
        const input = inputFromPressedKeys(pressedKeys)
        vehicle = applyDriveStep(vehicle, input, dt)
        // Off-street penalty (REQ-054). Applied first so a player who
        // veers off the road bleeds before any building-cell stack on
        // top fires. The two penalties stack at the same call site
        // because a building cell is also off-street; the more
        // aggressive of the two (the building cap is tighter) wins.
        const onStreet = isOnStreetCell(
          vehicle.x,
          vehicle.z,
          streetCells,
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
        car.rotation.y = vehicle.heading
        updateVehicleAttrs()
        updateOnBuildingAttr(onBuilding)
        updateOffStreetAttr(!onStreet)
        updateHud()
        updateMinimap()
        // Engine audio (REQ-068). The rig's `update` is a no-op until
        // `start()` resolves and is also a no-op while muted, so the
        // call here is unconditional. Once the rig is live the
        // oscillator frequency and the gain track the live speed.
        const rig = engineRigRef.current
        if (rig) rig.update(vehicle.speed)
      }
      if (rig && vehicle) {
        updateCameraRig(rig, vehicle.x, vehicle.z, vehicle.heading)
        applyChaseCamera()
        updateCameraAttrs()
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
      }
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
    bounds,
    spawn,
    buildingCells,
    streetCells,
    minimapBounds,
    handleToggleEngineMute,
  ])

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
      data-pause-state={pauseState}
      data-on-building="false"
      data-off-street="false"
      data-hud-visible={hasVehicle && !showPauseMenu ? 'true' : 'false'}
      data-hud-speed="0"
      data-hud-direction="idle"
      data-engine-audio-muted={engineMuted ? 'true' : 'false'}
      data-engine-audio-started="false"
      data-minimap-visible={hasVehicle && !showPauseMenu ? 'true' : 'false'}
      data-minimap-piece-count={city.pieces.length}
      data-minimap-building-count={city.buildings.length}
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
          </div>
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
        </div>
      ) : null}
    </div>
  )
}
