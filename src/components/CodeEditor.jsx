import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import { updateUserProblem } from '../api/leetcode'
import { fetchDefaultLangSlug, resolveLangSlug } from '../utils/codeLang'

/** 将「块内」下标映射到反缩进后的新下标（olds / news 为各行字符串，不含 \n） */
function mapIndexInBlock(idx, olds, news) {
  const blockLen = olds.reduce((s, l, i) => s + l.length + (i < olds.length - 1 ? 1 : 0), 0)
  const tail = news.reduce((s, l, i) => s + l.length + (i < news.length - 1 ? 1 : 0), 0)
  if (idx >= blockLen) return tail
  let p = 0
  let np = 0
  for (let i = 0; i < olds.length; i++) {
    const ol = olds[i].length
    const nl = news[i].length
    const lineEnd = p + ol
    if (idx <= lineEnd) {
      const col = idx - p
      const removed = ol - nl
      if (removed === 0) return np + col
      if (col <= removed) return np
      return np + col - removed
    }
    p = lineEnd + 1
    np += nl + 1
  }
  return np
}

export const HLJS_LANGS = {
  java: 'java',
  python: 'python',
  python3: 'python',
  cpp: 'cpp',
  c: 'c',
  csharp: 'csharp',
  javascript: 'javascript',
  typescript: 'typescript',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  php: 'php',
  mysql: 'sql',
  scala: 'scala',
  dart: 'dart',
}

export function CodeEditor({ activeProblem, updateProblem }) {
  const [code, setCode] = useState(activeProblem.code || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [highlightedCode, setHighlightedCode] = useState('')
  const [defaultLangSlug, setDefaultLangSlug] = useState('')
  const highlightLayerRef = useRef(null)
  const textareaRef = useRef(null)
  const pendingSelectionRef = useRef(null)

  // 读取「设置 → 默认目标语言」，代码语言标签与高亮自动跟随该设置
  useEffect(() => {
    let alive = true
    fetchDefaultLangSlug().then((slug) => {
      if (alive && slug) setDefaultLangSlug(slug)
    })
    return () => {
      alive = false
    }
  }, [])

  const langSlug =
    resolveLangSlug(activeProblem.codeSnippets, defaultLangSlug) ||
    activeProblem.codeSnippets?.[0]?.langSlug ||
    activeProblem.codeSnippets?.[0]?.lang ||
    'java'
  const lang = HLJS_LANGS[langSlug] || 'plaintext'
  const langLabel = (langSlug || 'code').toUpperCase()

  useEffect(() => {
    const latestCode = activeProblem.code || ''
    setCode((current) => (current === latestCode ? current : latestCode))
    setSaveStatus('')
  }, [activeProblem.id, activeProblem.code])

  // 更新高亮代码
  useEffect(() => {
    if (code) {
      try {
        const highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        setHighlightedCode(highlighted)
      } catch (error) {
        setHighlightedCode(code)
      }
    } else {
      setHighlightedCode('')
    }
  }, [code, lang])

  useLayoutEffect(() => {
    const range = pendingSelectionRef.current
    const el = textareaRef.current
    if (!range || !el) return
    pendingSelectionRef.current = null
    const max = el.value.length
    const a = Math.min(Math.max(0, range.start), max)
    const b = Math.min(Math.max(0, range.end), max)
    el.setSelectionRange(a, b)
  }, [code])

  const applyCode = (newCode, selection) => {
    pendingSelectionRef.current = selection
    setCode(newCode)
    updateProblem({ ...activeProblem, code: newCode })
  }

  const handleCodeChange = (e) => {
    const newCode = e.target.value
    setCode(newCode)
    updateProblem({ ...activeProblem, code: newCode })
  }

  /**
   * Tab / Shift+Tab：阻止浏览器默认焦点跳转，改为缩进或反缩进（与 IDE 行为接近）。
   */
  const handleCodeKeyDown = (e) => {
    if (e.key !== 'Tab') return
    e.preventDefault()

    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const v = code

    if (e.shiftKey) {
      const lineStart = v.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      let lineEndEx = v.indexOf('\n', Math.max(0, end - 1))
      if (lineEndEx === -1) lineEndEx = v.length
      else lineEndEx += 1

      const block = v.slice(lineStart, lineEndEx)
      const lines = block.split('\n')
      const newLines = lines.map((line) => {
        if (line.startsWith('\t')) return line.slice(1)
        if (line.startsWith('    ')) return line.slice(4)
        if (line.startsWith('  ')) return line.slice(2)
        return line
      })
      const newBlock = newLines.join('\n')
      const newV = v.slice(0, lineStart) + newBlock + v.slice(lineEndEx)
      const delta = block.length - newBlock.length

      const mapAbs = (P) => {
        if (P < lineStart) return P
        if (P >= lineEndEx) return P - delta
        return lineStart + mapIndexInBlock(P - lineStart, lines, newLines)
      }

      applyCode(newV, { start: mapAbs(start), end: mapAbs(end) })
      return
    }

    if (start === end) {
      applyCode(v.slice(0, start) + '\t' + v.slice(start), { start: start + 1, end: start + 1 })
      return
    }

    const lineStart = v.lastIndexOf('\n', start - 1) + 1
    let lineEndEx = v.indexOf('\n', end - 1)
    if (lineEndEx === -1) lineEndEx = v.length
    else lineEndEx += 1

    const lineStarts = []
    let pos = lineStart
    const block = v.slice(lineStart, lineEndEx)
    const lines = block.split('\n')
    for (const line of lines) {
      lineStarts.push(pos)
      pos += line.length + 1
    }

    let newV = v
    for (let i = lineStarts.length - 1; i >= 0; i--) {
      const p = lineStarts[i]
      newV = newV.slice(0, p) + '\t' + newV.slice(p)
    }

    let newStart = start
    let newEnd = end
    for (const p of lineStarts) {
      if (p < start) newStart += 1
      if (p < end) newEnd += 1
    }
    if (newEnd < newStart) newEnd = newStart

    applyCode(newV, { start: newStart, end: newEnd })
  }

  const handleSaveCode = async () => {
    if (!activeProblem.id) return

    setIsSaving(true)
    setSaveStatus('保存中...')

    try {
      await updateUserProblem(activeProblem.userProblemId || activeProblem.id, {
        personalDifficulty: activeProblem.personalDifficulty,
        status: activeProblem.status,
        progressStatus: activeProblem.progressStatus,
        notes: activeProblem.notes,
        code: code,
      })
      setSaveStatus('已保存')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (error) {
      console.error('保存代码失败:', error)
      setSaveStatus('保存失败')
      setTimeout(() => setSaveStatus(''), 2000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-2 h-full flex flex-col">
      <div className="rounded-xl overflow-hidden shadow-lg border border-slate-900 border-opacity-10 flex-1 flex flex-col min-h-0">
        {/* 编辑器头部 */}
        <div className="bg-[#1A1C1E] px-6 py-3 border-b border-white border-opacity-5 flex justify-between items-center text-[10px] font-mono text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-rose-500/80"></div>
              <div className="w-2 h-2 rounded-full bg-amber-500/80"></div>
              <div className="w-2 h-2 rounded-full bg-primary-500/80"></div>
            </div>
            <span className="font-bold tracking-widest uppercase italic ml-3">
              solution.{langSlug}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus && (
              <span
                className={`text-[10px] font-bold flex items-center gap-1 ${
                  saveStatus === '已保存' ? 'text-primary-400' : 'text-slate-400'
                }`}
              >
                {saveStatus === '已保存' && <Check size={12} />}
                {saveStatus}
              </span>
            )}
            <button
              onClick={handleSaveCode}
              disabled={isSaving}
              className="px-2 py-1 bg-primary-600 text-white text-[10px] font-bold rounded hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '保存中' : '保存'}
            </button>
            <span className="text-primary-500 font-bold opacity-80 uppercase tracking-widest text-[10px]">
              {langLabel}
            </span>
          </div>
        </div>

        {/* 编辑器容器 */}
        <div className="flex-1 overflow-hidden flex relative min-h-0">
          {/* 高亮层：与 textarea 共用唯一一处 p-6；去掉 hljs 给 pre code 的额外 padding，否则会和输入错位一行 */}
          <pre
            ref={highlightLayerRef}
            className="code-editor-highlight-layer absolute inset-0 m-0 p-6 bg-[#1A1C1E] text-emerald-50 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words overflow-auto pointer-events-none [tab-size:2]"
          >
            <code
              className="hljs language-java !m-0 !bg-transparent !p-0 block min-w-0 whitespace-pre-wrap break-words [tab-size:2]"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>

          <textarea
            ref={textareaRef}
            className="relative z-[1] flex-1 w-full min-h-0 m-0 p-6 bg-transparent text-emerald-50 font-mono text-[12px] outline-none leading-relaxed resize-none overflow-auto custom-scrollbar whitespace-pre-wrap break-words [tab-size:2]"
            style={{
              color: 'transparent',
              caretColor: '#a7f3d0',
              backgroundColor: 'transparent',
            }}
            spellCheck="false"
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleCodeKeyDown}
            onScroll={(e) => {
              const ta = e.target
              const pre = highlightLayerRef.current
              if (pre && pre.scrollTop !== ta.scrollTop) {
                pre.scrollTop = ta.scrollTop
              }
              if (pre && pre.scrollLeft !== ta.scrollLeft) {
                pre.scrollLeft = ta.scrollLeft
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
