import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProblem, getSolutionDemo } from '../api/leetcode'
import { useI18n } from '../i18n'

// 题目详情：题目内容 + HTML 题解演示（iframe 沙箱）
export default function ProblemDetail() {
  const { t } = useI18n()
  const { id } = useParams()
  const [problem, setProblem] = useState(null)
  const [demoHtml, setDemoHtml] = useState(null)
  const [tab, setTab] = useState('content') // content / demo
  const [error, setError] = useState('')

  useEffect(() => {
    getProblem(id)
      .then((res) => {
        const p = res.data || res
        setProblem(p)
        if (p.has_html_demo) {
          getSolutionDemo(id)
            .then((r) => setDemoHtml(r.data || r))
            .catch(() => {})
        }
      })
      .catch((e) => setError(e.message))
  }, [id])

  if (error) return <div className="p-8 text-sm text-red-500">{t('加载失败：')}{error}</div>
  if (!problem) return <div className="p-8 text-sm text-neutral-400">{t('加载中…')}</div>

  const content = (problem.translated_content || problem.content || '')
  const tags = (() => {
    try {
      const parsed = typeof problem.topic_tags === 'string' ? JSON.parse(problem.topic_tags) : problem.topic_tags
      return Array.isArray(parsed) ? parsed.map((t) => t.name || t.nameTranslated || t).filter(Boolean) : []
    } catch {
      return (problem.topic_tags || '').split(',').filter(Boolean)
    }
  })()

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-neutral-400">{problem.lc_frontend_id}</div>
          <h1 className="text-xl font-semibold text-neutral-900">
            {problem.translated_title || problem.title}
          </h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
          { Easy: 'text-emerald-600 bg-emerald-50', Medium: 'text-amber-600 bg-amber-50', Hard: 'text-red-600 bg-red-50' }[problem.difficulty] || ''
        }`}>
          {problem.difficulty}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-500">{t}</span>
          ))}
        </div>
      )}

      {/* Tab 切换：题目内容 / HTML 演示 */}
      <div className="mt-6 flex gap-2 border-b border-neutral-200">
        {[
          ['content', t('题目')],
          ...(problem.has_html_demo ? [['demo', t('题解演示')]] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === key ? 'border-primary-500 font-medium text-primary-600' : 'border-transparent text-neutral-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'content' && (
          <div
            className="prose prose-sm max-w-none text-neutral-700 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-neutral-900 [&_pre]:p-4 [&_pre]:text-neutral-100"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
        {tab === 'demo' && (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {/* HTML 题解以 iframe 沙箱渲染，禁止脚本直接触达应用上下文 */}
            <iframe
              title="solution-demo"
              sandbox="allow-scripts allow-same-origin"
              className="h-[70vh] w-full"
              srcDoc={typeof demoHtml === 'string' ? demoHtml : ''}
            />
          </div>
        )}
      </div>
    </div>
  )
}
