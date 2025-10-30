"use client"
import React from 'react'
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { LogEntry } from '../../lib/api'
import { getLogsWithCache } from '../../lib/logCache'

type Range = '24h' | '48h' | '7d' | '14d' | '21d' | '30d'

function parseDate(ts: string): Date | null {
  // Parse "YYYY-MM-DD HH:MM:SS" or return null for "ms:..." entries
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

function groupByDay(entries: LogEntry[], cutoff: Date): { label: string; count: number }[] {
  // Filter entries within range and with valid time
  const filtered = entries.filter(e => {
    if (!e.timeSynced) return false
    const d = parseDate(e.timestamp)
    if (!d) return false
    if (d < cutoff) return false
    return true
  })

  // Sort by timestamp ascending for transition-based fallback
  filtered.sort((a, b) => {
    const da = parseDate(a.timestamp)!.getTime()
    const db = parseDate(b.timestamp)!.getTime()
    return da - db
  })

  // Group by date string (YYYY-MM-DD); prefer explicit activationCount when available
  const dayMap = new Map<string, number>()
  const hasCounts = filtered.some(e => typeof e.activationCount === 'number')

  if (hasCounts) {
    for (const entry of filtered) {
      const d = parseDate(entry.timestamp)
      if (!d) continue
      const dayKey = d.toISOString().split('T')[0]
      const add = entry.activationCount ?? 0
      dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + add)
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, 0)
    }
  } else {
    // Fallback: count rising edges (0 -> 1) across samples
    let prevOn: boolean | null = null
    for (const entry of filtered) {
      const d = parseDate(entry.timestamp)
      if (!d) continue
      const dayKey = d.toISOString().split('T')[0]
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, 0)
      if (prevOn === false && entry.pumpOn) {
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1)
      }
      prevOn = entry.pumpOn
    }
  }

  // Convert to array and sort by date
  const arr = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }))
  arr.sort((a, b) => a.date.localeCompare(b.date))

  // Format labels as "Mon 1" or "Oct 1"
  return arr.map(({ date, count }) => {
    const d = new Date(date + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
    const day = d.getDate()
    return { label: `${dayName} ${day}`, count }
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

export default function BarInner() {
  const [range, setRange] = React.useState<Range>('7d')
  const [allLogs, setAllLogs] = React.useState<LogEntry[]>([])
  const [latestDate, setLatestDate] = React.useState<Date | null>(null)
  const [data, setData] = React.useState<{ label: string; count: number }[]>([])
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
        console.warn('Failed to load logs for bar chart', err)
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
      setData([])
      return
    }
    const cutoff = getRangeCutoff(range, latestDate)
    const chartData = groupByDay(allLogs, cutoff)
    setData(chartData)
  }, [range, allLogs, latestDate])

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 700 }}>Pump ON - {getRangeLabel(range)}</div>
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
      <div style={{ height: 140 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            Loading...
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid vertical={false} strokeOpacity={0.06} />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={false}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-stroke)' }}
                itemStyle={{ color: 'var(--fg)' }}
                formatter={(value: number) => [`${value} times`, 'Pump ON']}
              />
              <Bar dataKey="count" fill="var(--graph-1)" radius={[8, 8, 8, 8]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

