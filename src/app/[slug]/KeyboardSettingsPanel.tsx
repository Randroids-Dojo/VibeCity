'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_KEY_BINDINGS,
  DRIVE_ACTION_OPTIONS,
  bindingsByAction,
  clearBinding,
  isRebindableKeyCode,
  keyCodeDisplayLabel,
  setBinding,
  type DriveActionName,
  type KeyBindings,
} from './keyboardSettings'

/**
 * Keyboard rebinding panel (REQ-041). Renders inside the pause menu so
 * the player rebinds drive controls without leaving the drive surface;
 * the pause menu already owns the click surface so a rebind capture
 * does not compete with the integration loop's keydown listeners.
 *
 * The panel is a controlled component: the parent owns the live
 * `KeyBindings` map (also held in a ref the integration effect reads
 * each frame so a rebind immediately takes effect on resume) and the
 * panel reports each change via `onChange`. The parent decides whether
 * to persist the change (REQ-041 uses `saveControls` so the next
 * session sees the same bindings).
 *
 * The Reset button restores the v1 defaults from
 * `DEFAULT_KEY_BINDINGS` so a player who rebound past usability can
 * recover without clearing localStorage.
 *
 * v1 ships four rows (one per drive action). Each row lists the
 * currently-bound codes (translated to short display labels via
 * `keyCodeDisplayLabel`) and exposes two buttons: a Rebind capture
 * that listens for the next bound key and adds it to the action's
 * binding list, and a Clear button that removes every binding for the
 * action. The rebind capture replaces any previous binding of the
 * pressed key (so two actions cannot fight over the same code).
 *
 * The capture uses the panel's own keydown listener attached to
 * `window` while the capture is active; the listener is removed on
 * commit, on Escape (cancel), or on unmount so a stray keypress after
 * the capture does not poke the bindings.
 */
export function KeyboardSettingsPanel({
  bindings,
  onChange,
  onReset,
}: {
  bindings: KeyBindings
  onChange: (next: KeyBindings) => void
  onReset: () => void
}) {
  const [capturingAction, setCapturingAction] =
    useState<DriveActionName | null>(null)

  const beginCapture = useCallback((action: DriveActionName) => {
    setCapturingAction(action)
  }, [])

  const cancelCapture = useCallback(() => {
    setCapturingAction(null)
  }, [])

  const handleClear = useCallback(
    (action: DriveActionName) => {
      const grouped = bindingsByAction(bindings)
      const codes = grouped[action]
      if (codes.length === 0) return
      let next: KeyBindings = { ...bindings }
      for (const code of codes) {
        next = clearBinding(next, code)
      }
      onChange(next)
    },
    [bindings, onChange],
  )

  // Capture the next bindable key while the row is in capture mode.
  // The panel listens on `window` (rather than on the row button) so a
  // player can press a key without first focusing the button; the
  // pause menu already gates the integration loop's listeners so a
  // capture press does not double-fire.
  useEffect(() => {
    if (capturingAction === null) return
    const handler = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault()
        setCapturingAction(null)
        return
      }
      if (!isRebindableKeyCode(event.code)) return
      event.preventDefault()
      const next = setBinding(bindings, event.code, capturingAction)
      onChange(next)
      setCapturingAction(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [capturingAction, bindings, onChange])

  const grouped = bindingsByAction(bindings)

  return (
    <div
      data-testid="drive-keyboard-settings"
      data-capturing={capturingAction ?? 'none'}
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
          Keyboard
        </span>
        <button
          type="button"
          data-testid="drive-keyboard-settings-reset"
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
        data-testid="drive-keyboard-settings-rows"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {DRIVE_ACTION_OPTIONS.map((option) => {
          const codes = grouped[option.action]
          const capturing = capturingAction === option.action
          const labels = codes.map(keyCodeDisplayLabel)
          const codesText = labels.length === 0 ? 'Unbound' : labels.join(', ')
          return (
            <div
              key={option.action}
              data-testid={`drive-keyboard-settings-row-${option.action}`}
              data-bound-codes={codes.join(' ')}
              data-bound-labels={labels.join(' ')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '8px 12px',
                background: capturing ? '#f7f4ee' : 'rgba(0, 0, 0, 0.25)',
                border: capturing ? '1px solid #d6cfbf' : '1px solid #444',
                color: capturing ? '#222' : '#f7f4ee',
                borderRadius: 4,
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
                <span
                  data-testid={`drive-keyboard-settings-row-${option.action}-label`}
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {option.label}
                </span>
                <span
                  data-testid={`drive-keyboard-settings-row-${option.action}-codes`}
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    opacity: 0.95,
                  }}
                >
                  {capturing ? 'Press a key...' : codesText}
                </span>
              </div>
              <span
                data-testid={`drive-keyboard-settings-row-${option.action}-description`}
                style={{ fontSize: 12, opacity: capturing ? 0.75 : 0.7 }}
              >
                {option.description}
              </span>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                {capturing ? (
                  <button
                    type="button"
                    data-testid={`drive-keyboard-settings-row-${option.action}-cancel`}
                    onClick={cancelCapture}
                    style={buttonStyle(true)}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`drive-keyboard-settings-row-${option.action}-rebind`}
                    onClick={() => beginCapture(option.action)}
                    style={buttonStyle(false)}
                  >
                    Rebind
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`drive-keyboard-settings-row-${option.action}-clear`}
                  onClick={() => handleClear(option.action)}
                  disabled={codes.length === 0}
                  style={{
                    ...buttonStyle(capturing),
                    opacity: codes.length === 0 ? 0.5 : 1,
                    cursor: codes.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buttonStyle(invertedRow: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    color: invertedRow ? '#f7f4ee' : '#222',
    background: invertedRow ? '#222' : '#f7f4ee',
    border: invertedRow ? '1px solid #444' : '1px solid #d6cfbf',
    borderRadius: 4,
    cursor: 'pointer',
  }
}

export { DEFAULT_KEY_BINDINGS }
