import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
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
  { key: 'EASY', label: '简单' },
  { key: 'MEDIUM', label: '中等' },
  { key: 'HARD', label: '困难' },
]

const unbox = (response) => response?.data ?? response ?? {}
const sumCounts = (items) => (items || []).reduce((sum, item) => sum + (Number(item?.count) || 0), 0)
const number = (value) => Number(value) || 0

export default function TrayPopover() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [localStatsAvailable, setLocalStatsAvailable] = useState(false)
  const [heatmapAvailable, setHeatmapAvailable] = useState(false)
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
      if (localResult.status === 'fulfilled') {
        setLocalStats(unbox(localResult.value))
        setLocalStatsAvailable(true)
      } else {
        setLocalStats(null)
        setLocalStatsAvailable(false)
      }

      if (heatmapResult.status === 'fulfilled') {
        const heatmap = unbox(heatmapResult.value)
        const days = new Set([
          ...Object.entries(heatmap.counts || {}).filter(([, count]) => number(count) > 0).map(([date]) => date),
          ...Object.entries(heatmap.problemCounts || {}).filter(([, count]) => number(count) > 0).map(([date]) => date),
        ])
        setActiveDays(days.size)
        setHeatmapAvailable(true)
      } else {
        setActiveDays(0)
        setHeatmapAvailable(false)
      }
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
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[18px] text-slate-800">
        <header className="flex shrink-0 items-center justify-between border-b border-white/70 bg-sky-50/35 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <div>
              <p className="text-sm font-semibold leading-4 text-slate-800">学习概览</p>
              <p className="mt-1 text-[10px] text-slate-500">LeetCode Note</p>
            </div>
          </div>
          <button type="button" onClick={() => loadOverview({ refresh: true })} disabled={refreshing || loading} title="刷新概览" aria-label="刷新概览" className="rounded-lg p-2 text-sky-800 transition hover:bg-white/50 disabled:opacity-60">
            {refreshing || loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </header>

        <section className="flex shrink-0 items-center gap-3 border-b border-white/70 px-4 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-white/40 text-slate-500">
            {account?.avatar ? <img src={account.avatar} alt="" className="h-full w-full object-cover" /> : <UserRound size={19} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{account?.name || (loading ? '正在读取账号信息…' : error ? '账号信息不可用' : '未绑定 LeetCode 账号')}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{account?.userId ? `@${account.userId}` : loading ? '正在同步本地数据' : error ? '请查看下方错误信息' : '绑定账号后同步官方刷题统计'}</p>
          </div>
          {account && <Check size={15} className="shrink-0 text-emerald-700" />}
        </section>

        <section className="shrink-0 border-b border-white/70 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><BookOpen size={14} className="text-sky-800" />LeetCode 刷题统计</div>
            <span className="text-[10px] text-slate-500">{leetcodeStats ? '官方数据' : loading ? '读取中…' : account ? '暂不可用' : '需绑定账号'}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-6">
            <div><span className="text-lg font-semibold tabular-nums text-sky-900">{leetcodeStats?.solved?.toLocaleString() ?? '—'}</span><span className="ml-1.5 text-[10px] text-slate-600">已通过</span></div>
            <div><span className="text-lg font-semibold tabular-nums text-slate-700">{leetcodeStats?.remaining?.toLocaleString() ?? '—'}</span><span className="ml-1.5 text-[10px] text-slate-600">剩余</span></div>
          </div>
          <div className="mt-1.5 space-y-1.5">
            {DIFFICULTIES.map(({ key, label }) => {
              const accepted = leetcodeStats?.accepted?.[key] ?? 0
              const total = leetcodeStats?.total?.[key] ?? 0
              const percent = total > 0 ? Math.min(100, (accepted / total) * 100) : 0
              return (
                <div key={key} className="flex items-center gap-2 text-[10px]">
                  <span className="w-7 shrink-0 text-slate-600">{label}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-sky-700" style={{ width: `${percent}%` }} /></div>
                  <span className="w-14 shrink-0 text-right tabular-nums text-slate-600">{accepted} / {total}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="shrink-0 border-b border-white/70 px-4 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Target size={14} className="text-emerald-700" />本地题库进度</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div><span className="text-base font-semibold tabular-nums text-emerald-800">{loading || !localStatsAvailable ? '—' : localSummary.mastered.toLocaleString()}</span><span className="ml-1.5 text-[10px] text-slate-600">已掌握</span></div>
            <div><span className="text-base font-semibold tabular-nums text-emerald-800">{loading || !localStatsAvailable ? '—' : localSummary.reviewing.toLocaleString()}</span><span className="ml-1.5 text-[10px] text-slate-600">待复习</span></div>
            <div><span className="text-base font-semibold tabular-nums text-slate-700">{loading || !localStatsAvailable ? '—' : localSummary.total.toLocaleString()}</span><span className="ml-1.5 text-[10px] text-slate-600">题库总数</span></div>
            <div><span className="text-base font-semibold tabular-nums text-emerald-800">{loading || !heatmapAvailable ? '—' : activeDays.toLocaleString()}</span><span className="ml-1.5 text-[10px] text-slate-600">近一年活跃天数</span></div>
          </div>
          {localStatsAvailable && localSummary.unpracticed > 0 && <p className="mt-1 text-[10px] text-slate-500">尚未开始：{localSummary.unpracticed.toLocaleString()} 题</p>}
        </section>

        <section className="shrink-0 px-4 py-2.5">
          <p className="mb-1.5 text-[10px] font-medium text-slate-500">快捷入口</p>
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: '题库', path: '/problems', icon: BookOpen },
              { label: '复习', path: '/problems/review', icon: Clock3 },
              { label: '日历', path: '/calendar', icon: CalendarDays },
            ].map(({ label, path, icon: Icon }) => (
              <button key={path} type="button" onClick={() => openPage(path)} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium text-slate-700 transition hover:bg-sky-100/60 hover:text-sky-900">
                <Icon size={15} className="text-sky-800" />{label}
              </button>
            ))}
          </div>
        </section>

        {error && <p role="status" className="mx-4 mb-2 shrink-0 rounded-md bg-rose-50/80 px-2 py-1.5 text-[10px] text-rose-700">{error}</p>}

        <footer className="mt-auto flex shrink-0 items-center justify-between border-t border-white/70 px-3 py-1.5">
          <button type="button" onClick={() => openPage('/')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-white/50 hover:text-sky-900">
            <ExternalLink size={13} />显示主窗口<ChevronRight size={12} />
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => openPage('/settings')} title="设置" aria-label="设置" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/50 hover:text-sky-900"><Settings2 size={15} /></button>
            <button type="button" onClick={quit} title="退出应用" aria-label="退出应用" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/50 hover:text-sky-900"><LogOut size={15} /></button>
          </div>
        </footer>
    </div>
  )
}
