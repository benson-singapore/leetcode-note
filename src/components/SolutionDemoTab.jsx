import { useState, useEffect, useCallback } from 'react'
import { Check, Eye, Pencil, Loader2 } from 'lucide-react'
import { getSolutionDemo, putSolutionDemo } from '../api/leetcode'

export function SolutionDemoTab({ activeProblem, updateProblem }) {
  const [mode, setMode] = useState('edit')
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

  const problemId = activeProblem?.id

  const load = useCallback(async () => {
    if (!problemId) return
    setLoading(true)
    setSaveStatus('')
    try {
      const res = await getSolutionDemo(problemId)
      const next = res?.data?.html || ''
      setHtml(next)
      const has = (next || '').trim().length > 0
      setMode(has ? 'preview' : 'edit')
    } catch (e) {
      console.error(e)
      setHtml('')
      setMode('edit')
    } finally {
      setLoading(false)
    }
  }, [problemId])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    if (!problemId) return
    setSaving(true)
    setSaveStatus('保存中…')
    try {
      await putSolutionDemo(problemId, html)
      const has = (html || '').trim().length > 0
      updateProblem({ ...activeProblem, hasHtmlDemo: has })
      setSaveStatus('已保存')
      setMode(has ? 'preview' : 'edit')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch (e) {
      console.error(e)
      setSaveStatus(e.message || '保存失败')
      setTimeout(() => setSaveStatus(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  const previewSrc = html || ''

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between px-2 shrink-0">
        <div className="flex items-center gap-3 text-primary-600">
          <Pencil size={14} />
          <label className="text-[10px] font-semibold text-primary-600 tracking-tight">
            HTML 解题演示
          </label>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50/90"
            role="tablist"
            aria-label="演示编辑或预览"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'edit'}
              onClick={() => setMode('edit')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                mode === 'edit'
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
              aria-selected={mode === 'preview'}
              onClick={() => (html || '').trim() && setMode('preview')}
              disabled={!(html || '').trim()}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === 'preview'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Eye size={12} />
              预览
            </button>
          </div>
          {saveStatus && (
            <span
              className={`text-[10px] font-bold flex items-center gap-1 ${
                saveStatus === '已保存' ? 'text-primary-600' : 'text-slate-500'
              }`}
            >
              {saveStatus === '已保存' && <Check size={12} />}
              {saveStatus}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-3 py-1.5 bg-primary-600 text-white text-[10px] font-semibold rounded-lg hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            {saving ? '保存中' : '保存到文件'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-xs font-medium">加载中…</span>
        </div>
      ) : mode === 'edit' ? (
        <textarea
          className="flex-1 min-h-[240px] w-full p-4 rounded-xl border border-slate-200 bg-white font-mono text-[12px] leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-primary-500/30 resize-none custom-scrollbar"
          spellCheck={false}
          placeholder="在此粘贴或编辑 HTML…"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
        />
      ) : (
        <div className="flex-1 min-h-[240px] rounded-xl border border-slate-200 bg-white overflow-hidden shadow-inner flex flex-col min-w-0">
          {!previewSrc.trim() ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs font-medium">
              暂无内容，请切换到「编辑」添加 HTML 并保存
            </div>
          ) : (
            <iframe
              title="解题演示预览"
              className="flex-1 w-full min-h-0 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin"
              srcDoc={previewSrc}
            />
          )}
        </div>
      )}
    </div>
  )
}
