"use client"

import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { Switch } from "@/components/ui/switch"

function IconButton({ onClick, children, aria }: { onClick?: () => void; children: React.ReactNode; aria?: string }) {
  return (
    <button
      aria-label={aria}
      onClick={onClick}
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

  function adjustPump(by: number) {
    setPumpDurationMs((v) => Math.max(0, v + by))
  }

  function adjustLogging(by: number) {
    setLoggingIntervalMin((v) => Math.max(1, v + by))
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
    <div style={{ padding: 32 }}>
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
                  <IconButton onClick={() => adjustLogging(-5)} aria="decrease-logging"><Minus /></IconButton>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 56, fontWeight: 800, color: 'var(--fg)' }}>{loggingIntervalMin}</div>
                    <div className="muted-50" style={{ fontSize: 12 }}>minutes</div>
                  </div>
                  <IconButton onClick={() => adjustLogging(5)} aria="increase-logging"><Plus /></IconButton>
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
                  <input placeholder="Hostname" value={otaHostname} onChange={(e) => setOtaHostname(e.target.value)} className="settings-input" />
                </div>

                <div>
                  <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>OTA Password</div>
                  <input placeholder="Password" type="password" value={otaPassword} onChange={(e) => setOtaPassword(e.target.value)} className="settings-input" />
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--fg)', marginBottom: 8, fontSize: 15 }}>Device</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button className="ui-button" style={{ flex: 1 }}>Test Pump</button>
                  <button className="ui-button" style={{ flex: 1 }}>Restart</button>
                </div>
              </div>
            </div>

            <div className="settings-card-footer">
              <div>
                <button className="ui-button" style={{ width: '100%', padding: '12px 18px', marginTop: 6 }}>Save Settings</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
