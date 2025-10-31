'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

function bytes(n: number) {
  const u = ['B','KB','MB','GB']
  let i = 0
  while (n >= 1024 && i < u.length-1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

async function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 15000, ...rest } = opts
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
  const [delayMs, setDelayMs] = useState(200)
  const [retries, setRetries] = useState(3)
  const [timeoutMs, setTimeoutMs] = useState(15000)
  const [wipeFirst, setWipeFirst] = useState(true)
  const [ensureOutBase, setEnsureOutBase] = useState(true)
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
    const needsOutPrefix = ensureOutBase && list.every(e => !e.path.startsWith('out/'))
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
      if (wipeFirst) {
        addLog('Wiping /app on device...')
        const res = await fetchWithTimeout(`${base}/sd/wipe?force=1`, { method: 'POST', timeoutMs })
        if (!res.ok) throw new Error(`Wipe failed: ${res.status}`)
        addLog('Wipe OK')
        await new Promise(r => setTimeout(r, 500))
      }

      let done = 0
      let sentBytes = 0
      for (const e of entries) {
        if (stopRef.current) throw new Error('Stopped by user')
        const url = `${base}/sd/upload`
        const form = new FormData()
        form.append('file', e.file, e.path)

        let attempt = 0
        let last: UploadResult | null = null
        const max = Math.max(1, retries)
        while (attempt < max) {
          attempt++
          try {
            const res = await fetchWithTimeout(url, {
              method: 'POST',
              body: form,
              timeoutMs,
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
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
      }

      addLog('All files uploaded successfully')
    } catch (err: any) {
      addLog(`Upload aborted: ${err?.message || String(err)}`)
    } finally {
      setUploading(false)
    }
  }, [entries, wipeFirst, retries, timeoutMs, delayMs, addLog])

  const pct = useMemo(() => {
    if (!entries || entries.length === 0) return 0
    return Math.round((progress.done / entries.length) * 100)
  }, [progress, entries])

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={wipeFirst} onChange={e => setWipeFirst(e.target.checked)} />
            Wipe /app first
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={ensureOutBase} onChange={e => setEnsureOutBase(e.target.checked)} />
            Ensure paths prefixed with out/
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px dashed #2b355f', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: '#0f1733' }}>
          {/* @ts-ignore - non-standard */}
          <input type="file" webkitdirectory="" multiple onChange={handleInputFolder} style={{ display: 'none' }} />
          <span>Select out folder</span>
        </label>
        <span style={{ opacity: 0.8 }}>or drag & drop the out folder here</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Delay
            <input type="number" min={0} step={50} value={delayMs} onChange={e => setDelayMs(parseInt(e.target.value || '0', 10))} style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #263056', background: '#0f1733', color: 'inherit' }} /> ms
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Retries
            <input type="number" min={1} max={10} value={retries} onChange={e => setRetries(parseInt(e.target.value || '1', 10))} style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid #263056', background: '#0f1733', color: 'inherit' }} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Timeout
            <input type="number" min={1000} step={1000} value={timeoutMs} onChange={e => setTimeoutMs(parseInt(e.target.value || '15000', 10))} style={{ width: 110, padding: '6px 8px', borderRadius: 6, border: '1px solid #263056', background: '#0f1733', color: 'inherit' }} /> ms
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
