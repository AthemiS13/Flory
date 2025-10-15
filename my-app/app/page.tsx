import ChartAreaInteractive from '../components/charts/ChartAreaInteractive.client'
import ChartBarDefault from '../components/charts/ChartBarDefault.client'
import Card from '../components/Card'
import Gauge from '../components/Gauge.client'

export default function Home(){
  return (
    <div className="main-grid">
      <div className="card" style={{borderRadius:22}}>
        <div style={{fontSize:44,fontWeight:800,color:'var(--fg)'}}>Flory</div>
      </div>

      <div className="card">
        <Gauge value={20} label="Water Level" color="var(--graph-2)" />
      </div>

      <div className="col-span-2">
        <ChartBarDefault className="" />
      </div>

      <div className="card">
        <div>
          <div style={{fontSize:32,fontWeight:700}}>24°C</div>
          <div className="stat-label">Temperature</div>
        </div>
      </div>

      <div className="card">
        <div>
          <div style={{fontSize:32,fontWeight:700}}>43%</div>
          <div className="stat-label">Humidity</div>
        </div>
      </div>

        <div className="card">
          <div>
            <div style={{fontSize:32,fontWeight:700}}>OFF</div>
            <div className="stat-label">Pump</div>
          </div>
        </div>

        <div className="card">
          <Gauge value={20} />
        </div>

        <div className="col-span-2">
          <ChartAreaInteractive className="" title="Soil Moisture and Water Levels in Time" />
        </div>

        <div className="col-span-2">
          <ChartAreaInteractive className="" title="Temperature and Humidity in Time" />
        </div>
      </div>
  )
}
