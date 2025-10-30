"use client"
import React from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import api, { LogEntry } from '../../lib/api'

type Range = '24h' | '7d' | '30d' | 'all'

function parseDate(ts: string): Date | null {
  if (ts.startsWith('ms:')) return null
  try {
    return new Date(ts)
  } catch {
    return null
  }
}

function downsampleData(entries: LogEntry[], maxPoints: number): LogEntry[] {
  if (entries.length <= maxPoints) return entries
  const step = Math.ceil(entries.length / maxPoints)
  const result: LogEntry[] = []
  for (let i = 0; i < entries.length; i += step) {
    result.push(entries[i])
  }
  return result
}

function prepareChartData(entries: LogEntry[], range: Range) {
  const now = new Date()
  let cutoff: Date | null = null
  
  if (range === '24h') cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  else if (range === '7d') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  else if (range === '30d') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  // Filter by range and time-synced
  const filtered = entries.filter(e => {
    if (!e.timeSynced) return false
    const d = parseDate(e.timestamp)
    if (!d) return false
    if (cutoff && d < cutoff) return false
    return true
  })
  
  // Downsample to ~50 points for performance
  const downsampled = downsampleData(filtered, 50)
  
  // Map to chart format
  return downsampled.map(e => {
    const d = parseDate(e.timestamp)
    let label = e.timestamp
    if (d) {
      const month = d.toLocaleDateString('en-US', { month: 'short' })
      const day = d.getDate()
      const hour = d.getHours().toString().padStart(2, '0')
      const min = d.getMinutes().toString().padStart(2, '0')
      if (range === '24h') {
        label = `${hour}:${min}`
      } else {
        label = `${month} ${day} ${hour}:${min}`
      }
    }
    return {
      date: label,
      temp: Math.round(e.temp * 10) / 10,
      hum: Math.round(e.hum * 10) / 10,
    }
  })
}

export default function TempHumInner({ title = 'Temperature and Humidity in Time' }: { title?: string }) {
  const [range, setRange] = React.useState<Range>('7d')
  const [chartData, setChartData] = React.useState<{ date: string; temp: number; hum: number }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const logs = await api.getLogs()
        if (!mounted) return
        const data = prepareChartData(logs, range)
        setChartData(data)
      } catch (err) {
        console.warn('Failed to load logs for temp/hum chart', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [range])

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 700 }}>{title}</div>
        <select
          aria-label="time range"
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          style={{ background: 'transparent', color: 'var(--muted)', borderRadius: 10, border: '1px solid var(--card-stroke)', padding: '6px 8px' }}
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>
      <div style={{ height: 200 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            Loading...
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 20 }}>
              <defs>
                <linearGradient id="g3" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--graph-3)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--graph-3)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="g4" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--graph-4)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--graph-4)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.06} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-stroke)' }}
                itemStyle={{ color: 'var(--fg)' }}
                formatter={(value: number, name: string) => [
                  name === 'temp' ? `${value}°C` : `${value}%`,
                  name === 'temp' ? 'Temperature' : 'Humidity'
                ]}
              />
              <Legend
                verticalAlign="bottom"
                align="left"
                wrapperStyle={{ bottom: -6, left: 8 }}
                formatter={(value) => (value === 'temp' ? 'Temperature' : 'Humidity')}
              />
              <Area dataKey="temp" stroke="var(--graph-3)" fill="url(#g3)" type="natural" />
              <Area dataKey="hum" stroke="var(--graph-4)" fill="url(#g4)" type="natural" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
