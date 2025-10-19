"use client"

import * as React from "react"

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
    // TODO: Implement save functionality
    console.log('Saving calibration settings:', { waterCalibration, soilCalibration })
  }

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
                  style={{ width: '100%', padding: '12px 18px', marginTop: 6 }}
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}