'use client'

import { useCallback } from 'react'
import {
  DEFAULT_TOUCH_MODE,
  TOUCH_MODE_OPTIONS,
  type TouchMode,
} from './touchSettings'

/**
 * Touch mode picker (REQ-042). Renders inside the pause menu so the
 * player picks a touch layout without leaving the drive surface; the
 * pause menu already owns the click surface so a tap on a radio
 * button does not compete with the integration loop's keydown
 * listeners.
 *
 * The panel is a controlled component: the parent owns the live
 * `TouchMode` state and the panel reports each change via `onChange`.
 * The parent decides whether to persist the change (REQ-042 uses
 * `saveControls` so the next session sees the same mode).
 *
 * The Reset button restores the v1 default (`dual-stick`) so a player
 * who flipped to single-stick can recover without clearing
 * localStorage.
 *
 * v1 ships two options: dual-stick (left thumb steers, right thumb
 * throttles / brakes) and single-stick (one stick steers, throttle is
 * automatic). The runtime input handler (REQ-035) is deferred to its
 * own slice; this panel only persists the choice.
 */
export function TouchSettingsPanel({
  mode,
  onChange,
  onReset,
}: {
  mode: TouchMode
  onChange: (next: TouchMode) => void
  onReset: () => void
}) {
  const handleSelect = useCallback(
    (next: TouchMode) => {
      if (next === mode) return
      onChange(next)
    },
    [mode, onChange],
  )

  return (
    <div
      data-testid="drive-touch-settings"
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
          Touch
        </span>
        <button
          type="button"
          data-testid="drive-touch-settings-reset"
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
      <div
        role="radiogroup"
        aria-label="Touch mode"
        data-testid="drive-touch-settings-options"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {TOUCH_MODE_OPTIONS.map((option) => {
          const selected = option.value === mode
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`drive-touch-settings-option-${option.value}`}
              data-selected={selected ? 'true' : 'false'}
              onClick={() => handleSelect(option.value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                padding: '8px 12px',
                fontFamily: 'inherit',
                textAlign: 'left',
                color: selected ? '#222' : '#f7f4ee',
                background: selected ? '#f7f4ee' : 'rgba(0, 0, 0, 0.25)',
                border: selected ? '1px solid #d6cfbf' : '1px solid #444',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              <span
                data-testid={`drive-touch-settings-option-${option.value}-label`}
                style={{ fontSize: 14, fontWeight: 600 }}
              >
                {option.label}
              </span>
              <span
                data-testid={`drive-touch-settings-option-${option.value}-description`}
                style={{ fontSize: 12, opacity: selected ? 0.75 : 0.7 }}
              >
                {option.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { DEFAULT_TOUCH_MODE }
