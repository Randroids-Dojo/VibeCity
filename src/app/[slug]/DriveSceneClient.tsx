'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef } from 'react'
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
  rotationToRadians,
  spawnAnchor,
} from './driveScene'
import {
  DEFAULT_KEY_BINDINGS,
  applyDriveStep,
  createVehicleState,
  inputFromPressedKeys,
} from './driveControls'

/**
 * Drive scene scaffold (REQ-044, REQ-045, REQ-046, REQ-053).
 *
 * Mounts a raw three.js scene on a canvas the React component owns.
 * v1 ships an aerial / orbit view: a fixed camera tilts down at the
 * city center so an author can see the city they just built. Physics
 * (REQ-031), wheel contact (REQ-032), the chase camera (REQ-033),
 * keyboard input (REQ-034), and touch input (REQ-035) all land in
 * their own slices once the segment-based path (REQ-064) and
 * multi-cell footprint plumbing (REQ-059) ship.
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
  const isEmpty = city.pieces.length === 0 && city.buildings.length === 0

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
    // overlay reads against the same neutral background.
    const target = new THREE.Vector3(
      bounds?.centerX ?? 0,
      0,
      bounds?.centerZ ?? 0,
    )
    camera.position.set(
      target.x + CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      target.z + CAMERA_DISTANCE,
    )
    camera.lookAt(target)

    // Street pieces (REQ-045). Flat colored quads at the cell center,
    // lifted slightly above the ground to avoid z-fighting and rotated
    // around the world Y axis by the persisted rotation. Per-piece
    // multi-cell footprints (REQ-059) and sampled centerlines (F-003)
    // wait for the drive scene runtime.
    const pieceGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
    pieceGeometry.rotateX(-Math.PI / 2)
    for (const piece of city.pieces) {
      const { x, z } = cellToWorld(piece.row, piece.col)
      const material = new THREE.MeshLambertMaterial({
        color: pieceColorFor(piece.type),
      })
      const mesh = new THREE.Mesh(pieceGeometry, material)
      mesh.position.set(x, PIECE_GROUND_LIFT, z)
      mesh.rotation.y = rotationToRadians(piece.rotation)
      scene.add(mesh)
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isBoundKey(event.code)) return
      if (isTextTarget(event.target)) return
      // Arrow keys scroll the page by default; cancel that so the
      // viewport does not jump while the player is steering.
      event.preventDefault()
      pressedKeys.add(event.code)
      updatePressedAttr()
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
    if (car) {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      window.addEventListener('blur', handleBlur)
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
    if (vehicle) updateVehicleAttrs()

    const tick = (timestamp: number) => {
      frameHandle = window.requestAnimationFrame(tick)
      if (lastTimestamp === null) {
        lastTimestamp = timestamp
        renderer.render(scene, camera)
        return
      }
      const dt = (timestamp - lastTimestamp) / 1000
      lastTimestamp = timestamp
      if (vehicle && car) {
        const input = inputFromPressedKeys(pressedKeys)
        vehicle = applyDriveStep(vehicle, input, dt)
        car.position.x = vehicle.x
        car.position.z = vehicle.z
        car.rotation.y = vehicle.heading
        updateVehicleAttrs()
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
  }, [city.pieces, city.buildings, bounds, spawn])

  // The placeholder car (REQ-047) renders only when at least one piece
  // exists. Mirrors the spawn-marker / empty-state branch above; we
  // expose the flag as a data attribute so Playwright can assert the
  // car is mounted on a non-empty city without inspecting the WebGL
  // scene graph.
  const hasVehicle = city.pieces.length > 0

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
          </Link>
        </div>
      ) : null}
    </div>
  )
}
