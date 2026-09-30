import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  History,
  LayoutList,
  MonitorPlay,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  getProblems,
  getProblem,
  getProblemStats,
  getUserProblemStats,
  getTagSummary,
  fetchLeetCodeProblem,
  deleteProblem,
  getSettings,
  getActivityDay,
} from '../api/leetcode'
import { DetailDrawer } from '../components/DetailDrawer'
import { EmbeddedBrowser } from '../components/EmbeddedBrowser'
import { getBrowserOpenMode, openInSystemBrowser } from '../utils/browserOpen'
import { useI18n } from '../i18n'

// LeetCode 题库页（可与内置浏览器的笔记插件配合：点进题目后加载对应笔记）
const LEETCODE_PROBLEMSET_URL = 'https://leetcode.cn/problemset/'

const DIFFICULTIES = {
  Easy: { color: 'text-emerald-500 bg-emerald-50 border-emerald-100', label: '简单' },
  Medium: { color: 'text-amber-500 bg-amber-50 border-amber-100', label: '中等' },
  Hard: { color: 'text-rose-500 bg-rose-50 border-rose-100', label: '困难' },
}

const STATUS_MAP = {
  Unpracticed: { label: '未练习', light: 'bg-slate-50 text-slate-600' },
  New: { label: '未掌握', light: 'bg-blue-50 text-blue-600' },
  Struggling: { label: '半生不熟', light: 'bg-orange-50 text-orange-600' },
  Relearning: { label: '需重练', light: 'bg-yellow-50 text-yellow-700' },
  Stable: { label: '很稳', light: 'bg-cyan-50 text-cyan-700' },
  Reviewing: { label: '复习中', light: 'bg-purple-50 text-purple-600' },
  Mastered: { label: '已精通', light: 'bg-emerald-50 text-emerald-700' },
}

const PERSONAL_RATINGS = {
  1: '⚡',
  2: '👌',
  3: '🤔',
  4: '🤯',
  5: '💀',
}

const SORT_OPTIONS = [
  { id: 'lcId', label: '题号' },
  { id: 'createdAt', label: '创建时间' },
  { id: 'difficulty', label: '难度' },
]

const DEFAULT_PAGE_SIZE = 16
const REVIEW_COUNTS = [3, 5, 8, 10]

function localDateYMD() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clampPageSize(n) {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(100, Math.max(8, Math.round(n)))
}

function statusMeta(p) {
  const key = p.progressStatus || p.status
  return STATUS_MAP[key] || { label: key || '未知', light: 'bg-slate-50 text-slate-600' }
}

function statusMetaFor(p) {
  const key = p.status
  return STATUS_MAP[key] || { label: key || '未知', light: 'bg-slate-50 text-slate-600' }
}

function CollapsibleSection({ label, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left transition-all hover:border-slate-300"
      >
        {label}
        <span className="flex shrink-0 items-center gap-1.5">
          {badge}
          <ChevronDown
            size={15}
            className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
          />
        </span>
      </button>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
          open ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export default function Problems({ reviewMode = false }) {
  const { t } = useI18n()
  // 列表状态
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // 过滤状态
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [showPassRate, setShowPassRate] = useState(true)
  const [randomMode, setRandomMode] = useState(reviewMode)
  const [reviewCount, setReviewCount] = useState(10)
  const [todayReviewStats, setTodayReviewStats] = useState({ problems: 0, sessions: 0, loading: true })
  const [searchQuery, setSearchQuery] = useState('')
  const [difficulty, setDifficulty] = useState('All')
  const [sortMode, setSortMode] = useState('lcId')
  const [sortDirection, setSortDirection] = useState('asc')
  const [selectedTags, setSelectedTags] = useState([])

  // 侧边栏数据
  const [stats, setStats] = useState({ total: 0, mastered: 0, reviewing: 0 })
  const [allTags, setAllTags] = useState([])
  const [tagCounts, setTagCounts] = useState({})

  // 新增题目弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [inputType, setInputType] = useState('frontendId') // 'frontendId' | 'titleSlug'
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState('')

  // 题目详情抽屉
  const [activeProblemId, setActiveProblemId] = useState(null)
  const [activeProblem, setActiveProblem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 内置 LeetCode 题库浏览器（null = 关闭）
  const [embeddedUrl, setEmbeddedUrl] = useState(null)

  const searchTimer = useRef(null)

  const load = useCallback(
    async (nextPage = 1) => {
      setLoading(true)
      try {
        const params = {
          page: nextPage,
          page_size: pageSize,
          difficulty,
          sort_mode: sortMode,
          sort_direction: sortDirection,
        }
        if (randomMode) {
          params.mode = 'reviewing_random'
          params.count = reviewCount
        }
        if (searchQuery.trim()) params.q = searchQuery.trim()
        if (selectedTags.length) params.tags = selectedTags.join(',')
        const res = await getProblems(params)
        const d = res?.data || {}
        setItems(d.items || [])
        setTotal(d.total || 0)
        setTotalPages(d.total_pages || 1)
        setPage(d.page || nextPage)
      } catch (e) {
        setMsg(e.message)
      } finally {
        setLoading(false)
      }
    },
    [randomMode, reviewCount, searchQuery, difficulty, sortMode, sortDirection, selectedTags, pageSize]
  )

  // 读取设置中的分页大小 / 通过率显示开关
  useEffect(() => {
    getSettings()
      .then((res) => {
        const s = res?.data || res || {}
        const n = clampPageSize(Number(s.page_size))
        if (n && n !== DEFAULT_PAGE_SIZE) setPageSize(n)
        setShowPassRate(s.show_pass_rate !== 'false')
      })
      .catch(() => {})
  }, [])

  // 分页大小变化时回到第 1 页重新加载
  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize])

  // 筛选条件变化回到第 1 页
  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [randomMode, reviewCount, difficulty, sortMode, sortDirection, selectedTags])

  useEffect(() => {
    if (!reviewMode) return
    getActivityDay({ date: localDateYMD() })
      .then((res) => {
        const problems = res?.data?.problems || []
        setTodayReviewStats({
          problems: problems.length,
          sessions: problems.reduce((sum, p) => sum + (typeof p.reviewCount === 'number' ? p.reviewCount : 0), 0),
          loading: false,
        })
      })
      .catch(() => setTodayReviewStats({ problems: 0, sessions: 0, loading: false }))
  }, [reviewMode])

  // 搜索防抖
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      if (searchQuery.trim()) load(1)
    }, 400)
    return () => clearTimeout(searchTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // 基础数据 + 知识专题
  useEffect(() => {
    Promise.all([getProblemStats(), getUserProblemStats()])
      .then(([p, u]) => {
        setStats({
          total: p?.data?.total ?? u?.data?.total ?? 0,
          mastered: u?.data?.mastered ?? 0,
          reviewing: u?.data?.reviewing ?? 0,
        })
      })
      .catch(() => {})
    getTagSummary()
      .then((res) => {
        setAllTags(res?.data?.tags || [])
        setTagCounts(res?.data?.counts || {})
      })
      .catch(() => {})
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await load(randomMode ? 1 : page)
    } finally {
      setRefreshing(false)
    }
  }

  const handleSelectSortMode = (mode) => {
    if (sortMode === mode) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortMode(mode)
      setSortDirection(mode === 'createdAt' ? 'desc' : 'asc')
    }
  }

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  // 打开详情抽屉
  const handleOpenProblem = (p) => {
    setActiveProblemId(p.id)
    setActiveProblem(null)
    setDetailLoading(true)
    getProblem(p.id)
      .then((res) => {
        setActiveProblem(res?.data || res)
      })
      .catch((e) => {
        setMsg(`加载详情失败：${e.message}`)
        setActiveProblemId(null)
      })
      .finally(() => setDetailLoading(false))
  }

  // 打开 LeetCode 题库（按设置决定内置浏览器 / 系统浏览器）
  const handleOpenLeetcode = async () => {
    const mode = await getBrowserOpenMode()
    if (mode === 'system') {
      openInSystemBrowser(LEETCODE_PROBLEMSET_URL)
      return
    }
    setEmbeddedUrl(LEETCODE_PROBLEMSET_URL)
  }

  // 关闭内置浏览器：可能已在其中保存了题目数据，刷新列表
  const handleEmbeddedClose = () => {
    setEmbeddedUrl(null)
    handleRefresh()
  }

  // 抽屉内更新题目（同步刷新列表行）
  const handleUpdateProblem = (next) => {
    setActiveProblem(next)
    setItems((prev) =>
      prev.map((p) =>
        p.id === next.id
          ? {
              ...p,
              status: next.status ?? p.status,
              progressStatus: next.progressStatus ?? p.progressStatus,
              personalDifficulty: next.personalDifficulty ?? p.personalDifficulty,
              hasHtmlDemo: next.hasHtmlDemo ?? p.hasHtmlDemo,
            }
          : p
      )
    )
  }

  // 抽屉内删除题目
  const handleDeleteProblem = (id) => {
    setActiveProblemId(null)
    setActiveProblem(null)
    setItems((prev) => prev.filter((p) => p.id !== id))
    setTotal((t) => Math.max(0, t - 1))
    setMsg(t('已删除'))
  }

  const handleAddProblem = async (value, type) => {
    const v = (value ?? inputValue).trim()
    if (!v) return
    setFetching(true)
    setMsg('')
    try {
      const params = type === 'frontendId' ? { frontendId: v } : { titleSlug: v }
      await fetchLeetCodeProblem(params)
      setInputValue('')
      setModalOpen(false)
      setMsg(t('同步成功'))
      await handleRefresh()
    } catch (e) {
      setMsg(`同步失败：${e.message}`)
    } finally {
      setFetching(false)
    }
  }

  const sortLabel = t(SORT_OPTIONS.find((o) => o.id === sortMode)?.label || '题号')
  const difficultyLabel = difficulty === 'All' ? t('全部') : t(DIFFICULTIES[difficulty]?.label || difficulty)

  const startIndex = (page - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, total)
  const showPagination = !randomMode && totalPages > 1

  const pageNumbers = useMemo(() => {
    const pages = []
    const maxVisible = 7
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else if (page <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push('...', totalPages)
    } else if (page >= totalPages - 3) {
      pages.push(1, '...')
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages)
    }
    return pages
  }, [page, totalPages])

  return (
    <div className="relative flex h-full bg-white">
      {/* 左侧过滤面板 */}
      <aside className="scrollbar-hidden w-80 shrink-0 space-y-6 overflow-y-auto border-r border-slate-100 bg-slate-50/50 p-5">
        {/* 我的基础数据 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600">{t('我的基础数据')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative flex min-h-[88px] flex-col justify-between overflow-hidden rounded-2xl bg-primary-600 p-4 text-white shadow-card">
              <p className="relative z-[1] text-xs font-medium tracking-wide text-white/80">
                {reviewMode ? '待复习' : '总计录入'}
              </p>
              <p className="relative z-[1] text-3xl font-semibold tracking-tight tabular-nums">
                {reviewMode ? stats.reviewing : stats.total}
              </p>
            </div>
            <div className="relative flex min-h-[88px] flex-col justify-between overflow-hidden rounded-2xl bg-white p-4 text-slate-800 shadow-card ring-1 ring-slate-100">
              <p className="relative z-[1] text-xs font-medium tracking-wide text-slate-500">
                {reviewMode ? '已精通 · 无需复习' : '已精通'}
              </p>
              <p className="relative z-[1] text-3xl font-semibold tracking-tight tabular-nums text-emerald-600">{stats.mastered}</p>
            </div>
          </div>
        </section>

        {/* 快速检索 */}
        <section className="space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-600">{t('快速检索')}</h3>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder={t('编号/题名...')}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </section>

        {/* 难度过滤 */}
        <section className="space-y-3">
          <CollapsibleSection
            label={
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-sm font-semibold text-slate-700">{t('难度过滤')}</span>
              </span>
            }
            badge={
              <span className="truncate rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                {difficultyLabel}
              </span>
            }
          >
            <div className="flex flex-col gap-1 pt-1">
              {['All', 'Easy', 'Medium', 'Hard'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    difficulty === d
                      ? 'bg-primary-600 text-white shadow-card'
                      : 'border border-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <span>{d === 'All' ? t('全部') : t(DIFFICULTIES[d].label)}</span>
                  {difficulty === d && <CheckCircle size={12} />}
                </button>
              ))}
            </div>
          </CollapsibleSection>
        </section>

        {/* 排序方式 */}
        <section className="space-y-3">
          <CollapsibleSection
            label={
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-sm font-semibold text-slate-700">{t('排序方式')}</span>
              </span>
            }
            badge={
              <span className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-600">
                {sortLabel}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                  }}
                  className="inline-flex items-center justify-center rounded p-0.5 transition-colors hover:bg-slate-100"
                  title={sortDirection === 'asc' ? '当前正序，点击切换倒序' : '当前倒序，点击切换正序'}
                  aria-label={t('切换排序方向')}
                >
                  <ChevronsUpDown size={13} className="text-slate-500" />
                </button>
              </span>
            }
          >
            <div className="flex flex-col gap-1 pt-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectSortMode(opt.id)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    sortMode === opt.id
                      ? 'bg-primary-600 text-white shadow-card'
                      : 'border border-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <span>{t(opt.label)}</span>
                  {sortMode === opt.id ? (
                    <div className="flex items-center gap-1">
                      {sortDirection === 'asc' ? <ArrowUpAZ size={12} /> : <ArrowDownAZ size={12} />}
                      <CheckCircle size={12} />
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </CollapsibleSection>
        </section>

        {/* 知识专题 */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600">{t('知识专题')}</h3>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedTags.includes(tag)
                    ? 'border-primary-300 bg-primary-100 text-primary-800'
                    : 'border-slate-200 bg-slate-100/70 text-slate-600 hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                {tag}
                <span className="ml-1 text-[11px] text-slate-400">({tagCounts[tag] ?? 0})</span>
              </button>
            ))}
            {allTags.length === 0 && <p className="px-1 text-[11px] text-slate-400">{t('暂无标签')}</p>}
          </div>
        </section>
      </aside>

      {/* 主内容 */}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white p-8">
        <div className="space-y-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="flex min-w-0 items-center gap-3 text-base font-semibold tracking-tight text-slate-900">
              {randomMode ? (
                <span className="rounded-lg bg-violet-600 p-1.5 text-white shadow-card">
                  <History size={16} />
                </span>
              ) : (
                <span className="rounded-lg bg-primary-600 p-1.5 text-white shadow-card">
                  <LayoutList size={16} />
                </span>
              )}
              {randomMode ? '复习' : '题库'}
            </h2>

            <div className="flex items-center gap-3">
              {msg && <span className="max-w-xs truncate text-xs font-medium text-slate-400">{msg}</span>}
              {randomMode && (
                <div className="flex items-center gap-1.5" aria-label={t('随机抽取题数')}>
                  {REVIEW_COUNTS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setReviewCount(count)}
                      aria-pressed={reviewCount === count}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all active:scale-95 ${
                        reviewCount === count
                          ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700'
                      }`}
                      title={`随机抽取 ${count} 题`}
                    >
                      随机 {count} 题
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={handleOpenLeetcode}
                className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50/60 px-4 py-1.5 text-[11px] font-semibold text-primary-700 shadow-sm transition-all hover:border-primary-300 hover:bg-primary-100 active:scale-95"
                title={t('在内置浏览器打开 LeetCode 题库，可直接进入题目练习（自动加载笔记）')}
              >
                VIEW_LEETCODE <ExternalLink size={13} />
              </button>
              {!randomMode && <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-normal text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                title={t('从服务器重新加载列表')}
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />{t('刷新')}
              </button>}
              {!randomMode && (
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(true)
                    setMsg('')
                  }}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-1.5 text-[11px] font-normal text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-700 active:scale-95"
                >
                  <Plus size={12} />{t('新增题目')}
                </button>
              )}
            </div>
          </div>

          {randomMode && (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={t('今日复习统计')}>
              <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/60 px-5 py-3">
                <span className="text-xs font-medium text-violet-700">{t('今日复习题目')}</span>
                <span className="text-xl font-semibold tabular-nums text-violet-900">
                  {todayReviewStats.loading ? '—' : todayReviewStats.problems} <span className="text-xs font-normal">{t('题')}</span>
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-5 py-3">
                <span className="text-xs font-medium text-slate-600">{t('今日复习次数')}</span>
                <span className="text-xl font-semibold tabular-nums text-slate-900">
                  {todayReviewStats.loading ? '—' : todayReviewStats.sessions} <span className="text-xs font-normal">{t('次')}</span>
                </span>
              </div>
            </section>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-card">
            <div className="grid grid-cols-12 items-center border-b border-slate-100 bg-slate-50/80 px-8 py-3.5 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">
              <div className="col-span-1">#</div>
              <div className={randomMode ? 'col-span-3' : 'col-span-4'}>{t('题名')}</div>
              {showPassRate && <div className="col-span-1 text-center">{t('通过率')}</div>}
              <div className="col-span-1 text-center">{t('难度')}</div>
              <div className="col-span-2 text-center">{t('完成状态')}</div>
              {randomMode && <div className="col-span-1 text-center">{t('复习次数')}</div>}
              <div className="col-span-1 text-center">{t('手感')}</div>
              <div className="col-span-2 pr-4 text-right uppercase">{t('打卡状态')}</div>
            </div>

            <div className="divide-y divide-slate-50">
              {loading && (
                <div className="px-8 py-12 text-center text-sm font-medium text-slate-400">{t('加载中…')}</div>
              )}
              {!loading && items.length === 0 && (
                <div className="px-8 py-12 text-center text-sm font-medium text-slate-400">
                  {randomMode ? '当前没有需要复习的题目' : '题库为空，右上角「新增题目」抓取第一道题'}
                </div>
              )}
              {!loading &&
                items.map((p) => {
                  const meta = randomMode ? STATUS_MAP.Reviewing : statusMeta(p)
                  const statusM = statusMetaFor(p)
                  const isMastered = (p.progressStatus || p.status) === 'Mastered'
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleOpenProblem(p)}
                      style={
                        isMastered ? { backgroundColor: 'rgba(117, 228, 151, 0.3)' } : undefined
                      }
                      className={`group grid cursor-pointer grid-cols-12 items-center border-l-4 px-8 py-3 transition-all hover:bg-primary-50/40 ${
                        isMastered ? 'border-transparent' : 'border-transparent'
                      }`}
                    >
                      <div className="col-span-1 flex min-w-0 items-center gap-1 font-mono text-[11px] font-normal text-slate-300 group-hover:text-primary-500">
                        <span className="truncate">{p.lcId}</span>
                        {p.hasHtmlDemo ? (
                          <span
                            className="inline-flex shrink-0 text-primary-500 group-hover:text-primary-600"
                            title={t('已保存解题演示')}
                            aria-label={t('已保存解题演示')}
                          >
                            <MonitorPlay size={14} strokeWidth={2.25} />
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`flex min-w-0 items-center overflow-hidden pr-4 ${
                          randomMode ? 'col-span-3' : 'col-span-4'
                        }`}
                      >
                        <span className="min-w-0 truncate text-xs font-normal text-slate-700 transition-colors group-hover:text-primary-800">
                          {p.translatedTitle || p.title}
                        </span>
                      </div>
                      {showPassRate && (
                        <div className="col-span-1 text-center font-mono text-[11px] text-slate-400">
                          {p.passRate}
                        </div>
                      )}
                      <div className="col-span-1 flex justify-center">
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-tighter ${
                            DIFFICULTIES[p.difficulty]?.color || 'text-slate-500 bg-slate-50 border-slate-100'
                          }`}
                        >
                          {t(DIFFICULTIES[p.difficulty]?.label || p.difficulty || '—')}
                        </span>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-widest ${meta.light}`}
                        >
                          {t(meta.label)}
                        </span>
                      </div>
                      {randomMode && (
                        <div className="col-span-1 flex justify-center font-mono text-sm text-slate-500">
                          {p.reviewCount ?? 0}
                        </div>
                      )}
                      <div className="col-span-1 flex justify-center text-sm">
                        {PERSONAL_RATINGS[p.personalDifficulty] || '—'}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-widest ${statusM.light}`}
                        >
                          {t(statusM.label)}
                        </span>
                        <ChevronRight
                          size={14}
                          className="text-slate-200 transition-all group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {showPagination && (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-xs text-slate-500">
                显示 {total === 0 ? 0 : startIndex + 1}-{endIndex} 条，共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => load(page - 1)}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-normal text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                {pageNumbers.map((p, index) =>
                  p === '...' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => load(p)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-normal transition-all ${
                        p === page
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => load(page + 1)}
                  disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-normal text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 从 LeetCode 同步弹窗 */}
        {modalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-primary-900/10 backdrop-blur-md animate-in fade-in duration-300"
              onClick={() => !fetching && setModalOpen(false)}
            ></div>
            <div className="relative w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-10 shadow-overlay animate-in zoom-in-95 duration-300">
              <div className="mx-auto mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-sm font-semibold tracking-tight text-primary-600 shadow-inner">
                LC
              </div>
              <h3 className="mb-1 text-center text-lg font-semibold tracking-tight text-slate-900">{t('从 LeetCode 同步')}
              </h3>
              <p className="mb-6 text-center text-xs font-normal tracking-wide text-slate-400">
                {inputType === 'frontendId' ? '输入编号 (1, 2, 14)' : '输入 Slug (two-sum)'}
              </p>

              <div className="mb-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputType('frontendId')
                    setInputValue('')
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                    inputType === 'frontendId'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{t('按序号')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputType('titleSlug')
                    setInputValue('')
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                    inputType === 'titleSlug'
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >{t('按 Slug')}
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleAddProblem(inputValue, inputType)
                }}
              >
                <input
                  type="text"
                  autoFocus
                  placeholder={inputType === 'frontendId' ? '题号' : '题目 Slug'}
                  className="mb-8 w-full rounded-xl bg-slate-50 px-4 py-4 text-center font-mono text-2xl tracking-wide shadow-sm outline-none transition-all ring-primary-50 focus:bg-white focus:ring-4 disabled:opacity-50"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={fetching}
                />
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    disabled={fetching}
                    className="flex-1 py-3 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
                  >{t('取消')}
                  </button>
                  <button
                    type="submit"
                    disabled={fetching || !inputValue.trim()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 py-3 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {fetching ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>{t('加载中...')}
                      </>
                    ) : (
                      '确认'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* 题目详情抽屉 */}
      {(activeProblem || detailLoading) && activeProblemId && (
        <DetailDrawer
          activeProblem={activeProblem}
          updateProblem={handleUpdateProblem}
          onDeleted={handleDeleteProblem}
          onClose={() => {
            setActiveProblemId(null)
            setActiveProblem(null)
          }}
          loading={detailLoading}
        />
      )}

      {/* 内置 LeetCode 题库浏览器 */}
      {embeddedUrl && (
        <EmbeddedBrowser url={embeddedUrl} onClose={handleEmbeddedClose} />
      )}
    </div>
  )
}
