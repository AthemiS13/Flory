"use client"
import React from 'react'
import { AreaChart, Area, CartesianGrid, XAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { LogEntry } from '../../lib/api'
import { getLogsWithCache } from '../../lib/logCache'

type Range = '24h' | '48h' | '7d' | '14d' | '21d' | '30d'

function parseDate(ts: string): Date | null {
  if (ts.startsWith('ms:')) return null
  try {
    return new Date(ts)
  } catch {
    return null
  }
}

function getRangeCutoff(range: Range, latestDate: Date): Date {
  const now = latestDate.getTime()
  switch (range) {
    case '24h': return new Date(now - 24 * 60 * 60 * 1000)
    case '48h': return new Date(now - 48 * 60 * 60 * 1000)
    case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000)
    case '14d': return new Date(now - 14 * 24 * 60 * 60 * 1000)
    case '21d': return new Date(now - 21 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000)
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

function prepareChartData(entries: LogEntry[], cutoff: Date) {
  // Filter by range and time-synced
  const filtered = entries.filter(e => {
    if (!e.timeSynced) return false
    const d = parseDate(e.timestamp)
    if (!d) return false
    if (d < cutoff) return false
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
      const rangeDuration = Date.now() - cutoff.getTime()
      const is24hOrLess = rangeDuration <= 48 * 60 * 60 * 1000
      if (is24hOrLess) {
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

function getRangeLabel(range: Range): string {
  switch (range) {
    case '24h': return 'Last 24 Hours'
    case '48h': return 'Last 48 Hours'
    case '7d': return 'Last 7 Days'
    case '14d': return 'Last 14 Days'
    case '21d': return 'Last 3 Weeks'
    case '30d': return 'Last Month'
  }
}

export default function TempHumInner({ title = 'Temperature and Humidity in Time' }: { title?: string }) {
  const [range, setRange] = React.useState<Range>('7d')
  const [allLogs, setAllLogs] = React.useState<LogEntry[]>([])
  const [latestDate, setLatestDate] = React.useState<Date | null>(null)
  const [chartData, setChartData] = React.useState<{ date: string; temp: number; hum: number }[]>([])
  const [loading, setLoading] = React.useState(true)

  // Fetch logs once on mount using shared cache
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const { logs, latestDate: latest } = await getLogsWithCache()
        if (!mounted) return
        
        setAllLogs(logs)
        setLatestDate(latest)
      } catch (err) {
        console.warn('Failed to load logs for temp/hum chart', err)
        setLatestDate(new Date())
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  // Process data when range or logs change
  React.useEffect(() => {
    if (allLogs.length === 0 || !latestDate) {
      setChartData([])
      return
    }
    const cutoff = getRangeCutoff(range, latestDate)
    const data = prepareChartData(allLogs, cutoff)
    setChartData(data)
  }, [range, allLogs, latestDate])

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 700 }}>{title}</div>
        <select
          aria-label="time range"
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          style={{ 
            background: 'transparent', 
            color: 'var(--muted)', 
            borderRadius: 10, 
            border: '1px solid var(--card-stroke)', 
            padding: '6px 8px',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23a3a3a3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            paddingRight: '22px'
          }}
        >
          <option value="24h">Last 24 Hours</option>
          <option value="48h">Last 48 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="14d">Last 14 Days</option>
          <option value="21d">Last 3 Weeks</option>
          <option value="30d">Last Month</option>
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
            <AreaChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
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
              <Area dataKey="hum" stroke="var(--graph-4)" fill="url(#g4)" type="natural" />
              <Area dataKey="temp" stroke="var(--graph-3)" fill="url(#g3)" type="natural" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
