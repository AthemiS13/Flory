"use client"
import { LogEntry } from './api'

let cachedLogs: LogEntry[] | null = null
let cachedLatestDate: Date | null = null
let fetchPromise: Promise<void> | null = null
let lastFetchTime = 0
const CACHE_DURATION = 30000 // 30 seconds

export async function getLogsWithCache(): Promise<{ logs: LogEntry[]; latestDate: Date }> {
  const now = Date.now()
  
  // Return cached data if still fresh
  if (cachedLogs && cachedLatestDate && (now - lastFetchTime) < CACHE_DURATION) {
    return { logs: cachedLogs, latestDate: cachedLatestDate }
  }
  
  // If a fetch is already in progress, wait for it
  if (fetchPromise) {
    await fetchPromise
    return { logs: cachedLogs!, latestDate: cachedLatestDate! }
  }
  
  // Start new fetch
  fetchPromise = (async () => {
    try {
      const api = (await import('./api')).default
      const logs = await api.getLogs()
      
      // Find latest timestamp
      let latest: Date | null = null
      for (const entry of logs) {
        if (!entry.timeSynced) continue
        const ts = entry.timestamp
        if (ts.startsWith('ms:')) continue
        try {
          const d = new Date(ts)
          if (!latest || d > latest) {
            latest = d
          }
        } catch {
          // skip invalid dates
        }
      }
      
      cachedLogs = logs
      cachedLatestDate = latest || new Date()
      lastFetchTime = Date.now()
    } catch (err) {
      console.warn('Failed to fetch logs:', err)
      // Return empty on error but don't cache it
      if (!cachedLogs) {
        cachedLogs = []
        cachedLatestDate = new Date()
      }
    } finally {
      fetchPromise = null
    }
  })()
  
  await fetchPromise
  return { logs: cachedLogs!, latestDate: cachedLatestDate! }
}

export function clearLogCache() {
  cachedLogs = null
  cachedLatestDate = null
  lastFetchTime = 0
}
