"use client"

type Status = {
  soil_percent: number
  water_percent: number
  temperature: number
  humidity: number
  pump_on: boolean
}

type Settings = {
  soilBaseline?: number
  soilDryRaw?: number
  soilWetRaw?: number
  wateringThreshold?: number
  pumpDurationMs?: number
  pumpPwmDuty?: number
  autoWaterEnabled?: boolean
  deadzoneEnabled?: boolean
  deadzoneStartHour?: number
  deadzoneEndHour?: number
  loggingIntervalMs?: number
  sensorUpdateInterval?: number
  otaHostname?: string
  otaPassword?: string
}

type Calibration = Settings & {
  water_map?: Array<{ raw: number; percent: number }>
  last_water_raw?: number
  last_soil_raw?: number
  otaHostname?: string
  otaPassword?: string
}

async function fetchJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const base = getBaseUrl()
  const url = path.startsWith('http') ? path : `${base}${path}`
  // debug log for tracing network activity in the browser console
  try { console.debug('[api] fetch:', url, opts && opts.method ? opts.method : 'GET') } catch(e) {}
  const res = await fetch(url, { ...opts })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

let _deviceBaseOverride: string | null = null

export function setDeviceBaseUrl(url: string | null) {
  _deviceBaseOverride = url ? String(url).replace(/\/$/, '') : null
  try { console.debug('[api] setDeviceBaseUrl ->', _deviceBaseOverride) } catch(e) {}
  try { if (typeof window !== 'undefined' && _deviceBaseOverride) localStorage.setItem('DEVICE_BASE_URL', _deviceBaseOverride) } catch(e) {}
}

function getBaseUrl() {
  // runtime override from setDeviceBaseUrl
  if (_deviceBaseOverride) return _deviceBaseOverride
  // localStorage override (useful in browser dev)
  try {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('DEVICE_BASE_URL')
      if (v) return v.replace(/\/$/, '')
    }
  } catch (e) {}
  // Default to relative paths so rewrites/proxying (Next dev server) work.
  // If you explicitly want direct device calls, call `api.setDeviceBaseUrl('http://...')`.
  return ''
}

export async function getStatus(): Promise<Status> {
  return fetchJson<Status>('/api/status')
}

export async function getSettings(): Promise<Settings> {
  return fetchJson<Settings>('/api/settings')
}

export async function postSettings(payload: Partial<Settings>): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function getCalibration(): Promise<Calibration> {
  return fetchJson<Calibration>('/api/calibration')
}

export async function postCalibration(payload: Partial<Calibration>): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function postPump(action: 'start' | 'stop', durationMs?: number): Promise<{ ok: boolean }> {
  const body: any = { action }
  if (durationMs != null) body.durationMs = durationMs
  return fetchJson('/api/pump', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function postRestart(): Promise<{ ok: boolean }> {
  return fetchJson('/api/restart', {
    method: 'POST',
  })
}

export type LogEntry = {
  timestamp: string // "YYYY-MM-DD HH:MM:SS" or "ms:<millis>"
  soilPercent: number
  waterPercent: number
  temp: number
  hum: number
  pumpOn: boolean
  timeSynced: boolean
  // Optional extended fields (firmware >= pump event logging)
  activationCount?: number
  pumpOnMs?: number
}

export async function getLogs(): Promise<LogEntry[]> {
  const base = getBaseUrl()
  const url = `${base}/log/log.txt`
  try { console.debug('[api] fetch logs:', url) } catch(e) {}
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Log fetch failed: ${res.status}`)
  const text = await res.text()
  
  // Parse CSV: skip header, parse lines
  const lines = text.split('\n').filter(l => l.trim())
  const entries: LogEntry[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // Skip header row (first line or any line starting with "timestamp")
    if (line.startsWith('timestamp,')) continue
    
    const parts = line.split(',')
    if (parts.length < 7) continue // need at least the original 7 fields

    const base: LogEntry = {
      timestamp: parts[0],
      soilPercent: parseFloat(parts[1]) || 0,
      waterPercent: parseFloat(parts[2]) || 0,
      temp: parseFloat(parts[3]) || 0,
      hum: parseFloat(parts[4]) || 0,
      pumpOn: parts[5] === '1',
      timeSynced: parts[6] === '1',
    }

    if (parts.length >= 9) {
      const activationCount = parseInt(parts[7], 10)
      const pumpOnMs = parseInt(parts[8], 10)
      if (!isNaN(activationCount)) base.activationCount = activationCount
      if (!isNaN(pumpOnMs)) base.pumpOnMs = pumpOnMs
    }

    entries.push(base)
  }
  
  return entries
}

export default {
  getStatus,
  getSettings,
  postSettings,
  getCalibration,
  postCalibration,
  postPump,
  postRestart,
  getLogs,
  setDeviceBaseUrl,
}

// ---------------- SD File Manager API ----------------

export type SdEntry = { name: string; isDir: boolean; size?: number }

export async function sdCd(path: string): Promise<{ cwd: string }> {
  return fetchJson<{ cwd: string }>('/sd/cd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
}

export async function sdList(path?: string): Promise<SdEntry[]> {
  const p = path ? `?path=${encodeURIComponent(path)}` : ''
  return fetchJson<SdEntry[]>(`/sd/list${p}`)
}

export type SdOpenResult = { body: string; size: number; offset: number; truncated: boolean }

export async function sdOpen(path: string, opts?: { offset?: number; max?: number }): Promise<SdOpenResult> {
  const base = getBaseUrl()
  const q: string[] = [`path=${encodeURIComponent(path)}`]
  if (opts?.offset != null) q.push(`offset=${opts.offset}`)
  if (opts?.max != null) q.push(`max=${opts.max}`)
  const url = `${base}/sd/open?${q.join('&')}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`sdOpen failed: ${res.status}`)
  const body = await res.text()
  const size = parseInt(res.headers.get('X-File-Size') || '0', 10) || 0
  const offset = parseInt(res.headers.get('X-Offset') || '0', 10) || 0
  const truncated = (res.headers.get('X-Truncated') || '0') === '1'
  return { body, size, offset, truncated }
}

export async function sdRm(path: string, recursive?: boolean): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/sd/rm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, recursive: !!recursive })
  })
}

export async function sdWipeApp(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/sd/wipe?force=1`, { method: 'POST' })
}

export async function logsRollover(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/logs/rollover`, { method: 'POST' })
}
