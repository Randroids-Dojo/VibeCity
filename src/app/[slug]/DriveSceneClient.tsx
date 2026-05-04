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
  CELL_SIZE,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  GROUND_COLOR,
  PIECE_GROUND_LIFT,
  SKY_COLOR,
  buildingColorFor,
  buildingHeightFor,
  cellToWorld,
  cityWorldBounds,
  pieceColorFor,
  rotationToRadians,
} from './driveScene'

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
  const isEmpty = city.pieces.length === 0 && city.buildings.length === 0

  // Memoize the bounds so the effect re-fits the camera only when the
  // city actually changes shape, not on every parent rerender.
  const bounds = useMemo(
    () => cityWorldBounds(city.pieces, city.buildings),
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

    // Resize handling. The canvas fills its parent; we read the parent
    // box size on mount and on resize so the renderer / camera stay in
    // sync as the page reflows.
    let rafHandle: number | null = null
    const applySize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }
    const requestResize = () => {
      if (rafHandle !== null) return
      rafHandle = window.requestAnimationFrame(() => {
        rafHandle = null
        applySize()
      })
    }
    applySize()

    window.addEventListener('resize', requestResize)

    // Single render pass after mount. v1 ships a static scene; the
    // animation loop lands when the car / chase camera ship.
    renderer.render(scene, camera)

    return () => {
      window.removeEventListener('resize', requestResize)
      if (rafHandle !== null) {
        window.cancelAnimationFrame(rafHandle)
        rafHandle = null
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
  }, [city.pieces, city.buildings, bounds])

  return (
    <div
      data-testid="drive-scene-root"
      data-slug={slug}
      data-piece-count={city.pieces.length}
      data-building-count={city.buildings.length}
      data-empty={isEmpty ? 'true' : 'false'}
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
