"use client"
import React from 'react'
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api, { LogEntry } from '../../lib/api'

type Range = '7d' | '30d' | 'all'

function parseDate(ts: string): Date | null {
  // Parse "YYYY-MM-DD HH:MM:SS" or return null for "ms:..." entries
  if (ts.startsWith('ms:')) return null
  try {
    return new Date(ts)
  } catch {
    return null
  }
}

function groupByDay(entries: LogEntry[], daysBack: number | null): { label: string; count: number }[] {
  const now = new Date()
  const cutoff = daysBack ? new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000) : null
  
  // Filter entries within range and with valid time
  const filtered = entries.filter(e => {
    if (!e.timeSynced) return false
    const d = parseDate(e.timestamp)
    if (!d) return false
    if (cutoff && d < cutoff) return false
    return true
  })
  
  // Group by date string (YYYY-MM-DD) and count pump activations
  const dayMap = new Map<string, number>()
  
  for (const entry of filtered) {
    const d = parseDate(entry.timestamp)
    if (!d) continue
    const dayKey = d.toISOString().split('T')[0] // YYYY-MM-DD
    if (entry.pumpOn) {
      dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1)
    } else {
      // ensure day exists even if pump was never on
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, 0)
    }
  }
  
  // Convert to array and sort by date
  const arr = Array.from(dayMap.entries()).map(([date, count]) => ({
    date,
    count,
  }))
  arr.sort((a, b) => a.date.localeCompare(b.date))
  
  // Format labels as "Mon 1" or "Oct 1"
  return arr.map(({ date, count }) => {
    const d = new Date(date + 'T00:00:00')
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
    const day = d.getDate()
    return { label: `${dayName} ${day}`, count }
  })
}

export default function BarInner() {
  const [range, setRange] = React.useState<Range>('7d')
  const [data, setData] = React.useState<{ label: string; count: number }[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const logs = await api.getLogs()
        if (!mounted) return
        
        const daysBack = range === '7d' ? 7 : range === '30d' ? 30 : null
        const chartData = groupByDay(logs, daysBack)
        setData(chartData)
      } catch (err) {
        console.warn('Failed to load logs for bar chart', err)
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
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 700 }}>Pump ON last {range === '7d' ? '7 days' : range === '30d' ? '30 days' : 'all time'}</div>
        <select
          aria-label="time range"
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          style={{ background: 'transparent', color: 'var(--muted)', borderRadius: 10, border: '1px solid var(--card-stroke)', padding: '6px 8px' }}
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="all">All Time</option>
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

