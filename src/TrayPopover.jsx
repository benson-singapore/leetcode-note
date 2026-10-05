import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Settings2,
  Target,
  UserRound,
} from 'lucide-react'
import { getTrayOverview } from './api/client'

const DIFFICULTIES = [
  { key: 'Easy', label: '简单', color: 'bg-emerald-500', text: 'text-emerald-700', track: 'bg-emerald-50' },
  { key: 'Medium', label: '中等', color: 'bg-amber-500', text: 'text-amber-700', track: 'bg-amber-50' },
  { key: 'Hard', label: '困难', color: 'bg-rose-500', text: 'text-rose-700', track: 'bg-rose-50' },
]

const unbox = (response) => response?.data ?? response ?? {}
const sumCounts = (items) => (items || []).reduce((sum, item) => sum + (Number(item?.count) || 0), 0)
const number = (value) => Number(value) || 0

function DifficultyRows({ stats }) {
  return (
    <div className="mt-3 space-y-3">
      {DIFFICULTIES.map(({ key, label, color, text, track }) => {
        const accepted = stats?.accepted?.[key] ?? 0
        const total = stats?.total?.[key] ?? 0
        const percent = total > 0 ? Math.min(100, (accepted / total) * 100) : 0
        return (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className={`font-medium ${text}`}>{label}</span>
              <span className="tabular-nums text-slate-500">{accepted.toLocaleString()} / {total.toLocaleString()}</span>
            </div>
            <div className={`h-1.5 overflow-hidden rounded-full ${track}`}>
              <div className={`h-full rounded-full ${color} transition-[width]`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TrayPopover() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [account, setAccount] = useState(null)
  const [leetcodeStats, setLeetcodeStats] = useState(null)
  const [localStats, setLocalStats] = useState(null)
  const [activeDays, setActiveDays] = useState(0)

  const loadOverview = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      const [settingsResult, localResult, heatmapResult] = await Promise.allSettled([
        getTrayOverview('/api/v1/settings'),
        getTrayOverview('/api/v1/user-problems/stats'),
        getTrayOverview('/api/v1/reviews/activity-heatmap'),
      ])
      if (settingsResult.status === 'rejected') {
        setAccount(null)
        setLeetcodeStats(null)
        throw new Error(`登录信息读取失败：${settingsResult.reason?.message || '无法连接本地服务'}`)
      }
      const settings = unbox(settingsResult.value)
      if (localResult.status === 'fulfilled') setLocalStats(unbox(localResult.value))
      else setLocalStats(null)

      if (heatmapResult.status === 'fulfilled') {
        const heatmap = unbox(heatmapResult.value)
        const days = new Set([
          ...Object.entries(heatmap.counts || {}).filter(([, count]) => number(count) > 0).map(([date]) => date),
          ...Object.entries(heatmap.problemCounts || {}).filter(([, count]) => number(count) > 0).map(([date]) => date),
        ])
        setActiveDays(days.size)
      } else setActiveDays(0)
      if (localResult.status === 'rejected') {
        setError(`题库统计读取失败：${localResult.reason?.message || '请求失败'}`)
      } else if (heatmapResult.status === 'rejected') {
        setError(`活跃天数读取失败：${heatmapResult.reason?.message || '请求失败'}`)
      }

      if (!settings.leetcode_cookie) {
        setAccount(null)
        setLeetcodeStats(null)
        return
      }

      const [profileResult, solvedResult] = await Promise.allSettled([
        getTrayOverview('/api/v1/leetcode/user-profile'),
        getTrayOverview('/api/v1/leetcode/solved-stats'),
      ])
      const profile = profileResult.status === 'fulfilled' ? unbox(profileResult.value) : {}
      setAccount({
        avatar: profile.avatar || '',
        name: profile.realName || profile.username || settings.leetcode_username || 'LeetCode 用户',
        userId: profile.username || profile.userSlug || '',
      })
      if (solvedResult.status === 'fulfilled') {
        const stats = unbox(solvedResult.value)
        const accepted = {}
        const total = {}
        for (const { key } of DIFFICULTIES) {
          accepted[key] = (stats.numAcceptedQuestions || []).find((item) => item.difficulty === key)?.count || 0
          total[key] = accepted[key]
            + ((stats.numFailedQuestions || []).find((item) => item.difficulty === key)?.count || 0)
            + ((stats.numUntouchedQuestions || []).find((item) => item.difficulty === key)?.count || 0)
        }
        const solved = sumCounts(stats.numAcceptedQuestions)
        setLeetcodeStats({ accepted, total, solved, remaining: Math.max(0, sumCounts(Object.values(total).map((count) => ({ count }))) - solved) })
      } else {
        setLeetcodeStats(null)
        setError('LeetCode 刷题统计暂不可用')
      }
    } catch (cause) {
      setError(cause?.message || '概览加载失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])

  const localSummary = useMemo(() => ({
    total: number(localStats?.total),
    mastered: number(localStats?.mastered),
    reviewing: number(localStats?.reviewing),
    unpracticed: number(localStats?.unpracticed ?? localStats?.new),
  }), [localStats])

  const openPage = async (path) => {
    try { await invoke('open_main_window', { path }) } catch (cause) { setError(cause?.message || '打开页面失败') }
  }

  const quit = async () => {
    try { await invoke('quit_app') } catch (cause) { setError(cause?.message || '退出失败') }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/95 p-3 text-slate-800">
      <div className="overflow-hidden rounded-[22px] border border-slate-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.16)]">
        <header className="flex items-center justify-between bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
              <Target size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold leading-4">学习概览</p>
              <p className="mt-1 text-[10px] text-white/75">LeetCode Note</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadOverview({ refresh: true })}
            disabled={refreshing || loading}
            title="刷新概览"
            aria-label="刷新概览"
            className="rounded-lg p-2 text-white/90 transition hover:bg-white/20 disabled:opacity-60"
          >
            {refreshing || loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </header>

        <section className="p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400">
              {account?.avatar ? <img src={account.avatar} alt="" className="h-full w-full object-cover" /> : <UserRound size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{account?.name || '未绑定 LeetCode 账号'}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">{account?.userId ? `@${account.userId}` : '绑定账号后同步官方刷题统计'}</p>
            </div>
            {account && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={14} /></span>}
          </div>
        </section>

        <section className="mx-3.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><BookOpen size={14} className="text-sky-600" /> LeetCode 刷题统计</div>
            <span className="text-[10px] text-slate-400">{leetcodeStats ? '官方数据' : '等待数据'}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white px-2.5 py-2">
              <p className="text-lg font-bold leading-5 tabular-nums text-slate-900">{leetcodeStats?.solved?.toLocaleString() ?? '—'}</p>
              <p className="mt-1 text-[10px] text-slate-500">已通过</p>
            </div>
            <div className="rounded-lg bg-white px-2.5 py-2">
              <p className="text-lg font-bold leading-5 tabular-nums text-slate-700">{leetcodeStats?.remaining?.toLocaleString() ?? '—'}</p>
              <p className="mt-1 text-[10px] text-slate-500">剩余题数</p>
            </div>
          </div>
          <DifficultyRows stats={leetcodeStats} />
        </section>

        <section className="p-3.5 pb-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Target size={14} className="text-violet-600" /> 本地题库进度</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-violet-50 px-3 py-2.5">
              <p className="text-lg font-bold leading-5 tabular-nums text-violet-700">{loading ? '—' : localSummary.mastered.toLocaleString()}</p>
              <p className="mt-1 text-[10px] text-slate-500">已掌握</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2.5">
              <p className="text-lg font-bold leading-5 tabular-nums text-amber-700">{loading ? '—' : localSummary.reviewing.toLocaleString()}</p>
              <p className="mt-1 text-[10px] text-slate-500">待复习</p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-2.5">
              <p className="text-lg font-bold leading-5 tabular-nums text-slate-700">{loading ? '—' : localSummary.total.toLocaleString()}</p>
              <p className="mt-1 text-[10px] text-slate-500">题库总数</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <p className="text-lg font-bold leading-5 tabular-nums text-emerald-700">{loading ? '—' : activeDays.toLocaleString()}</p>
              <p className="mt-1 text-[10px] text-slate-500">近一年活跃天数</p>
            </div>
          </div>
          {localSummary.unpracticed > 0 && <p className="mt-2 text-[10px] text-slate-400">尚未开始：{localSummary.unpracticed.toLocaleString()} 题</p>}
        </section>

        <section className="border-t border-slate-100 px-3.5 py-3">
          <p className="mb-2 px-0.5 text-[10px] font-medium tracking-wide text-slate-400">快捷入口</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '进入题库', path: '/problems', icon: BookOpen, tone: 'text-sky-700 bg-sky-50 hover:bg-sky-100' },
              { label: '开始复习', path: '/problems/review', icon: Clock3, tone: 'text-violet-700 bg-violet-50 hover:bg-violet-100' },
              { label: '学习日历', path: '/calendar', icon: CalendarDays, tone: 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' },
            ].map(({ label, path, icon: Icon, tone }) => (
              <button key={path} type="button" onClick={() => openPage(path)} className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-[10px] font-medium transition ${tone}`}>
                <Icon size={17} />{label}
              </button>
            ))}
          </div>
        </section>

        {error && <p role="status" className="mx-3.5 mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[10px] text-rose-600">{error}</p>}

        <footer className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2.5">
          <button type="button" onClick={() => openPage('/')} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
            <ExternalLink size={13} />显示主窗口<ChevronRight size={12} />
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => openPage('/settings')} title="设置" aria-label="设置" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><Settings2 size={15} /></button>
            <button type="button" onClick={quit} title="退出应用" aria-label="退出应用" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><LogOut size={15} /></button>
          </div>
        </footer>
      </div>
      {!account && !loading && !error && <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-400"><CircleHelp size={11} />可在设置中绑定 LeetCode 账号</p>}
    </div>
  )
}
