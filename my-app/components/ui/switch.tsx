"use client"

import * as React from "react"

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ checked, onCheckedChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className="switch-root"
      data-state={checked ? "checked" : "unchecked"}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: checked ? 'var(--fg)' : 'rgba(255,255,255,0.1)',
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 200ms ease',
        padding: 0,
      }}
    >
      <span
        className="switch-thumb"
        style={{
          display: 'block',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: checked ? 'var(--bg)' : 'var(--fg)',
          position: 'absolute',
          top: 2,
          left: checked ? 'calc(100% - 22px)' : 2,
          transition: 'left 200ms ease, background 200ms ease',
        }}
      />
    </button>
  )
}
