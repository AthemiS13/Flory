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

export default {
  getStatus,
  getSettings,
  postSettings,
  getCalibration,
  postCalibration,
  postPump,
  setDeviceBaseUrl,
}
