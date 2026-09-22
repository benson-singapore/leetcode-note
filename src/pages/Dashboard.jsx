import { useEffect, useMemo, useState } from 'react'
import {
  Target,
  Library,
  Trophy,
  AlertCircle,
  Flame,
  CalendarDays,
  PlusCircle,
  History,
} from 'lucide-react'
import {
  getProblemStats,
  getUserProblemStats,
  getHeatmap,
  getActivityDay,
  getUserProblemsOnDate,
} from '../api/leetcode'

const DIFFICULTIES = {
  Easy: { color: 'text-emerald-600 bg-emerald-50 border-emerald-100', label: '简单' },
  Medium: { color: 'text-amber-600 bg-amber-50 border-amber-100', label: '中等' },
  Hard: { color: 'text-rose-600 bg-rose-50 border-rose-100', label: '困难' },
}

function localDateYMD() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatZhDateLabel(ymd) {
  const parts = (ymd || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ymd || localDateYMD()
  const [y, mo, da] = parts
  return new Date(y, mo - 1, da).toLocaleDateString('zh-CN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

function DiffBadge({ difficulty }) {
  const meta = DIFFICULTIES[difficulty]
  if (!meta) return null
  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function ProblemList({ problems, renderExtra }) {
  return (
    <ul className="relative z-0 mt-5 max-h-52 space-y-2 overflow-y-auto pr-1">
      {problems.slice(0, 12).map((p) => (
        <li
          key={p.userProblemId || p.id}
          className="relative z-0 flex items-start gap-2 border-b border-slate-50 pb-2 text-xs font-normal text-slate-700 last:border-0"
        >
          <span className="w-10 shrink-0 font-mono text-slate-400">{p.lcId}</span>
          <span className="min-w-0 flex-1 truncate" title={p.translatedTitle || p.title}>
            {p.translatedTitle || p.title}
          </span>
          {renderExtra?.(p)}
          <DiffBadge difficulty={p.difficulty} />
        </li>
      ))}
    </ul>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [upStats, setUpStats] = useState(null)
  const [heatmap, setHeatmap] = useState(null)
  const [todayState, setTodayState] = useState({
    loading: true,
    date: localDateYMD(),
    created: [],
    reviewed: [],
    error: null,
  })
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getProblemStats(), getUserProblemStats(), getHeatmap()])
      .then(([p, u, h]) => {
        setStats(p?.data || {})
        setUpStats(u?.data || {})
        setHeatmap(h?.data || null)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    const date = localDateYMD()
    ;(async () => {
      try {
        const [createdRes, reviewedRes] = await Promise.all([
          getUserProblemsOnDate(date),
          getActivityDay({ date }),
        ])
        if (!cancelled) {
          setTodayState({
            loading: false,
            date: createdRes?.data?.date || reviewedRes?.data?.date || date,
            created: createdRes?.data?.problems || [],
            reviewed: reviewedRes?.data?.problems || [],
            error: null,
          })
        }
      } catch (e) {
        if (!cancelled) {
          setTodayState({ loading: false, date, created: [], reviewed: [], error: e })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const total = num(stats?.total)
  const mastered = num(upStats?.mastered)
  const reviewing = num(upStats?.reviewing)
  const notMastered = Math.max(0, total - mastered)
  const masteryPct = total > 0 ? ((mastered / total) * 100).toFixed(1) : '0.0'

  const heatmapSummary = useMemo(() => {
    if (!heatmap?.counts) return null
    let activeDays = 0
    for (const c of Object.values(heatmap.counts)) {
      if (c > 0) activeDays += 1
    }
    let newAdded = 0
    for (const c of Object.values(heatmap.problemCounts || {})) {
      newAdded += c
    }
    return {
      activeDays,
      reviewTouches: num(heatmap.total),
      newAdded,
      windowDays: num(heatmap.days) || 365,
    }
  }, [heatmap])

  const todayReviewSessions = useMemo(
    () =>
      todayState.reviewed.reduce(
        (s, p) => s + (typeof p.reviewCount === 'number' ? p.reviewCount : 0),
        0
      ),
    [todayState.reviewed]
  )

  const todayLabel = formatZhDateLabel(todayState.date)

  return (
    <div className="h-full overflow-y-auto bg-white p-8 pt-5 md:px-12 md:pt-5">
      <div className="space-y-10 animate-in fade-in duration-700">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">数据看板</h1>
          <p className="text-xs font-normal tracking-wide text-slate-400">
            基于你已录入题库的统计 · 与侧边栏一致
          </p>
        </header>

        {error && <p className="text-sm font-medium text-rose-500">加载失败：{error}</p>}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl bg-primary-600 p-6 text-white shadow-card">
            <Target className="absolute -right-1 top-3 mb-2 opacity-15" size={72} />
            <p className="relative z-[1] text-xs font-medium tracking-wide text-white/80">精通率</p>
            <p className="relative z-[1] text-4xl font-semibold tracking-tight tabular-nums">{masteryPct}%</p>
            <p className="relative z-[1] mt-2 text-xs font-normal text-white/70">
              已精通 {mastered} / 在练 {total} 题
            </p>
          </div>

          <div className="flex min-h-[140px] flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-6 shadow-card">
            <Library className="mb-2 text-primary-600" size={22} />
            <p className="text-xs font-medium tracking-wide text-slate-400">在练题库</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{total}</p>
            <p className="mt-2 text-xs font-normal text-slate-400">已加入个人题库的题目数</p>
          </div>

          <div className="flex min-h-[140px] flex-col justify-between rounded-2xl bg-slate-900 p-6 text-white shadow-card">
            <Trophy className="mb-2 text-primary-400 opacity-90" size={22} />
            <p className="text-xs font-medium tracking-wide text-white/70">已精通</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{mastered}</p>
            <p className="mt-2 text-xs font-normal text-white/50">状态为「已精通」的题目</p>
          </div>

          <div className="flex min-h-[140px] flex-col justify-between rounded-2xl border border-amber-100/80 bg-amber-50/70 p-6 shadow-card">
            <AlertCircle className="mb-2 text-amber-600" size={22} />
            <p className="text-xs font-medium tracking-wide text-amber-700/80">未精通</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-amber-900">{notMastered}</p>
            <p className="mt-2 text-xs font-normal text-amber-700/60">其中复习中 {reviewing} 题</p>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-card">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-amber-400" />
              <p className="text-xs font-medium tracking-wide text-white/60">
                近 {heatmapSummary?.windowDays ?? 365} 天训练概览
              </p>
            </div>
            <CalendarDays size={16} className="text-white/30" />
          </div>
          {error ? (
            <p className="text-sm font-medium text-rose-300">活动数据加载失败，请稍后重试</p>
          ) : !heatmapSummary ? (
            <p className="text-sm font-medium text-white/50">加载中…</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-white/50">
                  有复习记录的天数
                </p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{heatmapSummary.activeDays}</p>
                <p className="mt-1 text-xs font-normal text-white/40">热力图上有颜色的日期数</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-white/50">
                  复习人次累计
                </p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{heatmapSummary.reviewTouches}</p>
                <p className="mt-1 text-xs font-normal text-white/40">
                  按日「当日复习过的不重复题」求和（同题多天会重复计）
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-white/50">
                  窗口内新录入
                </p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{heatmapSummary.newAdded}</p>
                <p className="mt-1 text-xs font-normal text-white/40">
                  该期间新建 user_problem 的题目数
                </p>
              </div>
            </div>
          )}
        </div>

        <section className="rounded-2xl border border-primary-100/80 bg-gradient-to-b from-primary-50/40 to-white p-8 pb-10 shadow-card">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-primary-700/80">
                今日做题与复习
              </p>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">{todayLabel}</h2>
              <p className="mt-1 text-xs font-normal text-slate-500">
                新录入按题库创建日；复习按当日复习记录（与日历统计一致）
              </p>
            </div>
          </div>

          {todayState.error ? (
            <p className="text-sm font-medium text-rose-600">今日数据加载失败，请稍后刷新</p>
          ) : todayState.loading ? (
            <p className="text-sm font-medium text-slate-400">加载今日数据…</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <PlusCircle className="text-primary-600" size={18} />
                  <p className="text-xs font-medium tracking-wide text-slate-400">
                    今日新录入题库
                  </p>
                </div>
                <p className="text-4xl font-semibold tracking-tight tabular-nums text-slate-900">
                  {todayState.created.length}
                </p>
                <p className="mt-1 text-xs font-normal text-slate-500">当日创建的 user_problem 条数</p>
                {todayState.created.length === 0 ? (
                  <p className="mt-6 text-sm font-normal text-slate-400">今天还没有新题目入库</p>
                ) : (
                  <ProblemList problems={todayState.created} />
                )}
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <History className="text-violet-600" size={18} />
                  <p className="text-xs font-medium tracking-wide text-slate-400">今日复习</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-slate-400">
                      涉及题目
                    </p>
                    <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
                      {todayState.reviewed.length}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-slate-400">
                      当日复习次数
                    </p>
                    <p className="text-3xl font-semibold tracking-tight tabular-nums text-violet-700">{todayReviewSessions}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs font-normal text-slate-500">
                  次数为当日各题复习条数之和（一题可多条）
                </p>
                {todayState.reviewed.length === 0 ? (
                  <p className="mt-6 text-sm font-normal text-slate-400">今天还没有复习记录</p>
                ) : (
                  <ProblemList
                    problems={todayState.reviewed}
                    renderExtra={(p) =>
                      typeof p.reviewCount === 'number' && p.reviewCount > 0 ? (
                        <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-600">
                          ×{p.reviewCount}
                        </span>
                      ) : null
                    }
                  />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
