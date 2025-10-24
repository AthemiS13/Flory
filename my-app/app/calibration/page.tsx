"use client"

import * as React from "react"
import api from '../../lib/api'
import { Check } from 'lucide-react'

export default function CalibrationPage() {
  const [waterCalibration, setWaterCalibration] = React.useState({
    0: 0,
    20: 0,
    40: 0,
    60: 0,
    80: 0,
    100: 0
  })

  const [soilCalibration, setSoilCalibration] = React.useState({
    dry: 0,
    normal: 0,
    wet: 0
  })

  const [currentReadings, setCurrentReadings] = React.useState({
    waterRaw: 2304,
    waterPercentage: 50,
    soilRaw: 2304,
    soilPercentage: 50,
    temperature: 23,
    humidity: 50
  })

  const captureWaterLevel = (percentage: number) => {
    setWaterCalibration(prev => ({
      ...prev,
      [percentage]: currentReadings.waterRaw
    }))
  }

  const captureSoilMoisture = (setting: string) => {
    setSoilCalibration(prev => ({
      ...prev,
      [setting]: currentReadings.soilRaw
    }))
  }

  const saveSettings = () => {
    // send minimal calibration payload back to device
    const payload: any = {}
    // map waterCalibration into expected `water_map` format if possible
  const keys = [0,20,40,60,80,100]
  const map = keys.map(k => ({ raw: Number((waterCalibration as any)[k]), percent: k }))
    payload.water_map = map
    // soil calibration
    if (soilCalibration.dry) payload.soilDryRaw = soilCalibration.dry
    if (soilCalibration.normal) payload.soilBaseline = soilCalibration.normal
    if (soilCalibration.wet) payload.soilWetRaw = soilCalibration.wet
    // post to settings endpoint (calibration lives under same prefs)
    setSaving(true)
    setSaveError(null)
    api.postCalibration(payload).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }).catch(err => {
      console.error('Calibration save failed', err)
      setSaveError('Save failed')
      setTimeout(() => setSaveError(null), 3000)
    }).finally(() => setSaving(false))
  }

  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  // poll status for live percentages and temp/humidity
  React.useEffect(() => {
    let mounted = true
    let timer: any = null
    async function poll() {
      try {
        // Fetch live status (percentages) and calibration (raw last readings) in parallel
        const [s, c] = await Promise.all([api.getStatus(), api.getCalibration()])
        if (!mounted) return
        setCurrentReadings((r) => ({
          ...r,
          waterPercentage: s && typeof s.water_percent === 'number' ? Math.round(s.water_percent) : r.waterPercentage,
          soilPercentage: s && typeof s.soil_percent === 'number' ? Math.round(s.soil_percent) : r.soilPercentage,
          temperature: s && typeof s.temperature === 'number' ? s.temperature : r.temperature,
          humidity: s && typeof s.humidity === 'number' ? s.humidity : r.humidity,
          waterRaw: c && typeof c.last_water_raw === 'number' ? c.last_water_raw : r.waterRaw,
          soilRaw: c && typeof c.last_soil_raw === 'number' ? c.last_soil_raw : r.soilRaw,
        }))
      } catch (err) {
        // ignore polling errors
      } finally {
        if (mounted) timer = setTimeout(poll, 3000)
      }
    }
    poll()
    return () => { mounted = false; if (timer) clearTimeout(timer) }
  }, [])

  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const c = await api.getCalibration()
        if (!mounted) return
        // map values into UI
        if (c.water_map && c.water_map.length) {
          const wc: any = {}
          c.water_map.forEach((it) => { wc[Math.round(it.percent)] = it.raw })
          setWaterCalibration((prev) => ({ ...prev, ...wc }))
        }
  if (c.soilDryRaw != null) setSoilCalibration((s) => ({ ...s, dry: c.soilDryRaw as number }))
  if (c.soilWetRaw != null) setSoilCalibration((s) => ({ ...s, wet: c.soilWetRaw as number }))
  if (c.soilBaseline != null) setSoilCalibration((s) => ({ ...s, normal: c.soilBaseline as number }))
  if (c.last_water_raw != null) setCurrentReadings((r) => ({ ...r, waterRaw: c.last_water_raw as number }))
  if (c.last_soil_raw != null) setCurrentReadings((r) => ({ ...r, soilRaw: c.last_soil_raw as number }))
      } catch (err) {
        console.warn('load calibration failed', err)
      }
    }
    load()
    return () => { mounted = false }
  }, [])


  return (
    <div className="settings-page-container">
      <div className="settings-grid">
        {/* Water Level Calibration Card */}
        <div className="card settings-card">
          <div className="settings-card-inner" style={{ width: '100%' }}>
            <div className="settings-card-body" style={{ width: '100%' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
                Water Level Calibration
              </div>

              {/* Calibration Table */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr 1fr', 
                  border: '1px solid var(--card-stroke)',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'rgba(229, 229, 229, 0.5)', 
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--card-stroke)',
                    textAlign: 'left'
                  }}>
                    Percentage
                  </div>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'rgba(229, 229, 229, 0.5)', 
                    textAlign: 'left',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--card-stroke)'
                  }}>
                    Raw Value
                  </div>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'rgba(229, 229, 229, 0.5)', 
                    textAlign: 'left',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--card-stroke)'
                  }}>
                    Action
                  </div>
                  
                  {[0, 20, 40, 60, 80, 100].map((percentage, index) => (
                    <React.Fragment key={percentage}>
                      <div style={{ 
                        fontSize: 14, 
                        color: 'var(--fg)', 
                        padding: '10px 16px',
                        borderBottom: index === 5 ? 'none' : '1px solid var(--card-stroke)',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        {percentage}%
                      </div>
                      <div style={{ 
                        fontSize: 14, 
                        color: 'var(--fg)', 
                        textAlign: 'left', 
                        padding: '10px 16px',
                        borderBottom: index === 5 ? 'none' : '1px solid var(--card-stroke)',
                        display: 'flex', 
                        alignItems: 'center'
                      }}>
                        {waterCalibration[percentage as keyof typeof waterCalibration]}
                      </div>
                      <div style={{ 
                        padding: '10px 16px',
                        borderBottom: index === 5 ? 'none' : '1px solid var(--card-stroke)',
                        display: 'flex', 
                        alignItems: 'center'
                      }}>
                        <button 
                          onClick={() => captureWaterLevel(percentage)}
                          className="ui-button"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                        >
                          Capture
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Current Readings */}
              <div>
                <div style={{ fontSize: 14, color: 'var(--fg)', marginBottom: 8 }}>
                  Raw Value: {currentReadings.waterRaw}
                </div>
                <div style={{ fontSize: 14, color: 'var(--fg)' }}>
                  Percentage: {currentReadings.waterPercentage}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Soil Moisture Calibration Card */}
        <div className="card settings-card">
          <div className="settings-card-inner" style={{ width: '100%' }}>
            <div className="settings-card-body" style={{ width: '100%' }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>
                Soil Moisture Calibration
              </div>

              {/* Calibration Table */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr 1fr', 
                  border: '1px solid var(--card-stroke)',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'rgba(229, 229, 229, 0.5)', 
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--card-stroke)',
                    textAlign: 'left'
                  }}>
                    Setting
                  </div>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'rgba(229, 229, 229, 0.5)', 
                    textAlign: 'left',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--card-stroke)'
                  }}>
                    Raw Value
                  </div>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: 'rgba(229, 229, 229, 0.5)', 
                    textAlign: 'left',
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--card-stroke)'
                  }}>
                    Action
                  </div>
                  
                  {[
                    { key: 'dry', label: 'Dry Soil' },
                    { key: 'normal', label: 'Normal Soil' },
                    { key: 'wet', label: 'Wet Soil' }
                  ].map(({ key, label }, index) => (
                    <React.Fragment key={key}>
                      <div style={{ 
                        fontSize: 14, 
                        color: 'var(--fg)', 
                        padding: '10px 16px',
                        borderBottom: index === 2 ? 'none' : '1px solid var(--card-stroke)',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        {label}
                      </div>
                      <div style={{ 
                        fontSize: 14, 
                        color: 'var(--fg)', 
                        textAlign: 'left', 
                        padding: '10px 16px',
                        borderBottom: index === 2 ? 'none' : '1px solid var(--card-stroke)',
                        display: 'flex', 
                        alignItems: 'center'
                      }}>
                        {soilCalibration[key as keyof typeof soilCalibration]}
                      </div>
                      <div style={{ 
                        padding: '10px 16px',
                        borderBottom: index === 2 ? 'none' : '1px solid var(--card-stroke)',
                        display: 'flex', 
                        alignItems: 'center'
                      }}>
                        <button 
                          onClick={() => captureSoilMoisture(key)}
                          className="ui-button"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                        >
                          Capture
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Current Readings */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--fg)', marginBottom: 8 }}>
                  Raw Value: {currentReadings.soilRaw}
                </div>
                <div style={{ fontSize: 14, color: 'var(--fg)', marginBottom: 8 }}>
                  Percentage: {currentReadings.soilPercentage}%
                </div>
                <div style={{ fontSize: 14, color: 'var(--fg)', marginBottom: 8 }}>
                  Temperature: {currentReadings.temperature}°C
                </div>
                <div style={{ fontSize: 14, color: 'var(--fg)' }}>
                  Humidity: {currentReadings.humidity}%
                </div>
              </div>
            </div>

            <div className="settings-card-footer">
              <div>
                <button 
                  onClick={saveSettings}
                  className="ui-button" 
                  style={{ width: '100%', padding: '12px 18px', marginTop: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : saved ? <><Check size={14} /> Saved</> : saveError ? saveError : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}