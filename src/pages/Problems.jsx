import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { getProblems, fetchLeetCodeProblem } from '../api/leetcode'

const difficultyColor = {
  Easy: 'text-emerald-600 bg-emerald-50',
  Medium: 'text-amber-600 bg-amber-50',
  Hard: 'text-red-600 bg-red-50',
}

export default function Problems() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, page_size: 16, total_pages: 0 })
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const load = (p = 1) => {
    setLoading(true)
    getProblems({ page: p, page_size: 16, keyword })
      .then((res) => setData(res.data || res))
      .catch((e) => setMsg(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, []) // eslint-disable-line

  const handleFetch = async () => {
    if (!slug.trim()) return
    setMsg('')
    try {
      await fetchLeetCodeProblem({ titleSlug: slug.trim() })
      setSlug('')
      load(1)
      setMsg('抓取成功')
    } catch (e) {
      setMsg(`抓取失败: ${e.message}`)
    }
  }

  const items = data.items || []

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">题库</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(1)}
              placeholder="搜索题目"
              className="h-9 w-56 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-primary-400"
            />
          </div>
          <div className="flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-1">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              placeholder="title-slug 抓取"
              className="w-36 bg-transparent px-2 text-sm outline-none"
            />
            <button
              onClick={handleFetch}
              className="flex items-center gap-1 rounded-md bg-primary-500 px-2 py-1 text-xs text-white hover:bg-primary-600"
            >
              <Download size={13} /> 抓取
            </button>
          </div>
        </div>
      </div>

      {msg && <p className="mt-2 text-xs text-neutral-500">{msg}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs text-neutral-400">
              <th className="px-5 py-3 font-medium">#</th>
              <th className="px-5 py-3 font-medium">题目</th>
              <th className="px-5 py-3 font-medium">难度</th>
              <th className="px-5 py-3 font-medium">标签</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-neutral-400">加载中…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-neutral-400">题库为空，右上角输入 titleSlug 抓取第一道题</td></tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50">
                <td className="px-5 py-3 text-neutral-400">{p.lc_frontend_id || '-'}</td>
                <td className="px-5 py-3">
                  <Link to={`/problems/${p.id}`} className="font-medium text-neutral-800 hover:text-primary-600">
                    {p.translated_title || p.title}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${difficultyColor[p.difficulty] || ''}`}>
                    {p.difficulty}
                  </span>
                </td>
                <td className="max-w-xs truncate px-5 py-3 text-xs text-neutral-400">
                  {p.topic_tags || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="mt-4 flex items-center justify-end gap-2 text-sm text-neutral-500">
        <button
          disabled={page <= 1}
          onClick={() => { setPage(page - 1); load(page - 1) }}
          className="rounded-md border border-neutral-200 p-1.5 disabled:opacity-40"
        >
          <ChevronLeft size={15} />
        </button>
        <span>第 {data.page} / {data.total_pages || 1} 页 · 共 {data.total} 题</span>
        <button
          disabled={page >= (data.total_pages || 1)}
          onClick={() => { setPage(page + 1); load(page + 1) }}
          className="rounded-md border border-neutral-200 p-1.5 disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
