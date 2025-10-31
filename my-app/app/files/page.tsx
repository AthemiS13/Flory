'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '@/lib/api'

type HistoryItem = string

export default function FilesPage() {
  const [cwd, setCwd] = useState<string>('/')
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [histIdx, setHistIdx] = useState<number>(-1)
  const [error, setError] = useState<string | null>(null)
  const outRef = useRef<HTMLPreElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Initial CWD
  useEffect(() => {
    (async () => {
      try { const { cwd } = await api.sdPwd(); setCwd(cwd) } catch {}
      try { inputRef.current?.focus() } catch {}
    })()
  }, [])

  // Auto-scroll output
  useEffect(() => {
    const el = outRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [history])

  const prompt = useMemo(() => `${cwd} $`, [cwd])

  const append = useCallback((line: string | string[]) => {
    setHistory(prev => prev.concat(Array.isArray(line) ? line : [line]))
  }, [])

  const run = useCallback(async (cmdline: string) => {
    const line = cmdline.trim()
    if (!line) return
    setBusy(true)
    setError(null)
    append(`${prompt} ${line}`)
    setHistIdx(-1)
    try {
      const [cmd, ...args] = tokenize(line)
      switch (cmd) {
        case 'help':
        case '?': {
          append(helpText())
          break
        }
        case 'clear': {
          setHistory([])
          break
        }
        case 'pwd': {
          const { cwd } = await api.sdPwd()
          setCwd(cwd)
          append(cwd)
          break
        }
        case 'ls': {
          const path = args[0]
          const list = await api.sdList(path)
          list.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1)))
          if (list.length === 0) append('(empty)')
          else append(list.map(it => formatLs(it)))
          break
        }
        case 'cd': {
          const path = args[0] || '/'
          const res = await api.sdCd(path)
          setCwd(res.cwd)
          break
        }
        case 'cat':
        case 'open': {
          if (!args[0]) throw new Error('usage: cat <path> [--max N]')
          const { path, max } = parseCatArgs(args)
          const res = await api.sdCat(path, max ? { max } : undefined)
          const hdr = `--- ${path} (${formatBytes(res.size)}${res.truncated ? ', truncated' : ''}) ---`
          append([hdr, res.body, '--- end ---'])
          break
        }
        case 'rm': {
          if (!args[0]) throw new Error('usage: rm [-r] <path>')
          const { recursive, path } = parseRmArgs(args)
          await api.sdRm(path, recursive)
          append('ok')
          break
        }
        case 'mkdir': {
          if (!args[0]) throw new Error('usage: mkdir <path>')
          await api.sdMkdir(args[0])
          append('ok')
          break
        }
        case 'rollover': {
          await api.logsRollover(); append('ok')
          break
        }
        case 'wipe-app': {
          await api.sdWipeApp(); append('ok')
          break
        }
        default: {
          append(`Unknown command: ${cmd}. Try 'help'.`)
        }
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      append(`error: ${msg}`)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }, [append, prompt])

  const onKey = useCallback((e: any) => {
    if (e.key === 'Enter') {
      const v = input
      setInput('')
      if (v.trim()) setHistory(prev => prev.concat(``)) // spacer ensures prompt separation
      run(v)
      // push into command history (skip duplicates)
      setHistory(prev => prev)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistIdx(i => {
        const newIdx = Math.min(history.length - 1, i < 0 ? history.length - 1 : i - 1)
        const prevCmd = findPrevCommand(history, newIdx)
        if (prevCmd != null) setInput(prevCmd)
        return newIdx
      })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistIdx(i => {
        const newIdx = i < 0 ? -1 : Math.min(history.length - 1, i + 1)
        const nextCmd = findNextCommand(history, newIdx)
        setInput(nextCmd || '')
        return newIdx
      })
    }
  }, [history, input, run])

  const doRollover = useCallback(async () => {
    try { setBusy(true); await api.logsRollover(); append('rollover: ok') } catch (e: any) { append('error: ' + (e?.message || String(e))) } finally { setBusy(false) }
  }, [append])

  const doWipeApp = useCallback(async () => {
    if (!confirm('Wipe /app? This deletes the hosted web UI.')) return
    try { setBusy(true); await api.sdWipeApp(); append('wipe-app: ok') } catch (e: any) { append('error: ' + (e?.message || String(e))) } finally { setBusy(false) }
  }, [append])

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Files</h1>

      {/* Only the two action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={doRollover} disabled={busy} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2b355f', background: '#0f1733', color: '#e7eaf3' }}>Force month rollover</button>
        <button onClick={doWipeApp} disabled={busy} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #5a2b2b', background: '#361a1a', color: '#ffd7d7' }}>Wipe /app</button>
      </div>

      {/* Terminal */}
      <div style={{ border: '1px solid #2b355f', borderRadius: 8, overflow: 'hidden', background: '#0f1733' }}>
        <pre ref={outRef} style={{ margin: 0, padding: 12, height: 380, overflow: 'auto', color: '#e7eaf3', whiteSpace: 'pre-wrap' }}>
          {history.length === 0 && (
            <>
              <div>Type 'help' for available commands. Examples:</div>
              <div>  ls</div>
              <div>  cd app</div>
              <div>  pwd</div>
              <div>  cat out/index.html</div>
              <div>  rm -r old_folder</div>
              <div>  mkdir new_folder</div>
            </>
          )}
          {history.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </pre>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderTop: '1px solid #2b355f', background: '#11193a' }}>
          <div style={{ color: '#9fb0d6', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{prompt}</div>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={busy}
            placeholder="Type a command and press Enter"
            style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #2b355f', background: '#0f1733', color: '#e7eaf3' }}
          />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 8, color: '#ff9c9c' }}>{error}</div>
      )}
    </div>
  )
}

function tokenize(line: string): string[] {
  // Simple tokenizer: split on spaces, handle quoted segments "..."
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ; continue }
    if (!inQ && /\s/.test(ch)) { if (cur) { out.push(cur); cur=''}; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function helpText(): string[] {
  return [
    'Available commands:',
    '  help                 Show this help',
    '  clear                Clear the screen',
    '  pwd                  Print working directory',
    '  ls [path]            List directory (defaults to CWD)',
    '  cd [path]            Change directory (.. supported)',
    '  cat <path> [--max N] Show file contents (default max 16KB)',
    '  open <path>          Alias for cat',
    '  rm [-r] <path>       Remove file or directory (use -r for dir)',
    '  mkdir <path>         Create directory',
    '  rollover             Force month rollover',
    "  wipe-app             Wipe '/app'",
  ]
}

function parseCatArgs(args: string[]): { path: string; max?: number } {
  let path = ''
  let max: number | undefined
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--max') { const v = parseInt(args[i+1], 10); if (!isNaN(v)) max = v; i++; continue }
    if (!path) path = a
  }
  if (!max) max = 16384
  return { path, max }
}

function parseRmArgs(args: string[]): { recursive: boolean; path: string } {
  let recursive = false
  let path = ''
  for (const a of args) {
    if (a === '-r' || a === '--recursive') { recursive = true; continue }
    if (!path) path = a
  }
  return { recursive, path }
}

function formatLs(it: api.SdEntry): string {
  if (it.isDir) return `📁 ${it.name}/`
  const sz = typeof it.size === 'number' ? `  ${formatBytes(it.size)}` : ''
  return `📄 ${it.name}${sz}`
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return '0 B'
  const u = ['B','KB','MB','GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length-1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

function findPrevCommand(history: string[], fromIdx: number): string | null {
  for (let i = fromIdx; i >= 0; i--) {
    const line = history[i]
    // Prompted lines look like "<cwd> $ <cmd>"
    const m = line.match(/\$\s+(.*)$/)
    if (m && m[1]) return m[1]
  }
  return null
}

function findNextCommand(history: string[], fromIdx: number): string | null {
  for (let i = fromIdx; i < history.length; i++) {
    const line = history[i]
    const m = line.match(/\$\s+(.*)$/)
    if (m && m[1]) return m[1]
  }
  return null
}
