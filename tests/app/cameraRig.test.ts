import { describe, expect, it } from 'vitest'
import {
  CAMERA_RIG_DISTANCE,
  CAMERA_RIG_HEIGHT,
  CAMERA_RIG_LOOK_AHEAD,
  CAMERA_RIG_POSITION_LERP,
  CAMERA_RIG_TARGET_HEIGHT,
  CAMERA_RIG_TARGET_LERP,
  DEFAULT_CAMERA_RIG,
  createCameraRig,
  desiredRigPose,
  updateCameraRig,
  type CameraRigParams,
  type CameraRigState,
} from '@/app/[slug]/cameraRig'
import { CELL_SIZE } from '@/app/[slug]/driveScene'

/**
 * REQ-033: chase camera rig pure helpers. The integration with
 * THREE.PerspectiveCamera lives in `DriveSceneClient.tsx`; the math
 * lives here so it is unit-testable without WebGL.
 */

const APPROX = 1e-9

describe('CAMERA_RIG_* constants', () => {
  it('all default tuning constants are positive finite numbers', () => {
    expect(CAMERA_RIG_HEIGHT).toBeGreaterThan(0)
    expect(CAMERA_RIG_DISTANCE).toBeGreaterThan(0)
    expect(CAMERA_RIG_LOOK_AHEAD).toBeGreaterThan(0)
    expect(CAMERA_RIG_TARGET_HEIGHT).toBeGreaterThan(0)
    expect(CAMERA_RIG_POSITION_LERP).toBeGreaterThan(0)
    expect(CAMERA_RIG_TARGET_LERP).toBeGreaterThan(0)
    for (const value of [
      CAMERA_RIG_HEIGHT,
      CAMERA_RIG_DISTANCE,
      CAMERA_RIG_LOOK_AHEAD,
      CAMERA_RIG_TARGET_HEIGHT,
      CAMERA_RIG_POSITION_LERP,
      CAMERA_RIG_TARGET_LERP,
    ]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('lerp factors are within (0, 1] so the rig actually advances each tick without overshoot', () => {
    expect(CAMERA_RIG_POSITION_LERP).toBeGreaterThan(0)
    expect(CAMERA_RIG_POSITION_LERP).toBeLessThanOrEqual(1)
    expect(CAMERA_RIG_TARGET_LERP).toBeGreaterThan(0)
    expect(CAMERA_RIG_TARGET_LERP).toBeLessThanOrEqual(1)
  })

  it('target sits above the ground plane but below the camera height so the camera looks down at the road', () => {
    expect(CAMERA_RIG_TARGET_HEIGHT).toBeLessThan(CAMERA_RIG_HEIGHT)
    expect(CAMERA_RIG_TARGET_HEIGHT).toBeGreaterThan(0)
  })

  it('camera distance and look ahead scale with CELL_SIZE so tuning travels with the world unit', () => {
    expect(CAMERA_RIG_DISTANCE / CELL_SIZE).toBeGreaterThan(0)
    expect(CAMERA_RIG_LOOK_AHEAD / CELL_SIZE).toBeGreaterThan(0)
  })
})

describe('DEFAULT_CAMERA_RIG', () => {
  it('mirrors the exported tuning constants', () => {
    expect(DEFAULT_CAMERA_RIG).toEqual({
      height: CAMERA_RIG_HEIGHT,
      distance: CAMERA_RIG_DISTANCE,
      lookAhead: CAMERA_RIG_LOOK_AHEAD,
      targetHeight: CAMERA_RIG_TARGET_HEIGHT,
      positionLerp: CAMERA_RIG_POSITION_LERP,
      targetLerp: CAMERA_RIG_TARGET_LERP,
    })
  })
})

describe('desiredRigPose forward-direction conventions', () => {
  it('at heading 0 the camera sits south of the car (car forward is -z) and looks north', () => {
    const pose = desiredRigPose(0, 0, 0)
    // forward at heading 0 is (0, -1); camera = car - forward * distance
    expect(pose.position.x).toBeCloseTo(0, 9)
    expect(pose.position.z).toBeCloseTo(CAMERA_RIG_DISTANCE, 9)
    expect(pose.target.x).toBeCloseTo(0, 9)
    expect(pose.target.z).toBeCloseTo(-CAMERA_RIG_LOOK_AHEAD, 9)
  })

  it('at heading PI/2 the camera sits west of the car (car forward is +x) and looks east', () => {
    const pose = desiredRigPose(0, 0, Math.PI / 2)
    // forward at heading PI/2 is (1, 0); camera = car - forward * distance
    expect(pose.position.x).toBeCloseTo(-CAMERA_RIG_DISTANCE, 9)
    expect(pose.position.z).toBeCloseTo(0, 9)
    expect(pose.target.x).toBeCloseTo(CAMERA_RIG_LOOK_AHEAD, 9)
    expect(pose.target.z).toBeCloseTo(0, 9)
  })

  it('at heading PI the camera sits north of the car (car forward is +z) and looks south', () => {
    const pose = desiredRigPose(0, 0, Math.PI)
    expect(pose.position.x).toBeCloseTo(0, 9)
    expect(pose.position.z).toBeCloseTo(-CAMERA_RIG_DISTANCE, 9)
    expect(pose.target.x).toBeCloseTo(0, 9)
    expect(pose.target.z).toBeCloseTo(CAMERA_RIG_LOOK_AHEAD, 9)
  })

  it('at heading -PI/2 the camera sits east of the car (car forward is -x) and looks west', () => {
    const pose = desiredRigPose(0, 0, -Math.PI / 2)
    expect(pose.position.x).toBeCloseTo(CAMERA_RIG_DISTANCE, 9)
    expect(pose.position.z).toBeCloseTo(0, 9)
    expect(pose.target.x).toBeCloseTo(-CAMERA_RIG_LOOK_AHEAD, 9)
    expect(pose.target.z).toBeCloseTo(0, 9)
  })

  it('translates with the car position', () => {
    const pose = desiredRigPose(10, -5, 0)
    expect(pose.position.x).toBeCloseTo(10, 9)
    expect(pose.position.z).toBeCloseTo(-5 + CAMERA_RIG_DISTANCE, 9)
    expect(pose.target.x).toBeCloseTo(10, 9)
    expect(pose.target.z).toBeCloseTo(-5 - CAMERA_RIG_LOOK_AHEAD, 9)
  })

  it('camera position uses params.height; target uses params.targetHeight', () => {
    const pose = desiredRigPose(0, 0, 0)
    expect(pose.position.y).toBeCloseTo(CAMERA_RIG_HEIGHT, 9)
    expect(pose.target.y).toBeCloseTo(CAMERA_RIG_TARGET_HEIGHT, 9)
  })

  it('the camera-to-target vector points forward through the car at the resting pose', () => {
    const pose = desiredRigPose(7, 3, Math.PI / 4)
    const fx = Math.sin(Math.PI / 4)
    const fz = -Math.cos(Math.PI / 4)
    const expectedDx = fx * (CAMERA_RIG_DISTANCE + CAMERA_RIG_LOOK_AHEAD)
    const expectedDz = fz * (CAMERA_RIG_DISTANCE + CAMERA_RIG_LOOK_AHEAD)
    expect(pose.target.x - pose.position.x).toBeCloseTo(expectedDx, 9)
    expect(pose.target.z - pose.position.z).toBeCloseTo(expectedDz, 9)
  })

  it('honors a custom params override without mutating the default preset', () => {
    const before = JSON.parse(JSON.stringify(DEFAULT_CAMERA_RIG))
    const custom: CameraRigParams = {
      ...DEFAULT_CAMERA_RIG,
      distance: 100,
      lookAhead: 50,
      height: 30,
      targetHeight: 5,
    }
    const pose = desiredRigPose(0, 0, 0, custom)
    expect(pose.position.z).toBeCloseTo(100, 9)
    expect(pose.target.z).toBeCloseTo(-50, 9)
    expect(pose.position.y).toBeCloseTo(30, 9)
    expect(pose.target.y).toBeCloseTo(5, 9)
    // Default preset is untouched.
    expect(DEFAULT_CAMERA_RIG).toEqual(before)
  })
})

describe('createCameraRig', () => {
  it('snaps both position and target to the desired pose', () => {
    const rig = createCameraRig(2, -4, Math.PI / 2)
    const pose = desiredRigPose(2, -4, Math.PI / 2)
    expect(rig.position).toEqual(pose.position)
    expect(rig.target).toEqual(pose.target)
  })

  it('returns a fresh object distinct from the desired pose so the renderer can mutate it', () => {
    const rig = createCameraRig(0, 0, 0)
    const pose = desiredRigPose(0, 0, 0)
    expect(rig).not.toBe(pose)
    expect(rig.position).not.toBe(pose.position)
    expect(rig.target).not.toBe(pose.target)
  })

  it('two successive create calls return independent state objects', () => {
    const a = createCameraRig(0, 0, 0)
    const b = createCameraRig(0, 0, 0)
    expect(a).not.toBe(b)
    a.position.x = 999
    expect(b.position.x).not.toBe(999)
  })
})

describe('updateCameraRig lerp behavior', () => {
  it('mutates the rig in place rather than returning a new object', () => {
    const rig = createCameraRig(0, 0, 0)
    const positionRef = rig.position
    const targetRef = rig.target
    updateCameraRig(rig, 10, 0, 0)
    expect(rig.position).toBe(positionRef)
    expect(rig.target).toBe(targetRef)
  })

  it('moves position and target toward the desired pose by the configured lerp factor', () => {
    const rig = createCameraRig(0, 0, 0)
    const startX = rig.position.x
    const startTargetX = rig.target.x
    updateCameraRig(rig, 100, 0, 0)
    const desired = desiredRigPose(100, 0, 0)
    expect(rig.position.x).toBeCloseTo(
      startX + (desired.position.x - startX) * CAMERA_RIG_POSITION_LERP,
      9,
    )
    expect(rig.target.x).toBeCloseTo(
      startTargetX + (desired.target.x - startTargetX) * CAMERA_RIG_TARGET_LERP,
      9,
    )
  })

  it('a lerp of 1 snaps the rig to the desired pose in one step', () => {
    const rig = createCameraRig(0, 0, 0)
    updateCameraRig(rig, 10, -5, Math.PI / 2, {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: 1,
      targetLerp: 1,
    })
    const desired = desiredRigPose(10, -5, Math.PI / 2)
    expect(rig.position.x).toBeCloseTo(desired.position.x, 9)
    expect(rig.position.z).toBeCloseTo(desired.position.z, 9)
    expect(rig.target.x).toBeCloseTo(desired.target.x, 9)
    expect(rig.target.z).toBeCloseTo(desired.target.z, 9)
  })

  it('a lerp of 0 leaves the rig unchanged even though the car moved', () => {
    const rig = createCameraRig(0, 0, 0)
    const before: CameraRigState = JSON.parse(JSON.stringify(rig))
    updateCameraRig(rig, 100, 100, Math.PI, {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: 0,
      targetLerp: 0,
    })
    expect(rig).toEqual(before)
  })

  it('clamps a negative lerp factor to 0 so callers cannot push the rig away from the desired pose', () => {
    const rig = createCameraRig(0, 0, 0)
    const before: CameraRigState = JSON.parse(JSON.stringify(rig))
    updateCameraRig(rig, 100, 100, 0, {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: -1,
      targetLerp: -1,
    })
    expect(rig).toEqual(before)
  })

  it('clamps a lerp factor above 1 so callers cannot overshoot the desired pose', () => {
    const rig = createCameraRig(0, 0, 0)
    updateCameraRig(rig, 10, -5, Math.PI / 2, {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: 5,
      targetLerp: 5,
    })
    const desired = desiredRigPose(10, -5, Math.PI / 2)
    expect(rig.position.x).toBeCloseTo(desired.position.x, 9)
    expect(rig.position.z).toBeCloseTo(desired.position.z, 9)
    expect(rig.target.x).toBeCloseTo(desired.target.x, 9)
    expect(rig.target.z).toBeCloseTo(desired.target.z, 9)
  })

  it('treats a non-finite lerp factor as 0 so a NaN tuning input cannot move the rig', () => {
    const rig = createCameraRig(0, 0, 0)
    const before: CameraRigState = JSON.parse(JSON.stringify(rig))
    updateCameraRig(rig, 100, 100, 0, {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: Number.NaN,
      targetLerp: Number.NaN,
    })
    expect(rig).toEqual(before)
  })

  it('repeated updates with lerp 1 keep the rig snapped to the latest car pose every frame', () => {
    const rig = createCameraRig(0, 0, 0)
    const params: CameraRigParams = {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: 1,
      targetLerp: 1,
    }
    updateCameraRig(rig, 5, 0, 0, params)
    updateCameraRig(rig, 10, 0, 0, params)
    updateCameraRig(rig, 15, 0, 0, params)
    const desired = desiredRigPose(15, 0, 0, params)
    expect(rig.position.x).toBeCloseTo(desired.position.x, 9)
    expect(rig.target.x).toBeCloseTo(desired.target.x, 9)
  })

  it('repeated updates with the default lerp converge toward the desired pose without overshooting', () => {
    const rig = createCameraRig(0, 0, 0)
    const carX = 50
    for (let i = 0; i < 200; i++) {
      updateCameraRig(rig, carX, 0, 0)
    }
    const desired = desiredRigPose(carX, 0, 0)
    expect(rig.position.x).toBeCloseTo(desired.position.x, 6)
    expect(rig.position.z).toBeCloseTo(desired.position.z, 6)
    expect(rig.target.x).toBeCloseTo(desired.target.x, 6)
    expect(rig.target.z).toBeCloseTo(desired.target.z, 6)
  })

  it('eases position and target with independent factors', () => {
    const rig = createCameraRig(0, 0, 0)
    const startPositionX = rig.position.x
    const startTargetX = rig.target.x
    updateCameraRig(rig, 100, 0, 0, {
      ...DEFAULT_CAMERA_RIG,
      positionLerp: 0.25,
      targetLerp: 0.5,
    })
    const desired = desiredRigPose(100, 0, 0)
    expect(rig.position.x).toBeCloseTo(
      startPositionX + (desired.position.x - startPositionX) * 0.25,
      9,
    )
    expect(rig.target.x).toBeCloseTo(
      startTargetX + (desired.target.x - startTargetX) * 0.5,
      9,
    )
  })

  it('preserves the y axis during lerps (height never drifts off the configured value)', () => {
    const rig = createCameraRig(0, 0, 0)
    const before = { positionY: rig.position.y, targetY: rig.target.y }
    updateCameraRig(rig, 5, 5, Math.PI / 4)
    expect(rig.position.y - before.positionY).toBeCloseTo(0, APPROX)
    expect(rig.target.y - before.targetY).toBeCloseTo(0, APPROX)
  })
})
