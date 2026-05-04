'use client'

import { useCallback } from 'react'
import {
  CAMERA_SLIDER_BOUNDS,
  type CameraSliderBound,
} from './cameraSettings'
import {
  DEFAULT_CAMERA_TUNING,
  type CameraTuning,
} from '@/lib/controlsPersistence'

/**
 * Camera tuning panel (REQ-040). Renders inside the pause menu so the
 * player tunes the chase rig without leaving the drive surface; the
 * pause menu already owns the click surface so a slider drag does not
 * compete with the integration loop's keydown listeners.
 *
 * The panel is a controlled component: the parent owns the live
 * `CameraTuning` state (also held in a ref the integration effect
 * reads each frame) and the panel reports each slider change via
 * `onChange`. The parent decides whether to persist the change (REQ-040
 * uses `saveControls` so the next session sees the same tuning).
 *
 * The Reset button restores the v1 defaults from
 * `DEFAULT_CAMERA_TUNING` so a player who tuned past usability can
 * recover without clearing localStorage.
 *
 * v1 ships five sliders: height, distance, lookAhead, followSpeed,
 * fov. The bounds and steps come from `CAMERA_SLIDER_BOUNDS` so a
 * future rebalance updates the panel and the clamp helper in one
 * place.
 */
export function CameraSettingsPanel({
  tuning,
  onChange,
  onReset,
}: {
  tuning: CameraTuning
  onChange: (next: CameraTuning) => void
  onReset: () => void
}) {
  const handleSliderChange = useCallback(
    (field: keyof CameraTuning, raw: string) => {
      const value = Number.parseFloat(raw)
      if (!Number.isFinite(value)) return
      onChange({ ...tuning, [field]: value })
    },
    [tuning, onChange],
  )

  return (
    <div
      data-testid="drive-camera-settings"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 16px',
        marginTop: 4,
        background: 'rgba(34, 34, 34, 0.85)',
        border: '1px solid #444',
        borderRadius: 6,
        color: '#f7f4ee',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        minWidth: 320,
        maxWidth: 420,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12,
            opacity: 0.7,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Camera
        </span>
        <button
          type="button"
          data-testid="drive-camera-settings-reset"
          onClick={onReset}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            fontFamily: 'inherit',
            color: '#222',
            background: '#f7f4ee',
            border: '1px solid #d6cfbf',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
      {(Object.keys(CAMERA_SLIDER_BOUNDS) as Array<keyof CameraTuning>).map(
        (field) => {
          const bound: CameraSliderBound = CAMERA_SLIDER_BOUNDS[field]
          const value = tuning[field]
          const decimals =
            bound.step < 1
              ? Math.max(0, -Math.floor(Math.log10(bound.step)))
              : 0
          return (
            <label
              key={field}
              data-testid={`drive-camera-settings-${field}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span style={{ opacity: 0.85 }}>{bound.label}</span>
                <span
                  data-testid={`drive-camera-settings-${field}-value`}
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    opacity: 0.95,
                  }}
                >
                  {value.toFixed(decimals)}
                </span>
              </span>
              <input
                type="range"
                data-testid={`drive-camera-settings-${field}-slider`}
                min={bound.min}
                max={bound.max}
                step={bound.step}
                value={value}
                onChange={(event) =>
                  handleSliderChange(field, event.target.value)
                }
                aria-label={bound.label}
                style={{
                  width: '100%',
                  accentColor: '#f7f4ee',
                }}
              />
            </label>
          )
        },
      )}
    </div>
  )
}

export { DEFAULT_CAMERA_TUNING }
