"use client"

import * as React from 'react'
import ChartAreaInteractive from '../components/charts/ChartAreaInteractive.client'
import ChartBarDefault from '../components/charts/ChartBarDefault.client'
import ChartTempHum from '../components/charts/ChartTempHum.client'
import Card from '../components/Card'
import Gauge from '../components/Gauge.client'
import api from '../lib/api'

export default function Home(){
  const [status, setStatus] = React.useState({
    soil_percent: 0,
    water_percent: 0,
    temperature: 0,
    humidity: 0,
    pump_on: false,
  })

  React.useEffect(() => {
    let mounted = true
    async function load(){
      try {
        const s = await api.getStatus()
        if (mounted) setStatus(s)
      } catch (err) {
        // swallow for now
        console.warn('status fetch failed', err)
      }
    }

    load()
    const t = setInterval(load, 5000)
    return () => { mounted = false; clearInterval(t) }
  }, [])

  return (
    <div className="main-grid">
      <div className="card" style={{borderRadius:22}}>
        <div style={{fontSize:44,fontWeight:800,color:'var(--fg)'}}>Flory</div>
      </div>

      <div className="card">
        <Gauge value={Math.round(status.water_percent)} label="Water Level" color="var(--graph-2)" />
      </div>

      <div className="col-span-2">
        <ChartBarDefault />
      </div>

      <div className="card">
        <div>
          <div style={{fontSize:32,fontWeight:700}}>{Math.round(status.temperature)}°C</div>
          <div className="stat-label">Temperature</div>
        </div>
      </div>

      <div className="card">
        <div>
          <div style={{fontSize:32,fontWeight:700}}>{Math.round(status.humidity)}%</div>
          <div className="stat-label">Humidity</div>
        </div>
      </div>

        <div className="card">
          <div>
            <div style={{fontSize:32,fontWeight:700}}>{status.pump_on ? 'ON' : 'OFF'}</div>
            <div className="stat-label">Pump</div>
          </div>
        </div>

        <div className="card">
          <Gauge value={Math.round(status.soil_percent)} label="Soil" />
        </div>

        <div className="col-span-2">
          <ChartAreaInteractive title="Soil Moisture and Water Levels in Time" />
        </div>

        <div className="col-span-2">
          <ChartTempHum title="Temperature and Humidity in Time" />
        </div>
      </div>
  )
}
