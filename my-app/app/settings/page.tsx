"use client"

import * as React from "react"
import { Minus, Plus, Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import api from '../../lib/api'

function IconButton({ onClick, children, aria }: { onClick?: () => void; children: React.ReactNode; aria?: string }) {
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const isTouchDevice = React.useRef<boolean>(false)

  const startRepeat = () => {
    if (onClick && !isTouchDevice.current) {
      onClick() // Execute immediately on press
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          onClick()
        }, 100) // Repeat every 100ms while holding
      }, 500) // Wait 500ms before starting repeat
    }
  }

  const stopRepeat = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const handleTouchStart = () => {
    isTouchDevice.current = true
    if (onClick) {
      onClick() // Execute once on touch start
    }
  }

  const handleTouchEnd = () => {
    // Do nothing - just single tap execution
  }

  const handleClick = (e: React.MouseEvent) => {
    // Only handle click if it's not from a touch device
    if (!isTouchDevice.current && onClick) {
      onClick()
    }
  }

  return (
    <button
      aria-label={aria}
      onMouseDown={startRepeat}
      onMouseUp={stopRepeat}
      onMouseLeave={stopRepeat}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      className="icon-btn" 
      style={{ width: 28, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  )
}



export default function SettingsPage() {
  const [autoWaterEnabled, setAutoWaterEnabled] = React.useState(true)
  const [wateringThreshold, setWateringThreshold] = React.useState(40)
  const [pumpDurationMs, setPumpDurationMs] = React.useState(3500)
  const [pumpPwmDuty, setPumpPwmDuty] = React.useState(30)
  const [deadzoneEnabled, setDeadzoneEnabled] = React.useState(true)
  // Left handle: PM hours (12-23, slider range 0-11 maps to 12:00-23:00)
  // Right handle: AM hours (0-11, slider range 0-11 maps to 00:00-11:00 next day)
  // This represents the overnight "do not disturb" period
  const [deadzonePMHour, setDeadzonePMHour] = React.useState(9) // 9 = 21:00 (12+9)
  const [deadzoneAMHour, setDeadzoneAMHour] = React.useState(7) // 7 = 07:00
  const [loggingIntervalMin, setLoggingIntervalMin] = React.useState(40)
  const [sensorUpdateIntervalSec, setSensorUpdateIntervalSec] = React.useState(30)
  const [otaHostname, setOtaHostname] = React.useState('')
  const [otaPassword, setOtaPassword] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saveSuccess, setSaveSuccess] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const [testPumpRunning, setTestPumpRunning] = React.useState(false)
  const [testPumpSuccess, setTestPumpSuccess] = React.useState(false)
  const [testPumpError, setTestPumpError] = React.useState<string | null>(null)

  const [restarting, setRestarting] = React.useState(false)

  function adjustPump(by: number) {
    setPumpDurationMs((v) => Math.max(0, Math.min(10000, v + by)))
  }

  function adjustLogging(by: number) {
    setLoggingIntervalMin((v) => Math.max(1, Math.min(120, v + by)))
  }

  // helper to set range background gradient: selected part is var(--fg), remainder is var(--bg)
  function updateRangeBg(el: HTMLInputElement | null) {
    if (!el) return
    const min = Number(el.min || 0)
    const max = Number(el.max || 100)
    const val = Number(el.value)
    const pct = ((val - min) / (max - min)) * 100
    el.style.background = `linear-gradient(90deg, var(--fg) ${pct}%, var(--bg) ${pct}%)`
  }

  // refs for ranges
  const wateringRef = React.useRef<HTMLInputElement | null>(null)
  const pumpRef = React.useRef<HTMLInputElement | null>(null)
  const speedRef = React.useRef<HTMLInputElement | null>(null)
  const deadzoneRef = React.useRef<HTMLInputElement | null>(null)
  const deadzoneRef2 = React.useRef<HTMLInputElement | null>(null)
  const loggingRef = React.useRef<HTMLInputElement | null>(null)
  const sensorRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    updateRangeBg(wateringRef.current)
    updateRangeBg(pumpRef.current)
    updateRangeBg(speedRef.current)
    // deadzone uses double-range container background, don't paint per-input
    updateRangeBg(loggingRef.current)
    updateRangeBg(sensorRef.current)
    const container = document.querySelector('.double-range') as HTMLDivElement | null
    updateDoubleRangeBg(container, deadzoneRef.current, deadzoneRef2.current)
  }, [wateringThreshold, pumpDurationMs, pumpPwmDuty, deadzonePMHour, deadzoneAMHour, loggingIntervalMin, sensorUpdateIntervalSec])

  // load settings from device
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const s = await api.getSettings()
        if (!mounted) return
        if (s.autoWaterEnabled != null) setAutoWaterEnabled(Boolean(s.autoWaterEnabled))
        if (s.wateringThreshold != null) setWateringThreshold(Math.round(s.wateringThreshold))
        if (s.pumpDurationMs != null) setPumpDurationMs(s.pumpDurationMs)
        if (s.pumpPwmDuty != null) setPumpPwmDuty(s.pumpPwmDuty)
        if (s.deadzoneEnabled != null) setDeadzoneEnabled(Boolean(s.deadzoneEnabled))
        if (s.deadzoneStartHour != null) {
          const start = s.deadzoneStartHour >= 12 ? s.deadzoneStartHour - 12 : s.deadzoneStartHour
          setDeadzonePMHour(start % 12)
        }
        if (s.deadzoneEndHour != null) {
          setDeadzoneAMHour(s.deadzoneEndHour % 12)
        }
        if (s.loggingIntervalMs != null) setLoggingIntervalMin(Math.max(1, Math.round(s.loggingIntervalMs / 60000)))
        if (s.sensorUpdateInterval != null) setSensorUpdateIntervalSec(s.sensorUpdateInterval)
        if (s.otaHostname) setOtaHostname(s.otaHostname)
        if (s.otaPassword) setOtaPassword(s.otaPassword)
      } catch (err) {
        console.warn('load settings failed', err)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  function updateDoubleRangeBg(container: HTMLDivElement | null, a: HTMLInputElement | null, b: HTMLInputElement | null) {
    if (!container || !a || !b) return
    // Left input controls position 0-50% (hours 12-23)
    // Right input controls position 50-100% (hours 0-11)
    const pmHour = deadzonePMHour + 12  // 0-11 becomes 12-23
    const amHour = deadzoneAMHour       // 0-11 stays 0-11
    
    // Map PM hour (12-23) to left half of slider (0-50%)
    const pmPct = (deadzonePMHour / 11) * 50
    // Map AM hour (0-11) to right half of slider (50-100%)
    const amPct = 50 + (deadzoneAMHour / 11) * 50
    
    // Paint: background up to PM start, then white from PM start through midnight wrap to AM end, then background
    // Split at 50%: left half is PM (12-23), right half is AM (0-11)
    container.style.background = `linear-gradient(90deg, var(--bg) 0%, var(--bg) ${pmPct}%, var(--fg) ${pmPct}%, var(--fg) 50%, var(--fg) 50%, var(--fg) ${amPct}%, var(--bg) ${amPct}%, var(--bg) 100%)`
  }

  return (
    <div className="settings-page-container">
      <div className="settings-grid">
        <div className="card settings-card">
          <div className="settings-card-inner" style={{ width: '100%' }}>
            <div className="settings-card-body" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Automated Watering</div>
              <Switch checked={autoWaterEnabled} onCheckedChange={setAutoWaterEnabled} />
            </div>

            <div>
              <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Watering Treshold</div>
              <div style={{ textAlign: 'center', marginBottom: 8, color: 'var(--fg)', fontSize: 15 }}>{wateringThreshold}%</div>
              <div>
                <input
                  ref={wateringRef}
                  type="range"
                  min={0}
                  max={100}
                  value={wateringThreshold}
                  onChange={(e) => { setWateringThreshold(Number(e.target.value)); updateRangeBg(e.target) }}
                  onInput={(e) => updateRangeBg(e.currentTarget as HTMLInputElement)}
                />
              </div>
            </div>

            <div>
              <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Pump ON Duration</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <IconButton onClick={() => adjustPump(-100)} aria="decrease-pump">
                  <Minus />
                </IconButton>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 56, fontWeight: 800, color: 'var(--fg)' }}>{pumpDurationMs}</div>
                  <div className="muted-50" style={{ fontSize: 12 }}>milliseconds</div>
                </div>
                <IconButton onClick={() => adjustPump(100)} aria="increase-pump">
                  <Plus />
                </IconButton>
              </div>
              <input
                ref={pumpRef}
                type="range"
                min={0}
                max={10000}
                value={pumpDurationMs}
                className="picker-slider"
                onChange={(e) => { setPumpDurationMs(Number(e.target.value)); updateRangeBg(e.target) }}
                onInput={(e) => updateRangeBg(e.currentTarget as HTMLInputElement)}
              />
            </div>

            <div>
              <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Pump Speed</div>
              <div style={{ textAlign: 'center', marginBottom: 8, color: 'var(--fg)', fontSize: 15 }}>{pumpPwmDuty}%</div>
              <div>
                <input
                  ref={speedRef}
                  type="range"
                  min={0}
                  max={100}
                  value={pumpPwmDuty}
                  onChange={(e) => { setPumpPwmDuty(Number(e.target.value)); updateRangeBg(e.target) }}
                  onInput={(e) => updateRangeBg(e.currentTarget as HTMLInputElement)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, color: 'var(--fg)' }}>Pump Deadzone</div>
              <Switch checked={deadzoneEnabled} onCheckedChange={setDeadzoneEnabled} />
            </div>

            <div>
              <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Range</div>
              <div style={{ textAlign: 'center', marginBottom: 8, color: 'var(--fg)', fontSize: 15 }}>
                {String(deadzonePMHour + 12).padStart(2, '0')}:00 - {String(deadzoneAMHour).padStart(2, '0')}:00
              </div>
              <div className="double-range" ref={(el) => { if (el) updateDoubleRangeBg(el, deadzoneRef.current, deadzoneRef2.current) }}>
                <input
                  ref={deadzoneRef}
                  type="range"
                  min={0}
                  max={11}
                  value={deadzonePMHour}
                  style={{ 
                    width: '50%',
                    left: '0',
                    right: 'auto'
                  }}
                  onPointerDown={(e) => {
                    const target = e.currentTarget as HTMLInputElement
                    try { target.setPointerCapture((e as any).pointerId) } catch (err) {}
                    if (deadzoneRef.current && deadzoneRef2.current) {
                      deadzoneRef.current.style.zIndex = '3'
                      deadzoneRef2.current.style.zIndex = '2'
                    }
                  }}
                  onPointerUp={(e) => {
                    const target = e.currentTarget as HTMLInputElement
                    try { target.releasePointerCapture((e as any).pointerId) } catch (err) {}
                    if (deadzoneRef.current && deadzoneRef2.current) {
                      deadzoneRef.current.style.zIndex = '2'
                      deadzoneRef2.current.style.zIndex = '3'
                    }
                  }}
                  onChange={(e) => {
                    let v = Number(e.target.value)
                    setDeadzonePMHour(v)
                    updateDoubleRangeBg(e.currentTarget.parentElement as HTMLDivElement, e.currentTarget, deadzoneRef2.current)
                  }}
                  onInput={(e) => {
                    let v = Number(e.currentTarget.value)
                    setDeadzonePMHour(v)
                    updateDoubleRangeBg(e.currentTarget.parentElement as HTMLDivElement, e.currentTarget, deadzoneRef2.current)
                  }}
                />
                <input
                  ref={deadzoneRef2}
                  type="range"
                  min={0}
                  max={11}
                  value={deadzoneAMHour}
                  style={{ 
                    width: '50%',
                    left: '50%',
                    right: 'auto'
                  }}
                  onPointerDown={(e) => {
                    const target = e.currentTarget as HTMLInputElement
                    try { target.setPointerCapture((e as any).pointerId) } catch (err) {}
                    if (deadzoneRef.current && deadzoneRef2.current) {
                      deadzoneRef2.current.style.zIndex = '3'
                      deadzoneRef.current.style.zIndex = '2'
                    }
                  }}
                  onPointerUp={(e) => {
                    const target = e.currentTarget as HTMLInputElement
                    try { target.releasePointerCapture((e as any).pointerId) } catch (err) {}
                    if (deadzoneRef.current && deadzoneRef2.current) {
                      deadzoneRef2.current.style.zIndex = '2'
                      deadzoneRef.current.style.zIndex = '3'
                    }
                  }}
                  onChange={(e) => {
                    let v = Number(e.target.value)
                    setDeadzoneAMHour(v)
                    updateDoubleRangeBg(e.currentTarget.parentElement as HTMLDivElement, deadzoneRef.current, e.currentTarget)
                  }}
                  onInput={(e) => {
                    let v = Number(e.currentTarget.value)
                    setDeadzoneAMHour(v)
                    updateDoubleRangeBg(e.currentTarget.parentElement as HTMLDivElement, deadzoneRef.current, e.currentTarget)
                  }}
                />
              </div>
            </div>
            </div>
            <div className="settings-card-footer">
              {/* footer left empty for visual spacing */}
            </div>
          </div>
        </div>

        <div className="card settings-card">
          <div className="settings-card-inner" style={{ width: '100%' }}>
            <div className="settings-card-body" style={{ width: '100%' }}>
              <div>
                  <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Logging Interval</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <IconButton onClick={() => adjustLogging(-1)} aria="decrease-logging"><Minus /></IconButton>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 56, fontWeight: 800, color: 'var(--fg)' }}>{loggingIntervalMin}</div>
                    <div className="muted-50" style={{ fontSize: 12 }}>minutes</div>
                  </div>
                  <IconButton onClick={() => adjustLogging(1)} aria="increase-logging"><Plus /></IconButton>
                </div>
                <input
                  ref={loggingRef}
                  type="range"
                  min={1}
                  max={120}
                  value={loggingIntervalMin}
                  className="picker-slider"
                  onChange={(e) => { setLoggingIntervalMin(Number(e.target.value)); updateRangeBg(e.target) }}
                  onInput={(e) => updateRangeBg(e.currentTarget as HTMLInputElement)}
                />
              </div>

              <div>
                <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Sensor Update Interval</div>
                <div style={{ textAlign: 'center', marginBottom: 8, color: 'var(--fg)', fontSize: 15 }}>{sensorUpdateIntervalSec}s</div>
                <div>
                  <input
                    ref={sensorRef}
                    type="range"
                    min={1}
                    max={300}
                    value={sensorUpdateIntervalSec}
                    onChange={(e) => { setSensorUpdateIntervalSec(Number(e.target.value)); updateRangeBg(e.target) }}
                    onInput={(e) => updateRangeBg(e.currentTarget as HTMLInputElement)}
                  />
                </div>
              </div>

              <div className="ota-group">
                <div>
                  <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>OTA Hostname</div>
                  <input placeholder="Hostname" value={otaHostname} onChange={(e) => setOtaHostname(e.target.value)} className="settings-input" autoFocus={false} />
                </div>

                <div>
                  <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>OTA Password</div>
                  <input placeholder="Password" type="password" value={otaPassword} onChange={(e) => setOtaPassword(e.target.value)} className="settings-input" />
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Device</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button
                      className="ui-button"
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      onClick={async () => {
                        setTestPumpRunning(true)
                        setTestPumpError(null)
                        try {
                          await api.postPump('start', pumpDurationMs)
                          setTestPumpSuccess(true)
                          setTimeout(() => setTestPumpSuccess(false), 3000)
                        } catch (err: any) {
                          console.error('test pump failed', err)
                          setTestPumpError('Failed')
                          setTimeout(() => setTestPumpError(null), 3000)
                        } finally {
                          setTestPumpRunning(false)
                        }
                      }}
                      disabled={testPumpRunning || restarting}
                    >
                      {testPumpRunning ? 'Running…' : testPumpSuccess ? <><Check size={14} /> Done</> : testPumpError ? testPumpError : 'Test Pump'}
                    </button>

                    <button
                      className="ui-button"
                      style={{ flex: 1 }}
                      onClick={async () => {
                        // Attempt to restart device via API
                        setRestarting(true)
                        try {
                          await api.postRestart()
                          // The device will restart; keep button disabled and show restart text
                        } catch (err) {
                          console.error('restart failed', err)
                          // Allow re-try
                          setRestarting(false)
                        }
                      }}
                      disabled={restarting}
                    >
                      {restarting ? 'Restarting…' : 'Restart'}
                    </button>
                </div>
              </div>
            </div>

            <div className="settings-card-footer">
              <div>
                <button
                  className="ui-button"
                  style={{ width: '100%', padding: '12px 18px', marginTop: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={async () => {
                    setSaving(true)
                    setSaveError(null)
                    try {
                      const payload: any = {
                        autoWaterEnabled,
                        wateringThreshold,
                        pumpDurationMs,
                        pumpPwmDuty,
                        deadzoneEnabled,
                        deadzoneStartHour: (deadzonePMHour + 12) % 24,
                        deadzoneEndHour: deadzoneAMHour % 24,
                        loggingIntervalMs: loggingIntervalMin * 60000,
                        sensorUpdateInterval: sensorUpdateIntervalSec,
                        otaHostname,
                        otaPassword,
                      }
                      await api.postSettings(payload)
                      setSaveSuccess(true)
                      setTimeout(() => setSaveSuccess(false), 3000)
                    } catch (err: any) {
                      console.error(err)
                      setSaveError('Save failed')
                      setTimeout(() => setSaveError(null), 3000)
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  {saving ? 'Saving…' : saveSuccess ? <><Check size={16} /> Saved</> : saveError ? saveError : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
