import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import {
  clearTodayDailyGoal,
  createDailyGoal,
  generateDailyGoalAI,
  getDailyGoalOptions,
  getTodayDailyGoal,
} from '../api/dailyGoals'
import { getProblem } from '../api/leetcode'
import { DetailDrawer } from '../components/DetailDrawer'
import { useI18n } from '../i18n'

const DIFFICULTIES = {
  Easy: { label: '简单', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  Medium: { label: '中等', color: 'text-amber-600 bg-amber-50 border-amber-100' },
  Hard: { label: '困难', color: 'text-rose-600 bg-rose-50 border-rose-100' },
}

const STATUS_MAP = {
  Unpracticed: { label: '未开始', color: 'bg-slate-100 text-slate-500' },
  New: { label: '未开始', color: 'bg-slate-100 text-slate-500' },
  Reviewing: { label: '复习中', color: 'bg-violet-50 text-violet-600' },
  Mastered: { label: '已精通', color: 'bg-emerald-50 text-emerald-700' },
}

const COUNT_PRESETS = [3, 5, 7, 10]
const CONFIG_KEY = 'daily-goal.config'

function todayYMD() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseTags(raw) {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((tag) => {
        if (typeof tag === 'string') return tag
        return tag.translatedName || tag.nameTranslated || tag.name || ''
      })
      .filter(Boolean)
  } catch {
    return String(raw).split(',').map((tag) => tag.trim()).filter(Boolean)
  }
}

function readSavedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')
    return {
      count: Number(saved.count) > 0 ? Number(saved.count) : 5,
      tags: Array.isArray(saved.tags) ? saved.tags : [],
      difficulties: Array.isArray(saved.difficulties) ? saved.difficulties : [],
      notes: typeof saved.notes === 'string' ? saved.notes : '',
    }
  } catch {
    return { count: 5, tags: [], difficulties: [], notes: '' }
  }
}

export default function DailyGoal() {
  const { t, language } = useI18n()
  const saved = useMemo(readSavedConfig, [])

  const [goal, setGoal] = useState(null)
  const [options, setOptions] = useState({ stats: {}, tags: [], counts: {} })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [adding, setAdding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState('')

  // 当前页题目详情抽屉
  const [activeProblemId, setActiveProblemId] = useState(null)
  const [activeProblem, setActiveProblem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [count, setCount] = useState(saved.count)
  const [selectedTags, setSelectedTags] = useState(saved.tags)
  const [selectedDifficulties, setSelectedDifficulties] = useState(saved.difficulties)
  const [notes, setNotes] = useState(saved.notes)
  const [manualInput, setManualInput] = useState('')

  const dateLabel = useMemo(() => {
    const d = new Date(`${todayYMD()}T00:00:00`)
    return d.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })
  }, [language])

  const loadData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const [goalRes, optionsRes] = await Promise.all([
        getTodayDailyGoal({ date: todayYMD() }),
        getDailyGoalOptions(),
      ])
      setGoal(goalRes?.data ?? goalRes ?? null)
      const data = optionsRes?.data ?? optionsRes ?? {}
      setOptions({
        stats: data.stats || {},
        tags: data.tags || [],
        counts: data.counts || {},
      })
      setMessage('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 从题库详情页返回时，完成状态可能已变化，重新同步一次
  useEffect(() => {
    const onFocus = () => loadData(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadData])

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ count, tags: selectedTags, difficulties: selectedDifficulties, notes }))
  }, [count, selectedTags, selectedDifficulties, notes])

  const stats = options.stats || {}
  const tags = options.tags || []
  const completed = goal?.completed ?? 0
  const total = goal?.total ?? 0
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const goalConfig = useMemo(() => {
    try {
      return JSON.parse(goal?.config || '{}') || {}
    } catch {
      return {}
    }
  }, [goal])
  const summaryDifficulties = goal
    ? (Array.isArray(goalConfig.difficulties) ? goalConfig.difficulties : [])
    : selectedDifficulties
  const summaryTags = goal
    ? (Array.isArray(goalConfig.tags) ? goalConfig.tags : [])
    : selectedTags

  const toggleTag = (tag) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    )
  }

  const toggleDifficulty = (difficulty) => {
    setSelectedDifficulties((current) =>
      current.includes(difficulty)
        ? current.filter((item) => item !== difficulty)
        : [...current, difficulty]
    )
  }

  // 在当前页面打开题目详情抽屉
  const openProblem = (item) => {
    setActiveProblemId(item.problem_id)
    setActiveProblem(null)
    setDetailLoading(true)
    getProblem(item.problem_id)
      .then((res) => {
        setActiveProblem(res?.data || res)
      })
      .catch((error) => {
        setMessage(error.message)
        setActiveProblemId(null)
      })
      .finally(() => setDetailLoading(false))
  }

  // 抽屉内状态变化时同步当前目标行，关闭抽屉后再从服务端刷新完成进度
  const handleUpdateProblem = (next) => {
    setActiveProblem(next)
    setGoal((current) => {
      if (!current) return current
      const items = (current.items || []).map((item) => {
        if (item.problem_id !== next.id) return item
        const progressStatus = next.progressStatus ?? item.progress_status
        return {
          ...item,
          status: next.status ?? item.status,
          progress_status: progressStatus,
          completed:
            progressStatus === 'Mastered'
              ? true
              : progressStatus === 'Unpracticed'
                ? false
                : item.completed,
        }
      })
      return {
        ...current,
        items,
        completed: items.filter((item) => item.completed).length,
      }
    })
  }

  const handleDeleteProblem = (problemId) => {
    setActiveProblemId(null)
    setActiveProblem(null)
    setGoal((current) => {
      if (!current) return current
      const items = (current.items || []).filter((item) => item.problem_id !== problemId)
      return {
        ...current,
        items,
        total: items.length,
        completed: items.filter((item) => item.completed).length,
      }
    })
    setMessage(t('题目已从题库删除'))
  }

  const closeProblemDrawer = () => {
    setActiveProblemId(null)
    setActiveProblem(null)
    loadData(true)
  }

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    setMessage('')
    try {
      const res = await generateDailyGoalAI({
        count,
        tags: selectedTags,
        difficulties: selectedDifficulties,
        notes: notes.trim(),
        date: todayYMD(),
      })
      setGoal(res?.data ?? res ?? null)
      setMessage(t('AI 已生成今日目标'))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleManualAdd = async (event) => {
    event.preventDefault()
    const numbers = manualInput
      .split(/[\s,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!numbers.length || adding) return
    setAdding(true)
    setMessage('')
    try {
      const res = await createDailyGoal({
        problem_numbers: numbers,
        date: todayYMD(),
        title: '今日目标',
        append: true,
      })
      setManualInput('')
      await loadData(true)
      if (res?.data || res) setGoal(res?.data ?? res)
      setMessage(t('题目已加入今日目标'))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setAdding(false)
    }
  }

  const handleClear = async () => {
    if (!goal || clearing) return
    if (!window.confirm(t('确定清空今日目标吗？题目与题库数据不会被删除。'))) return
    setClearing(true)
    setMessage('')
    try {
      await clearTodayDailyGoal({ date: todayYMD() })
      setGoal(null)
      setMessage(t('今日目标已清空'))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* 左侧配置区 */}
      <aside className="w-[336px] shrink-0 space-y-4 overflow-y-auto border-r border-neutral-200 bg-white p-6">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-800">
              <span className="rounded-lg bg-primary-50 p-1.5 text-primary-600">
                <Target size={15} />
              </span>
              {t('选题配置')}
            </h2>
            <button
              type="button"
              onClick={() => {
                setCount(5)
                setSelectedTags([])
                setSelectedDifficulties([])
                setNotes('')
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-400 transition hover:text-primary-600"
            >
              <RotateCcw size={12} />
              {t('重置')}
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="daily-goal-count" className="text-xs font-medium text-slate-600">
                  {t('题目数量')}
                </label>
                <span className="font-mono text-xs text-slate-400">{count} {t('道')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCount((value) => Math.max(1, value - 1))}
                  aria-label={t('减少题目数量')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-primary-300 hover:text-primary-600"
                >
                  <Minus size={14} />
                </button>
                <input
                  id="daily-goal-count"
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setCount(Number.isFinite(next) ? Math.min(20, Math.max(1, Math.round(next))) : 1)
                  }}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/60 text-center font-mono text-sm text-slate-700 outline-none transition focus:border-primary-300 focus:bg-white focus:ring-4 focus:ring-primary-50"
                />
                <button
                  type="button"
                  onClick={() => setCount((value) => Math.min(20, value + 1))}
                  aria-label={t('增加题目数量')}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-primary-300 hover:text-primary-600"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="mt-2 flex gap-1.5">
                {COUNT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCount(preset)}
                    className={`flex-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                      count === preset
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-primary-200 hover:text-primary-600'
                    }`}
                  >
                    {preset} {t('题')}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">{t('知识点类型')}</span>
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    className="text-[11px] text-slate-400 transition hover:text-rose-500"
                  >
                    {t('清空')}
                  </button>
                )}
              </div>
              <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {tags.map((tag) => {
                  const active = selectedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={active}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? 'border-primary-300 bg-primary-100 text-primary-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary-200 hover:text-primary-700'
                      }`}
                    >
                      {tag}
                      <span className={`ml-1 ${active ? 'text-primary-500' : 'text-slate-400'}`}>
                        {options.counts?.[tag] ?? 0}
                      </span>
                    </button>
                  )
                })}
                {tags.length === 0 && (
                  <p className="text-[11px] text-slate-400">{t('题库中还没有知识点标签')}</p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">{t('难度')}</span>
                {selectedDifficulties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDifficulties([])}
                    className="text-[11px] text-slate-400 transition hover:text-rose-500"
                  >
                    {t('清空')}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {Object.entries(DIFFICULTIES).map(([key, meta]) => {
                  const active = selectedDifficulties.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleDifficulty(key)}
                      aria-pressed={active}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium transition ${
                        active
                          ? 'border-primary-300 bg-primary-50 text-primary-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-primary-200'
                      }`}
                    >
                      {active && <Check size={12} />}
                      {t(meta.label)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <label htmlFor="daily-goal-notes" className="mb-2 block text-xs font-medium text-slate-600">
                {t('补充要求')}
              </label>
              <textarea
                id="daily-goal-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('例如：想练习链表，优先未做过的题…')}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-primary-300 focus:bg-white focus:ring-4 focus:ring-primary-50"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white shadow-card transition hover:bg-primary-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? t('AI 正在选题…') : t('AI 智能选题')}
            </button>
          </div>
        </section>

        {/* 基础信息 */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{t('基础信息')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-primary-600 px-3 py-3 text-white">
              <p className="text-[11px] text-primary-100">{t('题库总数')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] text-slate-500">{t('未练习')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">{stats.unpracticed ?? 0}</p>
            </div>
            <div className="rounded-xl bg-violet-50 px-3 py-3">
              <p className="text-[11px] text-violet-600">{t('复习中')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{stats.reviewing ?? 0}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-3">
              <p className="text-[11px] text-emerald-600">{t('已精通')}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{stats.mastered ?? 0}</p>
            </div>
          </div>
        </section>

        {/* 手动添加 */}
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <h3 className="mb-1 text-xs font-semibold text-slate-600">{t('按题号添加')}</h3>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
            {t('支持题号或 slug，本地没有的题目会自动从 LeetCode 同步。')}
          </p>
          <form onSubmit={handleManualAdd} className="flex gap-2">
            <input
              value={manualInput}
              onChange={(event) => setManualInput(event.target.value)}
              placeholder={t('1, 2, 14')}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 font-mono text-xs text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-primary-300 focus:bg-white focus:ring-4 focus:ring-primary-50"
            />
            <button
              type="submit"
              disabled={adding || !manualInput.trim()}
              className="flex h-9 items-center justify-center rounded-lg border border-primary-200 bg-primary-50 px-3 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : t('添加')}
            </button>
          </form>
        </section>
      </aside>

      {/* 右侧目标区 */}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white p-8">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-base font-semibold tracking-tight text-slate-900">
                <span className="rounded-lg bg-primary-600 p-1.5 text-white shadow-card">
                  <Target size={16} />
                </span>
                {t('今日目标')}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <CalendarDays size={13} />
                {dateLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {message && (
                <span className="max-w-xs truncate text-xs font-medium text-slate-400" role="status" title={message}>
                  {message}
                </span>
              )}
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                {t('刷新')}
              </button>
              {goal && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={clearing}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] text-slate-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  {t('清空')}
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-1.5 text-[11px] font-medium text-white shadow-lg shadow-primary-100 transition hover:bg-primary-700 active:scale-95 disabled:opacity-60"
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {generating ? t('AI 正在选题…') : t('AI 智能选题')}
              </button>
            </div>
          </div>

          {/* 进度概览 */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-5 sm:col-span-2">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-primary-700">{t('今日完成进度')}</p>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tabular-nums text-primary-800">{completed}</span>
                    <span className="text-sm text-primary-600">/ {total} {t('题')}</span>
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 shadow-sm">
                  {progress}%
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-primary-600/80">
                {goal
                  ? completed >= total
                    ? t('今日目标已全部完成，去复习巩固一下吧')
                    : t('完成后在题库中更新题目状态，今日目标会自动同步')
                  : t('配置左侧选项，让 AI 从题库中为你安排今天的题目')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
              <p className="text-xs font-medium text-slate-500">{t('本次选题')}</p>
              <div className="mt-3 space-y-2 text-[11px] text-slate-500">
                <p className="flex items-center justify-between">
                  <span>{t('题目数量')}</span>
                  <span className="font-mono text-slate-700">{total || count} {t('道')}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>{t('难度')}</span>
                  <span className="max-w-[9rem] truncate text-right text-slate-700">
                    {summaryDifficulties.length
                      ? summaryDifficulties.map((key) => t(DIFFICULTIES[key]?.label || key)).join(' / ')
                      : t('不限')}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span>{t('知识点')}</span>
                  <span className="max-w-[9rem] truncate text-right text-slate-700">
                    {summaryTags.length ? summaryTags.join(' / ') : t('不限')}
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* 目标题目列表 */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-card">
            <div className="grid grid-cols-12 items-center border-b border-slate-100 bg-slate-50/80 px-7 py-3.5 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">
              <div className="col-span-1">#</div>
              <div className="col-span-4">{t('题名')}</div>
              <div className="col-span-2 text-center">{t('知识点')}</div>
              <div className="col-span-1 text-center">{t('难度')}</div>
              <div className="col-span-2 text-center">{t('完成状态')}</div>
              <div className="col-span-2 pr-2 text-right">{t('操作')}</div>
            </div>

            <div className="divide-y divide-slate-50">
              {loading && (
                <div className="px-7 py-14 text-center text-sm text-slate-400">{t('加载中…')}</div>
              )}
              {!loading && (!goal || goal.items?.length === 0) && (
                <div className="flex flex-col items-center px-7 py-16 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                    <Target size={26} strokeWidth={1.8} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-700">{t('今天还没有目标')}</h3>
                  <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">
                    {t('在左侧选择题目数量、知识点和难度，点击「AI 智能选题」生成今天的练习清单。')}
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="mt-5 flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-xs font-medium text-white shadow-card transition hover:bg-primary-700 disabled:opacity-60"
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generating ? t('AI 正在选题…') : t('AI 智能选题')}
                  </button>
                </div>
              )}
              {!loading &&
                goal?.items?.map((item, index) => {
                  const difficulty = DIFFICULTIES[item.difficulty] || {
                    label: item.difficulty || '—',
                    color: 'text-slate-500 bg-slate-50 border-slate-100',
                  }
                  const status = STATUS_MAP[item.progress_status] || {
                    label: item.progress_status || '未知',
                    color: 'bg-slate-100 text-slate-500',
                  }
                  const itemTags = parseTags(item.topic_tags)
                  return (
                    <div
                      key={item.id}
                      onClick={() => openProblem(item)}
                      className={`group grid cursor-pointer grid-cols-12 items-center px-7 py-3.5 transition-colors hover:bg-primary-50/40 ${
                        item.completed ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div className="col-span-1 flex items-center gap-2 font-mono text-[11px] text-slate-300 group-hover:text-primary-500">
                        {item.completed ? (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                        ) : (
                          <Circle size={13} className="shrink-0 text-slate-200" />
                        )}
                        <span className="truncate">{item.lc_id}</span>
                      </div>
                      <div className="col-span-4 min-w-0 pr-4">
                        <p className={`truncate text-xs transition-colors group-hover:text-primary-800 ${
                          item.completed ? 'text-slate-400 line-through' : 'text-slate-700'
                        }`}>
                          {item.translated_title || item.title}
                        </p>
                      </div>
                      <div className="col-span-2 flex flex-wrap justify-center gap-1 overflow-hidden">
                        {itemTags.slice(0, 2).map((tag) => (
                          <span key={tag} className="max-w-[5.5rem] truncate rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {tag}
                          </span>
                        ))}
                        {itemTags.length === 0 && <span className="text-[10px] text-slate-300">—</span>}
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${difficulty.color}`}>
                          {t(difficulty.label)}
                        </span>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${status.color}`}>
                          {t(status.label)}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2 pr-1">
                        <span className="text-[11px] font-medium text-primary-600 opacity-0 transition group-hover:opacity-100">
                          {item.completed ? t('继续巩固') : t('开始练习')}
                        </span>
                        <ChevronRight size={14} className="text-slate-200 transition group-hover:translate-x-1 group-hover:text-primary-400" />
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>

          {goal && goal.items?.length > 0 && (
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
              <CheckCircle2 size={12} className="text-slate-300" />
              {t('完成状态与题库实时同步：在题库中更新题目进度后，回到本页即可看到最新结果。')}
            </p>
          )}
        </div>
      </main>

      {activeProblemId && (activeProblem || detailLoading) && (
        <DetailDrawer
          activeProblem={activeProblem}
          updateProblem={handleUpdateProblem}
          onDeleted={handleDeleteProblem}
          onClose={closeProblemDrawer}
          loading={detailLoading}
        />
      )}
    </div>
  )
}
