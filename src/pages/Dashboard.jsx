import { useEffect, useState } from 'react'
import { Flame, BookOpen, CheckCircle2, RefreshCw } from 'lucide-react'
import { getProblemStats, getUserProblemStats, getHeatmap } from '../api/leetcode'

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-500">{label}</span>
        <Icon size={18} className="text-primary-500" />
      </div>
      <div className="mt-2 text-3xl font-semibold text-neutral-900">{value ?? '—'}</div>
      {sub && <div className="mt-1 text-xs text-neutral-400">{sub}</div>}
    </div>
  )
}

// 热力图：后端返回 [{ date, count }] 结构（具体字段以接口为准，这里做兜底渲染）
function Heatmap({ data }) {
  if (!data?.length) return <div className="text-sm text-neutral-400">暂无复习记录</div>
  const max = Math.max(...data.map((d) => d.count || d.total || 0), 1)
  return (
    <div className="flex flex-wrap gap-1">
      {data.map((d) => {
        const n = d.count || d.total || 0
        const level = n === 0 ? 0 : Math.ceil((n / max) * 4)
        return (
          <div
            key={d.date || d.day}
            title={`${d.date || d.day}: ${n} 次`}
            className={`h-3.5 w-3.5 rounded-sm ${
              ['bg-neutral-100', 'bg-primary-200', 'bg-primary-400', 'bg-primary-500', 'bg-primary-700'][level]
            }`}
          />
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({})
  const [upStats, setUpStats] = useState({})
  const [heatmap, setHeatmap] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getProblemStats(), getUserProblemStats(), getHeatmap()])
      .then(([p, u, h]) => {
        setStats(p?.data || p)
        setUpStats(u?.data || u)
        setHeatmap(h?.data || h || [])
      })
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-xl font-semibold text-neutral-900">复习看板</h1>
      {error && <p className="mt-2 text-sm text-red-500">加载失败：{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="题目总数" value={stats?.total ?? stats?.total_problems} />
        <StatCard icon={CheckCircle2} label="已掌握" value={upStats?.mastered} />
        <StatCard icon={RefreshCw} label="复习中" value={upStats?.reviewing} />
        <StatCard icon={Flame} label="今日复习" value={upStats?.today_reviews} />
      </div>

      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-neutral-700">学习热力图</h2>
        <Heatmap data={heatmap} />
      </div>

      <p className="mt-8 text-xs text-neutral-400">
        提示：看板数据结构将随 UI 打磨持续调整，当前为骨架占位实现。
      </p>
    </div>
  )
}
