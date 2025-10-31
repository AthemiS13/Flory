'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

function bytes(n: number) {
  const u = ['B','KB','MB','GB']
  let i = 0
  while (n >= 1024 && i < u.length-1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

const TIMEOUT_MS = 120000 // 2 minutes to accommodate slow SD writes for large files
const RETRIES = 5
const DELAY_BETWEEN_MS = 200

async function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = TIMEOUT_MS, ...rest } = opts
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

type Entry = { path: string, size: number, file: File }

type UploadResult = {
  ok: boolean
  status: number
  body?: string
  error?: string
}

const DEVICE_BASE = 'http://flory.local'

export default function Page() {
  const [folderLabel, setFolderLabel] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, bytes: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const stopRef = useRef(false)

  const addLog = useCallback((line: string) => {
    setLogs((prev: string[]) => [line, ...prev].slice(0, 200))
  }, [])

  // Build entries from an <input webkitdirectory> selection
  const handleFolderFiles = useCallback((files: FileList | File[]) => {
    const list: Entry[] = []
    let foundRoot: string | null = null
    for (let i = 0; i < (files as FileList).length; i++) {
      // @ts-ignore webkitRelativePath is non-standard but widely supported
      const rel: string = (files as any)[i].webkitRelativePath || (files as any)[i].name
      const f: File = (files as any)[i]
      if (!foundRoot) {
        const top = rel.split('/')[0]
        foundRoot = top || null
      }
      list.push({ path: rel, size: f.size, file: f })
    }
    finalizeEntries(list, foundRoot || undefined)
  }, [])

  // Build entries from drag-and-drop (folder or files)
  const handleDrop = useCallback(async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault()
    const items = ev.dataTransfer?.items
    if (!items || items.length === 0) return

    // Prefer directory traversal via webkitGetAsEntry when available
    const entriesCollected: Entry[] = []
    let rootName: string | undefined

    async function traverse(entry: any, prefix: string = ''): Promise<void> {
      if (entry.isFile) {
        await new Promise<void>((resolve, reject) => {
          entry.file((file: File) => {
            const path = prefix ? `${prefix}/${file.name}` : file.name
            entriesCollected.push({ path, size: file.size, file })
            resolve()
          }, reject)
        })
      } else if (entry.isDirectory) {
        if (!rootName) rootName = entry.name
        const reader = entry.createReader()
        await new Promise<void>((resolve, reject) => {
          const readBatch = () => {
            reader.readEntries(async (ents: any[]) => {
              if (!ents || ents.length === 0) return resolve()
              for (const e of ents) {
                await traverse(e, prefix ? `${prefix}/${entry.name}` : entry.name)
              }
              readBatch()
            }, reject)
          }
          readBatch()
        })
      }
    }

    let usedTraversal = false
    for (let i = 0; i < items.length; i++) {
      const it: any = items[i]
      const webkitEntry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : undefined
      if (webkitEntry) {
        usedTraversal = true
        await traverse(webkitEntry)
      }
    }

    if (!usedTraversal) {
      // Fallback: plain files drag
      const files = ev.dataTransfer.files
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        entriesCollected.push({ path: f.name, size: f.size, file: f })
      }
    }

    finalizeEntries(entriesCollected, rootName)
  }, [])

  function finalizeEntries(list: Entry[], inferredRoot?: string) {
    if (!list || list.length === 0) return
    // Normalize paths
    list = list.map(e => ({ ...e, path: e.path.replace(/^\.\//, '') }))
    // If nothing starts with out/, prefix it when enabled
    const needsOutPrefix = list.every(e => !e.path.startsWith('out/'))
    if (needsOutPrefix) list = list.map(e => ({ ...e, path: `out/${e.path}` }))
    // Sort
    list.sort((a, b) => a.path.localeCompare(b.path))
    setEntries(list)
    setProgress({ done: 0, total: list.length, bytes: 0 })
    setFolderLabel(inferredRoot || (needsOutPrefix ? 'out (auto)' : 'selection'))
    addLog(`Folder contains ${list.length} files`)
  }

  const handleInputFolder = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFolderFiles(files)
    }
  }, [handleFolderFiles])

  const handleStart = useCallback(async () => {
    if (!entries || entries.length === 0) return
    stopRef.current = false
    setUploading(true)

    try {
      const base = DEVICE_BASE
      // Temporarily disable SD logging (to avoid SD contention)
      let originalLoggingInterval: number | undefined
      try {
        const cur = await fetchWithTimeout(`${base}/api/settings`, { method: 'GET' })
        if (cur.ok) {
          const json = await cur.json()
          originalLoggingInterval = typeof json?.loggingIntervalMs === 'number' ? json.loggingIntervalMs : undefined
        }
      } catch {}
      if (originalLoggingInterval !== undefined && originalLoggingInterval !== 0) {
        try {
          await fetchWithTimeout(`${base}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loggingIntervalMs: 0 }),
          })
          addLog('Temporarily disabled SD logging')
        } catch {}
      }

      // Always wipe first
      addLog('Wiping /app on device...')
      const resWipe = await fetchWithTimeout(`${base}/sd/wipe?force=1`, { method: 'POST' })
      if (!resWipe.ok) throw new Error(`Wipe failed: ${resWipe.status}`)
      addLog('Wipe OK')
      await new Promise(r => setTimeout(r, 500))

      let done = 0
      let sentBytes = 0
      for (const e of entries) {
        if (stopRef.current) throw new Error('Stopped by user')
        const url = `${base}/sd/upload`

        let attempt = 0
        let last: UploadResult | null = null
        const max = Math.max(1, RETRIES)
        while (attempt < max) {
          attempt++
          try {
            const form = new FormData()
            form.append('file', e.file, e.path)
            const res = await fetchWithTimeout(url, {
              method: 'POST',
              body: form,
              timeoutMs: TIMEOUT_MS,
            })
            const text = await res.text()
            if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`)
            last = { ok: true, status: res.status, body: text }
            break
          } catch (err: any) {
            last = { ok: false, status: 0, error: err?.message || String(err) }
            addLog(`Retry ${attempt}/${max} for ${e.path}: ${last.error}`)
            await new Promise(r => setTimeout(r, 350 * attempt))
          }
        }

        if (!last || !last.ok) {
          throw new Error(`Failed to upload ${e.path} after ${max} attempts`)
        }

        sentBytes += e.size
        done += 1
        setProgress({ done, total: entries.length, bytes: sentBytes })
        addLog(`✔ ${e.path} (${bytes(e.size)})`)
        if (DELAY_BETWEEN_MS > 0) await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
      }

      addLog('All files uploaded successfully')
      // Restore logging interval if we changed it
      if (originalLoggingInterval !== undefined && originalLoggingInterval !== 0) {
        try {
          await fetchWithTimeout(`${base}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loggingIntervalMs: originalLoggingInterval }),
          })
          addLog('Restored SD logging interval')
        } catch {}
      }
      // Auto-restart device after full upload
      addLog('Restarting device...')
      await fetchWithTimeout(`${base}/api/restart`, { method: 'POST' })
      addLog('Restart requested. Device will reboot.')
    } catch (err: any) {
      addLog(`Upload aborted: ${err?.message || String(err)}`)
    } finally {
      setUploading(false)
    }
  }, [entries, addLog])

  const pct = useMemo(() => {
    if (!entries || entries.length === 0) return 0
    return Math.round((progress.done / entries.length) * 100)
  }, [progress, entries])

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Shadcn-style dropzone */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          border: '2px dashed #2b355f',
          background: '#0f1733',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop your out folder here</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>The uploader will wipe /app, ensure paths start with out/, upload files sequentially, and restart the device.</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid #263056', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: '#121b3d' }}>
            {/* @ts-ignore - non-standard */}
            <input type="file" webkitdirectory="" multiple onChange={handleInputFolder} style={{ display: 'none' }} />
            <span>Select out folder</span>
          </label>
        </div>
      </div>

      {entries && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 10, background: '#162048', borderRadius: 999 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#5dd67a', borderRadius: 999 }} />
          </div>
          <div style={{ width: 220, textAlign: 'right' }}>{folderLabel ? `${folderLabel} • ` : ''}{progress.done}/{entries.length} • {bytes(progress.bytes)}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={handleStart} disabled={!entries || uploading} style={{ padding: '10px 16px', borderRadius: 8, background: uploading ? '#233157' : '#275efe', color: 'white', border: 'none', cursor: uploading ? 'default' : 'pointer' }}>{uploading ? 'Uploading…' : 'Start Upload'}</button>
        <button onClick={() => { stopRef.current = true }} disabled={!uploading} style={{ padding: '10px 16px', borderRadius: 8, background: '#6b2d2d', color: 'white', border: 'none', cursor: uploading ? 'pointer' : 'default' }}>Stop</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#0f1733', border: '1px solid #263056', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Files</div>
          <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace', fontSize: 12 }}>
            {entries?.slice(0, 500).map(e => (
              <div key={e.path} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{e.path}</span>
                <span style={{ opacity: 0.7 }}>{bytes(e.size)}</span>
              </div>
            ))}
            {entries && entries.length > 500 && (
              <div style={{ opacity: 0.7 }}>(+{entries.length - 500} more)</div>
            )}
          </div>
        </div>
        <div style={{ background: '#0f1733', border: '1px solid #263056', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Activity</div>
          <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', \'Courier New\', monospace', fontSize: 12 }}>
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
