'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '@/lib/api'

type HistoryItem = string

export default function FilesPage() {
  const [cwd, setCwd] = useState<string>('/')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [histIdx, setHistIdx] = useState<number>(-1)
  const [error, setError] = useState<string | null>(null)
  const [currentLine, setCurrentLine] = useState<string>('')
  const [caretVisible, setCaretVisible] = useState<boolean>(true)
  const outRef = useRef<HTMLPreElement | null>(null)
  const hiddenInputRef = useRef<HTMLInputElement | null>(null)

  // Initial CWD: align server to root and focus input
  useEffect(() => {
    (async () => {
      try { const res = await api.sdCd('/'); setCwd(res.cwd) } catch { setCwd('/') }
      try { hiddenInputRef.current?.focus() } catch {}
    })()
  }, [])

  // Auto-scroll output
  useEffect(() => {
    const el = outRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [history])

  const prompt = useMemo(() => `${cwd} $`, [cwd])

  // Blink caret
  useEffect(() => {
    const id = setInterval(() => setCaretVisible(v => !v), 500)
    return () => clearInterval(id)
  }, [])

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
        case 'rm': {
          if (!args[0]) throw new Error('usage: rm [-r] <path>')
          const { recursive, path } = parseRmArgs(args)
          await api.sdRm(path, recursive)
          append('ok')
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
      try { hiddenInputRef.current?.focus() } catch {}
    }
  }, [append, prompt])

  // Keystroke handler via hidden input
  const onKey = useCallback((e: any) => {
    if (!hiddenInputRef.current) return
    if (e.key === 'Enter') {
      if (busy) return
      const v = currentLine
      setCurrentLine('')
      if (v.trim()) setHistory(prev => prev.concat(''))
      run(v)
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      if (currentLine.length > 0) setCurrentLine(currentLine.slice(0, -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistIdx(i => {
        const newIdx = Math.min(history.length - 1, i < 0 ? history.length - 1 : i - 1)
        const prevCmd = findPrevCommand(history, newIdx)
        if (prevCmd != null) setCurrentLine(prevCmd)
        return newIdx
      })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistIdx(i => {
        const newIdx = i < 0 ? -1 : Math.min(history.length - 1, i + 1)
        const nextCmd = findNextCommand(history, newIdx)
        setCurrentLine(nextCmd || '')
        return newIdx
      })
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Append printable character
      setCurrentLine(currentLine + e.key)
    }
  }, [busy, currentLine, history, run])

  const doRollover = useCallback(async () => {
    try { setBusy(true); await api.logsRollover(); append('rollover: ok') } catch (e: any) { append('error: ' + (e?.message || String(e))) } finally { setBusy(false) }
  }, [append])

  const doWipeApp = useCallback(async () => {
    if (!confirm('Wipe /app? This deletes the hosted web UI.')) return
    try { setBusy(true); await api.sdWipeApp(); append('wipe-app: ok') } catch (e: any) { append('error: ' + (e?.message || String(e))) } finally { setBusy(false) }
  }, [append])

  return (
    <div className="settings-page-container">
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button onClick={doRollover} disabled={busy} className="ui-button">Force month rollover</button>
        <button onClick={doWipeApp} disabled={busy} className="ui-button">Wipe /app</button>
      </div>

      {/* Terminal */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0 }} onClick={() => hiddenInputRef.current?.focus()}>
        <pre ref={outRef} style={{ margin: 0, padding: 16, height: 460, overflow: 'auto', color: 'var(--fg)', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
          {history.length === 0 && (
            <>
              <div>Type 'help' for available commands. Examples:</div>
              <div>  ls</div>
              <div>  cd app</div>
              <div>  rm -r old_folder</div>
            </>
          )}
          {history.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
          {/* Prompt line */}
          <div>
            <span style={{ color: 'var(--fg)' }}>{prompt} </span>
            <span>{currentLine}</span>
            <span style={{ opacity: caretVisible ? 1 : 0 }}>|</span>
          </div>
        </pre>
        {/* Hidden input to capture keystrokes, preserves mobile keyboards and IME */}
        <input ref={hiddenInputRef} onKeyDown={onKey} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
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
    '  ls [path]            List directory (defaults to CWD)',
    '  cd [path]            Change directory (.. supported)',
    '  rm [-r] <path>       Remove file or directory (use -r for dir)',
  ]
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
