import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import {
  Check,
  Eye,
  Pencil,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  Square,
  Layers,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Maximize2,
  X,
} from 'lucide-react'
import { chatStream, cancelChat } from '../api/ai'
import { fetchDefaultLangSlug, resolveLangSlug } from '../utils/codeLang'
import {
  getSolutionDemo,
  putSolutionDemo,
  getSolutionSchemes,
  createSolutionScheme,
  updateSolutionScheme,
  deleteSolutionScheme,
} from '../api/leetcode'

const HLJS_LANGS = {
  java: 'java',
  python: 'python',
  python3: 'python',
  cpp: 'cpp',
  c: 'c',
  csharp: 'csharp',
  javascript: 'javascript',
  typescript: 'typescript',
  go: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  ruby: 'ruby',
  php: 'php',
  mysql: 'sql',
}

const DEFAULT_KEY = 'default'

const AI_DEMO_SYSTEM_PROMPT =
  '你是一位资深算法可视化工程师，擅长把给定的解题代码制作成单文件 HTML 交互演示。' +
  '你只输出一个完整的 HTML 文档（以 <!DOCTYPE html> 开头），不要输出任何解释、Markdown 代码围栏或寒暄。'

const stripHtml = (html) => {
  if (!html) return ''
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

// 从 AI 返回文本中提取完整 HTML（容忍代码围栏与前后杂文本）
const extractHtml = (text) => {
  let t = (text || '').trim()
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fence && /<(!DOCTYPE|html)/i.test(fence[1])) t = fence[1]
  const m = t.match(/<!DOCTYPE[\s\S]*/i) || t.match(/<html[\s\S]*/i)
  return (m ? m[0] : t).trim()
}

function buildDemoPrompt({ title, difficulty, content, examples, constraints, langSlug, code }) {
  const exText = (examples || [])
    .map((ex, i) => `示例 ${i + 1}: 输入 ${ex.input} | 输出 ${ex.output}${ex.explanation ? ` | 解释 ${ex.explanation}` : ''}`)
    .join('\n')

  return [
    `# 题目：${title}（${difficulty || '未知难度'}）`,
    `## 题目内容\n${content || '（暂无）'}`,
    examples?.length ? `## 示例\n${exText}` : '',
    constraints?.length ? `## 约束\n${constraints.join('\n')}` : '',
    `## 待演示的代码实现（${(langSlug || 'code').toUpperCase()}）\n\`\`\`\n${code}\n\`\`\``,
    [
      '## 任务',
      '请针对上面的题目与这段具体代码，生成一个可交互的算法执行过程演示页面（单文件 HTML），要求：',
      '1. 顶部提供关键参数输入框（默认填入一组典型用例）与「初始化/重置」「下一步」按钮，支持逐步执行与随时重置。',
      '2. 页面左侧（或主区）可视化该算法用到的数据结构随执行变化的过程（数组/指针/哈希表/栈/队列/树等，按题目选择最合适的形式），当前操作元素需醒目高亮。',
      '3. 页面右侧以深色代码面板展示这道题的完整代码，执行时高亮当前行（参考 .code-line / .line-active 样式）。',
      '4. 提供控制台日志区域，每一步输出一句中文说明；结束时给出结果徽标（成功/失败、返回值等）。',
      '5. 单文件、无需构建即可直接在浏览器打开运行；样式可使用 <script src="https://cdn.tailwindcss.com"></script>，文案与注释使用中文。',
      '6. 演示逻辑必须与给出的代码逐行对应（可以拆成更细的子步骤），不得展示与该代码无关的其他算法。',
    ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function SolutionSchemesTab({ activeProblem, updateProblem, defaultOnly = false }) {
  const problemId = activeProblem?.id
  const [schemes, setSchemes] = useState([]) // 额外方案（不含默认实现）
  const [loading, setLoading] = useState(true)
  // null = 列表视图；否则为当前打开（独立抽屉展示）的方案 key
  const [selectedKey, setSelectedKey] = useState(defaultOnly ? DEFAULT_KEY : null)
  const [defaultDemo, setDefaultDemo] = useState('') // 默认实现的演示 HTML（文件存储）
  const [demoText, setDemoText] = useState('') // 当前选中方案的演示 HTML（可编辑缓冲）
  const [demoDirty, setDemoDirty] = useState(false)
  const [demoMode, setDemoMode] = useState('edit') // edit | preview
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  // 自定义方案草稿（name/code，切换方案时重置）
  const [draft, setDraft] = useState({ name: '', code: '' })
  const [draftDirty, setDraftDirty] = useState(false)
  // 删除确认
  const [confirmKey, setConfirmKey] = useState(null)
  // AI 生成
  const [aiState, setAiState] = useState('idle') // idle | streaming | error
  const [aiStreamText, setAiStreamText] = useState('')
  const [aiError, setAiError] = useState('')
  const aiAbortRef = useRef(false)

  const load = useCallback(async () => {
    if (!problemId) return
    setLoading(true)
    setSaveStatus('')
    try {
      const [schemeRes, demoRes] = await Promise.allSettled([
        getSolutionSchemes(problemId),
        getSolutionDemo(problemId),
      ])
      const list = schemeRes.status === 'fulfilled' ? schemeRes.value?.data || [] : []
      const demoHtml =
        demoRes.status === 'fulfilled' ? demoRes.value?.data?.html || '' : ''
      setSchemes(list)
      setDefaultDemo(demoHtml)
    } catch (e) {
      console.error(e)
      setSchemes([])
      setDefaultDemo('')
    } finally {
      setLoading(false)
    }
  }, [problemId])

  useEffect(() => {
    load()
  }, [load])

  // 切换题目 / 选择方案时重置编辑缓冲与 AI 状态（缓冲仅由详情抽屉消费 &
  // 编辑，与列表视图完全隔离，避免列表视图产生无谓的渲染开销）
  useEffect(() => {
    setAiState('idle')
    setAiError('')
    setAiStreamText('')
    aiAbortRef.current = false
    setConfirmKey(null)
    setDraftDirty(false)
    setDemoDirty(false)
    setSaveStatus('')
    if (selectedKey === DEFAULT_KEY) {
      setDraft({ name: '', code: '' })
      setDemoText(defaultDemo)
      const has = (defaultDemo || '').trim().length > 0
      setDemoMode(has ? 'preview' : 'edit')
    } else if (selectedKey) {
      const s = schemes.find((x) => x.id === selectedKey)
      if (s) {
        setDraft({ name: s.name || '', code: s.code || '' })
        setDemoText(s.html_demo || '')
        const has = (s.html_demo || '').trim().length > 0
        setDemoMode(has ? 'preview' : 'edit')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, problemId])

  // 默认实现演示从远端加载完成后同步缓冲
  useEffect(() => {
    if (selectedKey === DEFAULT_KEY && !demoDirty) {
      setDemoText(defaultDemo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDemo])

  // 切换题目时回到列表视图
  useEffect(() => {
    setSelectedKey(defaultOnly ? DEFAULT_KEY : null)
  }, [problemId, defaultOnly])

  const selected = useMemo(() => {
    if (selectedKey === DEFAULT_KEY) {
      return {
        key: DEFAULT_KEY,
        isDefault: true,
        name: '',
        code: activeProblem?.code || '',
        html: defaultDemo,
      }
    }
    if (!selectedKey) return null
    const s = schemes.find((x) => x.id === selectedKey)
    if (!s) return null
    return {
      key: s.id,
      isDefault: false,
      name: draftDirty ? draft.name : s.name || '',
      code: draftDirty ? draft.code : s.code || '',
      html: s.html_demo || '',
    }
  }, [selectedKey, schemes, draft, draftDirty, defaultDemo, activeProblem?.code])

  const displayName = (item) => {
    if (!item) return ''
    if (item.isDefault) return '默认实现'
    return (item.name || '').trim() || '未命名方案'
  }

  // ===== 方案 CRUD =====
  const handleAddScheme = async () => {
    if (!problemId || loading) return
    try {
      const res = await createSolutionScheme(problemId, { name: '', code: '' })
      const created = res?.data
      if (!created) return
      setSchemes((prev) => [...prev, created])
      setSelectedKey(created.id) // 新建后自动打开该方案的详情抽屉
    } catch (e) {
      console.error(e)
      setSaveStatus(e.message || '新增方案失败')
      setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  const handleDeleteScheme = async (schemeId) => {
    if (confirmKey !== schemeId) {
      setConfirmKey(schemeId)
      return
    }
    setConfirmKey(null)
    try {
      await deleteSolutionScheme(problemId, schemeId)
      setSchemes((prev) => prev.filter((s) => s.id !== schemeId))
      // 若删除的是当前打开的方案，关闭抽屉回到列表
      if (selectedKey === schemeId) setSelectedKey(null)
    } catch (e) {
      console.error(e)
      setSaveStatus(e.message || '删除失败')
      setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  const handleSaveScheme = async () => {
    if (!selected || selected.isDefault) return
    setSaving(true)
    setSaveStatus('保存中…')
    try {
      const res = await updateSolutionScheme(problemId, selected.key, {
        name: draft.name,
        code: draft.code,
      })
      const updated = res?.data
      setSchemes((prev) => prev.map((s) => (s.id === selected.key ? updated || s : s)))
      setDraftDirty(false)
      setSaveStatus('已保存')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (e) {
      console.error(e)
      setSaveStatus(e.message || '保存失败')
      setTimeout(() => setSaveStatus(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  // ===== 演示 HTML =====
  const handleDemoChange = (v) => {
    setDemoText(v)
    setDemoDirty(true)
  }

  const handleSaveDemo = async () => {
    if (!selected || saving) return
    setSaving(true)
    setSaveStatus('保存中…')
    try {
      if (selected.isDefault) {
        await putSolutionDemo(problemId, demoText)
        setDefaultDemo(demoText)
        updateProblem({ ...activeProblem, hasHtmlDemo: demoText.trim() ? 1 : 0 })
      } else {
        const res = await updateSolutionScheme(problemId, selected.key, { html: demoText })
        const updated = res?.data
        setSchemes((prev) => prev.map((s) => (s.id === selected.key ? updated || s : s)))
      }
      setDemoDirty(false)
      setSaveStatus('已保存')
      setDemoMode(demoText.trim() ? 'preview' : 'edit')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (e) {
      console.error(e)
      setSaveStatus(e.message || '保存失败')
      setTimeout(() => setSaveStatus(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenDemoWindow = () => {
    const html = demoText || '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><p>暂无演示内容</p></body></html>'
    const previewUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const previewWindow = window.open(previewUrl, '_blank')
    if (!previewWindow) {
      URL.revokeObjectURL(previewUrl)
      setSaveStatus('浏览器阻止了新窗口，请允许弹出窗口后重试')
      setTimeout(() => setSaveStatus(''), 3000)
      return
    }
    previewWindow.opener = null
  }

  // ===== AI 生成演示 =====
  const handleStopAI = () => {
    if (!aiAbortRef.current) return
    aiAbortRef.current = true
    cancelChat().catch(() => {})
  }

  const handleAIDemo = async () => {
    if (!selected || aiState === 'streaming') return
    const code = (selected.code || '').trim()
    if (!code) {
      setAiError('当前方案没有代码实现，无法生成演示')
      setAiState('error')
      return
    }

    const title = activeProblem.translatedTitle || activeProblem.title || ''
    const content = stripHtml(
      activeProblem.translatedContent || activeProblem.content || '',
    ).slice(0, 8000)
    const langSlug =
      resolvedLangSlug || activeProblem.codeSnippets?.[0]?.langSlug || activeProblem.codeSnippets?.[0]?.lang || ''

    setAiState('streaming')
    setAiError('')
    setAiStreamText('')
    aiAbortRef.current = false

    let buffer = ''
    let errText = ''
    try {
      await chatStream(
        {
          message: buildDemoPrompt({
            title,
            difficulty: activeProblem.difficulty,
            content,
            examples: activeProblem.examples,
            constraints: activeProblem.constraints,
            langSlug,
            code,
          }),
          systemPrompt: AI_DEMO_SYSTEM_PROMPT,
        },
        ({ event, data }) => {
          if (event === 'delta') {
            buffer += data
            setAiStreamText(buffer)
          } else if (event === 'error') {
            errText = String(data)
            setAiError(errText)
          }
        },
      )

      if (!buffer.trim()) {
        setAiState('error')
        if (!errText) setAiError('AI 未返回内容')
        return
      }

      const html = extractHtml(buffer)
      if (!/<(!DOCTYPE|html)/i.test(html)) {
        setAiState('error')
        setAiError('AI 返回的内容不是完整 HTML，请重试')
        return
      }

      // 直接写入当前方案的演示并保存
      setDemoText(html)
      setDemoMode('preview')
      if (selected.isDefault) {
        setDefaultDemo(html)
        await putSolutionDemo(problemId, html)
        updateProblem({ ...activeProblem, hasHtmlDemo: 1 })
      } else {
        const res = await updateSolutionScheme(problemId, selected.key, { html })
        const updated = res?.data
        setSchemes((prev) => prev.map((s) => (s.id === selected.key ? updated || s : s)))
      }
      setDemoDirty(false)
      setSaveStatus('演示已生成并保存')
      setTimeout(() => setSaveStatus(''), 2500)
      setAiState('idle')
    } catch (e) {
      console.error('AI 生成演示失败:', e)
      setAiError(e.message || 'AI 生成失败')
      setAiState('error')
    }
  }

  // 代码语言：跟随「设置 → 默认目标语言」自动切换（代码面板标签 / 高亮 / AI 演示提示共用）
  // 注意：必须定义在 highlightedDefaultCode 等 useMemo 之前，否则会产生 TDZ 引用错误
  const [defaultLangSlug, setDefaultLangSlug] = useState('')
  useEffect(() => {
    let alive = true
    fetchDefaultLangSlug().then((slug) => {
      if (alive && slug) setDefaultLangSlug(slug)
    })
    return () => {
      alive = false
    }
  }, [])
  const resolvedLangSlug =
    resolveLangSlug(activeProblem?.codeSnippets, defaultLangSlug) ||
    activeProblem?.codeSnippets?.[0]?.langSlug ||
    activeProblem?.codeSnippets?.[0]?.lang ||
    'java'

  // 默认实现代码高亮（只读）
  const highlightedDefaultCode = useMemo(() => {
    const code = activeProblem?.code || ''
    if (!code) return ''
    const lang = HLJS_LANGS[resolvedLangSlug]
    try {
      if (lang) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      /* fallthrough */
    }
    return hljs.highlightAuto(code).value
  }, [activeProblem?.code, resolvedLangSlug])

  // 方案统计信息（用于列表视图的展示）
  const stats = useMemo(() => {
    const demoCount = schemes.filter((s) => (s.html_demo || '').trim()).length
    return {
      total: schemes.length + 1, // 含默认实现
      hasDefaultCode: !!(activeProblem?.code || '').trim(),
      hasDefaultDemo: !!(defaultDemo || '').trim(),
      customDemoCount: demoCount,
    }
  }, [schemes, activeProblem?.code, defaultDemo])

  // 键盘 ESC 关闭抽屉
  useEffect(() => {
    if (!selected) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // 抽屉布局：代码区 / 演示区的显示与隐藏（都隐藏时自动进入纯编辑态，此时只显示演示区避免空白）
  const [showCode, setShowCode] = useState(true)
  const [showDemo, setShowDemo] = useState(true)
  // 打开新方案时可保持布局偏好，无需重置

  if (!problemId) return null

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="animate-spin" size={20} />
        <span className="text-xs font-medium">加载解题方案中…</span>
      </div>
    )
  }

  const streamPreview = extractHtml(aiStreamText)

  // ===== 列表视图（默认）：满屏展示方案列表 =====
  return (
    <>
      <div className={defaultOnly ? 'hidden' : 'animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col min-h-0 min-w-0'}>
        {/* 顶部工具条 */}
        <div className="flex items-center justify-between gap-2 shrink-0 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary-50 border border-primary-100">
              <Layers size={14} className="text-primary-600" />
              <span className="text-[11px] font-bold text-primary-700 tracking-tight">
                解题方案
              </span>
              <span className="text-[10px] font-mono text-primary-500 bg-white px-1.5 py-0.5 rounded-md border border-primary-100">
                {stats.total}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">点击卡片查看 / 编辑方案详情</span>
          </div>
          <button
            type="button"
            onClick={handleAddScheme}
            disabled={loading}
            title="新增解题方案"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-[11px] font-bold hover:bg-primary-700 disabled:opacity-50 active:scale-95 transition-all shadow-sm"
          >
            <Plus size={13} />
            新增方案
          </button>
        </div>

        {/* 方案卡片列表 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 pr-0.5 scroll-smooth">
          {stats.total === 1 && !stats.hasDefaultCode && schemes.length === 0 ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-300">
              <Layers size={40} strokeWidth={1.5} />
              <p className="text-xs font-medium text-slate-400">还没有任何解题方案</p>
              <p className="text-[10px] text-slate-400">
                点击右上角「新增方案」，或先在「代码实现」标签中编写默认实现
              </p>
              <button
                type="button"
                onClick={handleAddScheme}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-[11px] font-bold hover:bg-primary-700 active:scale-95 transition-all shadow-sm"
              >
                <Plus size={13} />
                新增方案
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
              <SchemeCard
                label="默认实现"
                hint="与「代码实现」共享同一份代码"
                isDefault
                hasCode={stats.hasDefaultCode}
                hasDemo={stats.hasDefaultDemo}
                onClick={() => setSelectedKey(DEFAULT_KEY)}
              />
              {schemes.map((s) => (
                <SchemeCard
                  key={s.id}
                  label={(s.name || '').trim() || '未命名方案'}
                  hasCode={!!(s.code || '').trim()}
                  hasDemo={!!(s.html_demo || '').trim()}
                  onClick={() => setSelectedKey(s.id)}
                  confirmingDelete={confirmKey === s.id}
                  onDelete={() => handleDeleteScheme(s.id)}
                />
              ))}
              {/* 新增占位卡片 */}
              <button
                type="button"
                onClick={handleAddScheme}
                disabled={loading}
                className="group min-h-[92px] rounded-2xl border-2 border-dashed border-slate-200 bg-transparent flex flex-col items-center justify-center gap-1.5 text-slate-300 hover:border-primary-300 hover:bg-primary-50/40 hover:text-primary-500 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <Plus size={20} strokeWidth={2.5} />
                <span className="text-[11px] font-bold">新增解题方案</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== 方案详情抽屉（独立大窗口） ===== */}
      {selected &&
        createPortal(
          <div className={defaultOnly ? 'absolute inset-0 z-10 flex overflow-hidden antialiased' : 'fixed inset-0 z-[80] flex justify-end overflow-hidden antialiased'}>
            {!defaultOnly && <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-300"
              onClick={() => setSelectedKey(null)}
            />}
            <div className={defaultOnly ? 'relative w-full h-full bg-[#FAFAFA] flex flex-col' : 'relative w-full max-w-[92%] h-full bg-[#FAFAFA] shadow-2xl flex flex-col animate-in slide-in-from-right-10 fade-in duration-300'}>
              {/* 抽屉头部 */}
              <div className="px-6 py-4 border-b border-slate-100 bg-white flex items-center gap-3 shrink-0">
                {!defaultOnly && <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  title="返回方案列表（Esc）"
                  className="flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-[11px] font-bold hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition-all shrink-0"
                >
                  <ChevronLeft size={14} />
                  返回列表
                </button>}
                <div className="h-6 w-px bg-slate-100 shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  {selected.isDefault ? (
                    <>
                      <span className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-[11px] font-bold shrink-0">
                        默认实现
                      </span>
                      {!defaultOnly && <span className="text-[11px] text-slate-400 truncate">
                        代码与「代码实现」标签共享，可直接在此查看
                      </span>}
                    </>
                  ) : (
                    <>
                      <FileCode2 size={16} className="text-primary-500 shrink-0" />
                      <input
                        value={draft.name}
                        onChange={(e) => {
                          setDraft({ ...draft, name: e.target.value })
                          setDraftDirty(true)
                        }}
                        placeholder="方案名称（如：双指针、滑动窗口…）"
                        className="flex-1 min-w-0 max-w-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 ring-primary-100"
                      />
                      <button
                        type="button"
                        onClick={handleSaveScheme}
                        disabled={saving || aiState === 'streaming' || !draftDirty}
                        className="px-3 py-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
                      >
                        保存方案
                      </button>
                    </>
                  )}
                </div>
                {saveStatus && (
                  <span
                    className={`text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                      saveStatus.startsWith('已保存') || saveStatus.includes('已生成')
                        ? 'text-primary-600'
                        : 'text-slate-500'
                    }`}
                  >
                    {saveStatus.startsWith('已保存') && <Check size={12} />}
                    {saveStatus}
                  </span>
                )}
                {aiError && (
                  <span
                    className="text-[10px] font-bold flex items-center gap-1 text-rose-600 max-w-[220px] truncate shrink-0"
                    title={aiError}
                  >
                    <AlertTriangle size={11} /> {aiError}
                  </span>
                )}
                <div className="h-6 w-px bg-slate-100 shrink-0" />
                {!defaultOnly && <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  title="关闭（Esc）"
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition-all shrink-0"
                >
                  <X size={16} />
                </button>}
              </div>

              {/* 抽屉内容：左右分栏（可折叠）充分利用空间 */}
              <div className="flex-1 overflow-hidden p-6 flex flex-col gap-4 min-h-0 min-w-0">
                {/* 操作栏：演示模式切换 + AI + 保存 + 面板显隐 */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    演示 HTML
                  </span>
                  <div
                    className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50/90 shrink-0"
                    role="tablist"
                    aria-label="演示编辑或预览"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={demoMode === 'edit'}
                      onClick={() => setDemoMode('edit')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                        demoMode === 'edit'
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Pencil size={12} />
                      编辑
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={demoMode === 'preview'}
                      onClick={() => demoText.trim() && setDemoMode('preview')}
                      disabled={!demoText.trim()}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        demoMode === 'preview'
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Eye size={12} />
                      预览
                    </button>
                  </div>
                  {aiState === 'streaming' ? (
                    <button
                      type="button"
                      onClick={handleStopAI}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-300 shrink-0"
                    >
                      <Square size={10} fill="currentColor" />
                      停止
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAIDemo}
                      disabled={saving}
                      title="AI 根据题目内容与当前方案的代码实现，生成可交互的 HTML 执行演示"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-primary-600 text-white text-[10px] font-bold hover:from-violet-700 hover:to-primary-700 disabled:opacity-50 shrink-0 shadow-sm transition-all"
                    >
                      <Sparkles size={12} />
                      AI 演示
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveDemo}
                    disabled={saving || aiState === 'streaming' || !demoDirty}
                    className="px-3 py-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    保存演示
                  </button>
                  <div className="flex-1" />
                  {demoDirty && (
                    <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      未保存
                    </span>
                  )}

                  {/* 面板显隐切换：隐藏另一侧后当前面板占满整行 */}
                  {!defaultOnly && <div
                    className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50/90 shrink-0"
                    role="group"
                    aria-label="面板显隐"
                  >
                    <button
                      type="button"
                      aria-pressed={showCode}
                      disabled={showCode && !showDemo}
                      onClick={() => setShowCode((v) => !v)}
                      title={
                        showCode
                          ? showDemo
                            ? '隐藏左侧代码面板，演示区扩到整行'
                            : '至少保留一个面板'
                          : '显示左侧代码面板'
                      }
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        showCode
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <FileCode2 size={12} />
                      代码
                      {showCode ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                    </button>
                    <button
                      type="button"
                      aria-pressed={showDemo}
                      disabled={showDemo && !showCode}
                      onClick={() => setShowDemo((v) => !v)}
                      title={
                        showDemo
                          ? showCode
                            ? '隐藏右侧演示面板，代码区扩到整行'
                            : '至少保留一个面板'
                          : '显示右侧演示面板'
                      }
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        showDemo
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Eye size={12} />
                      演示
                      {showDemo ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
                    </button>
                  </div>}
                  {defaultOnly && <button
                    type="button"
                    onClick={handleOpenDemoWindow}
                    title="在新窗口中打开 HTML 演示"
                    aria-label="在新窗口中打开 HTML 演示"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 transition-colors shrink-0"
                  >
                    <Maximize2 size={14} />
                  </button>}
                </div>

                {/* 主体：左右分栏（代码 | 演示），可折叠，隐藏一侧后另一侧占满整行 */}
                <div className="flex-1 min-h-0 flex gap-4 min-w-0">
                  {/* 左：代码区 */}
                  {showCode && !defaultOnly && (
                    <div
                      className={`${
                        showDemo
                          ? 'w-[42%] min-w-[320px]'
                          : 'flex-1 min-w-0'
                      } shrink-0 flex flex-col rounded-2xl overflow-hidden border border-slate-900/10 shadow-xl ${
                        showDemo ? '' : 'shrink'
                      }`}
                    >
                    <div className="bg-[#1A1C1E] px-4 py-2.5 flex justify-between items-center text-[10px] font-mono text-slate-500 shrink-0 border-b border-white/5">
                      <span className="font-bold tracking-widest uppercase italic">
                        solution.{selected.isDefault ? 'default' : 'scheme'}
                      </span>
                      <span className="text-primary-500 font-bold opacity-80 uppercase tracking-widest">
                        {(resolvedLangSlug || 'code').toUpperCase()}
                      </span>
                    </div>
                    {selected.isDefault ? (
                      <div className="flex-1 overflow-auto custom-scrollbar bg-[#1A1C1E] p-4 m-0">
                        {(activeProblem.code || '').trim() ? (
                          <pre className="m-0 font-mono text-[12px] leading-relaxed text-emerald-50 whitespace-pre-wrap break-words [tab-size:2]">
                            <code
                              className="hljs !bg-transparent !p-0"
                              dangerouslySetInnerHTML={{ __html: highlightedDefaultCode }}
                            />
                          </pre>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-500 text-xs text-center px-4">
                            暂无代码，请先在「代码实现」标签中编写
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea
                        className="flex-1 w-full m-0 p-4 bg-[#1A1C1E] text-emerald-50 font-mono text-[12px] leading-relaxed outline-none resize-none overflow-auto custom-scrollbar whitespace-pre-wrap break-words [tab-size:2] caret-emerald-200"
                        spellCheck={false}
                        placeholder="在此粘贴或编辑该方案的代码实现…"
                        value={draft.code}
                        onChange={(e) => {
                          setDraft({ ...draft, code: e.target.value })
                          setDraftDirty(true)
                        }}
                      />
                    )}
                  </div>
                  )}

                  {/* 右：演示区（showDemo 为 false 时不渲染） */}
                  {showDemo && (
                    <div
                      className={
                          showCode && !defaultOnly
                          ? 'flex-1 min-h-0 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-inner flex flex-col min-w-0'
                          : 'flex-1 min-h-0 min-w-0 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-inner flex flex-col'
                      }
                    >
                    {aiState === 'streaming' ? (
                      <div className="flex-1 flex flex-col min-h-0 bg-slate-950 p-3">
                        <div className="flex items-center gap-2 text-violet-300 text-[10px] font-bold mb-2 shrink-0">
                          <Loader2 size={12} className="animate-spin" />
                          AI 正在生成演示 HTML…
                        </div>
                        <pre className="flex-1 overflow-auto custom-scrollbar m-0 font-mono text-[10px] leading-relaxed text-emerald-300 whitespace-pre-wrap break-all">
                          {streamPreview || aiStreamText}
                        </pre>
                      </div>
                    ) : demoMode === 'edit' ? (
                      <textarea
                        className="flex-1 min-h-0 w-full p-4 font-mono text-[12px] leading-relaxed text-slate-800 outline-none resize-none custom-scrollbar"
                        spellCheck={false}
                        placeholder="点击「AI 演示」让 AI 根据题目与当前方案代码生成交互演示；也可以在此手动粘贴或编辑 HTML…"
                        value={demoText}
                        onChange={(e) => handleDemoChange(e.target.value)}
                      />
                    ) : !demoText.trim() ? (
                      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Sparkles size={24} className="text-slate-300" />
                        <p className="text-xs font-medium">暂无演示内容</p>
                        <p className="text-[10px] text-slate-400">
                          点击上方「AI 演示」生成，或切换到「编辑」手动添加
                        </p>
                      </div>
                    ) : (
                      <iframe
                        title="解题方案演示"
                        className="flex-1 w-full min-h-0 border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin"
                        srcDoc={demoText}
                      />
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          defaultOnly ? (document.getElementById('detail-demo-host') || document.body) : document.body
        )}
    </>
  )
}

function SchemeCard({
  label,
  hint,
  isDefault,
  hasCode,
  hasDemo,
  onClick,
  confirmingDelete,
  onDelete,
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative min-h-[92px] px-4 py-3.5 rounded-2xl cursor-pointer border flex flex-col gap-2 transition-all ${
        isDefault
          ? 'bg-gradient-to-br from-primary-50/80 to-white border-primary-100 hover:border-primary-300 hover:shadow-lg hover:shadow-primary-100/50'
          : 'bg-white border-slate-200 hover:border-primary-200 hover:shadow-lg hover:shadow-slate-100'
      } active:scale-[0.99]`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-bold truncate ${
            isDefault ? 'text-primary-700' : 'text-slate-700 group-hover:text-primary-700'
          }`}
        >
          {label}
        </span>
        {isDefault && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-primary-600 text-white text-[9px] font-bold">
            默认
          </span>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400 truncate leading-relaxed">{hint}</p>}
      <div className="flex items-center gap-1.5 mt-auto">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
            hasCode
              ? 'bg-slate-50 text-slate-500 border-slate-100'
              : 'bg-slate-50 text-slate-300 border-slate-100'
          }`}
        >
          <FileCode2 size={9} />
          代码
        </span>
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
            hasDemo
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
              : 'bg-slate-50 text-slate-300 border-slate-100'
          }`}
        >
          <Eye size={9} />
          演示
        </span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-slate-300 group-hover:text-primary-500 transition-colors">
          打开
          <ChevronRight size={11} />
        </span>
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={confirmingDelete ? '再点一次确认删除' : '删除该方案'}
          className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg transition-all ${
            confirmingDelete
              ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
              : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100'
          }`}
        >
          {confirmingDelete ? <AlertTriangle size={13} /> : <Trash2 size={13} />}
        </button>
      )}
    </div>
  )
}
