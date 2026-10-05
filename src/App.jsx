import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  LayoutDashboard,
  BookOpen,
  History,
  CalendarDays,
  Settings,
  UserRound,
  RefreshCw,
  LogOut,
  BarChart3,
} from 'lucide-react'
import packageJson from '../package.json'
import { getSettings, getLeetCodeUserProfile, getLeetCodeSolvedStats, updateSettings } from './api/leetcode'
import { fetchLatestRelease, fetchReleaseByVersion, isNewerVersion, DOWNLOAD_PAGE_URL } from './utils/releaseCheck'
import { openInSystemBrowser } from './utils/browserOpen'
import { isTauri } from './api/client'
import { useI18n } from './i18n'
import Dashboard from './pages/Dashboard.jsx'
import Problems from './pages/Problems.jsx'
import ProblemDetail from './pages/ProblemDetail.jsx'
import CalendarStats from './pages/CalendarStats.jsx'
import AIChat from './pages/AIChat.jsx'
import SettingsPage from './pages/Settings.jsx'
import UserAvatar from './components/UserAvatar.jsx'

const navItems = [
  { to: '/', label: '数据看板', icon: LayoutDashboard, end: true },
  { to: '/problems', label: '题库', icon: BookOpen, end: true },
  { to: '/problems/review', label: '复习', icon: History, end: true },
  { to: '/calendar', label: '日历统计', icon: CalendarDays, end: true },
  { to: '/settings', label: '设置', icon: Settings },
]

const COLLAPSED_KEY = 'sidebar.collapsed'

function summarizeSolvedStats(stats) {
  const count = (items) => (items || []).reduce((total, item) => total + (item.count || 0), 0)
  return {
    solved: count(stats?.numAcceptedQuestions),
    remaining: count(stats?.numUntouchedQuestions),
  }
}

export default function App() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) !== '0'
  )
  const [leetcodeAccount, setLeetcodeAccount] = useState(null)
  const [leetcodeStats, setLeetcodeStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [accountLoading, setAccountLoading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')
  const [latestRelease, setLatestRelease] = useState(null)
  const [currentRelease, setCurrentRelease] = useState(null)
  const [releaseCheckError, setReleaseCheckError] = useState('')
  const [currentReleaseError, setCurrentReleaseError] = useState('')
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const checkingReleaseRef = useRef(false)
  const appUpdateAvailable = latestRelease
    ? isNewerVersion(latestRelease.version, packageJson.version)
    : false
  const accountMenuRef = useRef(null)

  const checkForUpdates = useCallback(async () => {
    if (checkingReleaseRef.current) return
    checkingReleaseRef.current = true
    setCheckingForUpdates(true)
    const [latestResult, currentResult] = await Promise.allSettled([
      fetchLatestRelease(),
      fetchReleaseByVersion(packageJson.version),
    ])
    if (latestResult.status === 'fulfilled') {
      setLatestRelease(latestResult.value)
      setReleaseCheckError('')
    } else {
      setReleaseCheckError(latestResult.reason?.message || '无法检查更新')
    }
    if (currentResult.status === 'fulfilled') {
      setCurrentRelease(currentResult.value)
      setCurrentReleaseError('')
    } else {
      setCurrentReleaseError(currentResult.reason?.message || '无法获取当前版本更新日志')
    }
    checkingReleaseRef.current = false
    setCheckingForUpdates(false)
  }, [])

  useEffect(() => {
    let active = true
    const runCheck = () => {
      if (active) checkForUpdates()
    }
    runCheck()
    const timer = window.setInterval(runCheck, 10 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [checkForUpdates])

  const loadLeetCodeAccount = useCallback(async () => {
    setAccountLoading(true)
    setAccountMessage('')
    try {
      const settingsRes = await getSettings()
      const settings = settingsRes?.data ?? settingsRes
      if (!settings?.leetcode_cookie) {
        setLeetcodeAccount(null)
        setLeetcodeStats(null)
        setStatsError('')
        setAccountMenuOpen(false)
        return
      }

      const [profileResult, statsResult] = await Promise.allSettled([
        getLeetCodeUserProfile(),
        getLeetCodeSolvedStats(),
      ])
      const profile = profileResult.status === 'fulfilled'
        ? profileResult.value?.data ?? profileResult.value
        : null
      setLeetcodeAccount({
        avatar: profile?.avatar || '',
        displayName: profile?.realName || profile?.username || settings.leetcode_username || t('LeetCode 用户'),
        userId: profile?.username || profile?.userSlug || '',
      })
      if (statsResult.status === 'fulfilled') {
        const stats = statsResult.value?.data ?? statsResult.value
        setLeetcodeStats(summarizeSolvedStats(stats))
        setStatsError('')
      } else {
        setStatsError(t('统计暂不可用'))
      }
    } catch {
      // 资料拉取失败时仍保留账号入口，使用默认头像并允许重试或退出。
      setLeetcodeAccount((current) => current || { avatar: '', displayName: t('已绑定账号'), userId: '' })
      setAccountMessage(t('刷新账号信息失败，请稍后重试'))
    } finally {
      setAccountLoading(false)
    }
  }, [])

  const refreshLeetCodeStats = async () => {
    setStatsLoading(true)
    setStatsError('')
    try {
      const res = await getLeetCodeSolvedStats()
      const stats = res?.data ?? res
      if (!stats?.numAcceptedQuestions) throw new Error(t('未获取到刷题统计'))
      setLeetcodeStats(summarizeSolvedStats(stats))
    } catch (error) {
      setStatsError(error.message || t('统计刷新失败'))
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    loadLeetCodeAccount()
    window.addEventListener('leetcode-account-changed', loadLeetCodeAccount)
    return () => window.removeEventListener('leetcode-account-changed', loadLeetCodeAccount)
  }, [loadLeetCodeAccount])

  useEffect(() => {
    if (!isTauri()) return undefined
    let unlisten
    let cancelled = false
    import('@tauri-apps/api/event').then(({ listen }) => listen('tray-navigate', (event) => {
      const path = typeof event.payload === 'string' ? event.payload : '/'
      navigate(path)
    })).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    }).catch(() => {})
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [navigate])

  useEffect(() => {
    if (!accountMenuOpen) return
    const closeOnOutsideClick = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountMenuOpen])

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSED_KEY, v ? '0' : '1')
      return !v
    })
  }

  const logoutLeetCode = async () => {
    setLoggingOut(true)
    setAccountMessage('')
    try {
      await updateSettings({ leetcode_cookie: '', leetcode_username: '' })
      setLeetcodeAccount(null)
      setAccountMenuOpen(false)
      window.dispatchEvent(new Event('leetcode-account-changed'))
      setAccountMessage(t('已退出 LeetCode 账号'))
      window.setTimeout(() => setAccountMessage(''), 3000)
    } catch (error) {
      setAccountMessage(t('退出失败：') + error.message)
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="relative flex h-full">
      {/* macOS 标题栏拖拽区（Overlay 模式，覆盖在内容顶部） */}
      <div
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-50 h-7"
      />
      {/* 侧边栏 */}
      <aside
        className={`flex shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-300 ${
          collapsed ? 'w-[84px]' : 'w-56'
        }`}
      >
        {/* macOS 红绿灯悬浮在左上角，顶部留出安全区 */}
        <div
          className={`flex items-center pb-5 pt-12 ${
            collapsed ? 'flex-col justify-center gap-2 px-0' : 'gap-2 px-5'
          }`}
        >
          <img src="/logo.png" alt={t('LeetCode 笔记')} className="h-8 w-8 shrink-0 rounded-lg" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{t('LeetCode 笔记')}</div>
              <div className="text-[11px] text-slate-400">{t('本地学习助手')}</div>
            </div>
          )}
        </div>
        <nav className={`flex-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? `${t(label)}${to === '/settings' && appUpdateAvailable ? ` · ${t('有新版本可用')}` : ''}` : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm transition-colors ${
                  collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
                } ${
                  isActive
                    ? 'bg-primary-50 font-medium text-primary-600'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`
              }
            >
              <span className="relative flex shrink-0">
                <Icon size={18} />
                {to === '/settings' && appUpdateAvailable && (
                  <span role="img" aria-label={t('有新版本可用')} className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
                )}
              </span>
              {!collapsed && <span className="truncate">{t(label)}</span>}
            </NavLink>
          ))}
        </nav>
        <div ref={accountMenuRef} className={`relative mb-2 flex ${collapsed ? 'justify-center' : 'px-3'}`}>
          {leetcodeAccount && accountMenuOpen && (
            <div
              role="menu"
              className="absolute bottom-0 left-[calc(100%+8px)] z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
            >
              <div className="flex items-center gap-3 px-1 py-1.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-slate-400">
                  <UserAvatar src={leetcodeAccount.avatar} name={leetcodeAccount.displayName} alt={leetcodeAccount.displayName} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{leetcodeAccount.displayName}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {leetcodeAccount.userId ? `@${leetcodeAccount.userId}` : t('LeetCode 账号')}
                  </p>
                </div>
              </div>
              {accountMessage && (
                <p role="status" className="px-3 py-1.5 text-[11px] text-rose-600">{accountMessage}</p>
              )}
              <div className="my-3 border-t border-slate-100" />
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <BarChart3 size={14} />
                  {t('刷题统计')}
                </div>
                <button
                  type="button"
                  onClick={refreshLeetCodeStats}
                  disabled={statsLoading || accountLoading}
                  aria-label={t('刷新刷题统计')}
                  title={t('刷新刷题统计')}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-primary-600 disabled:opacity-50"
                >
                  {statsLoading || accountLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  刷新
                </button>
              </div>
              {leetcodeStats ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-emerald-50/80 px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-emerald-700">{leetcodeStats.solved.toLocaleString()}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{t('已刷题')}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                    <p className="text-lg font-bold tabular-nums text-slate-700">{leetcodeStats.remaining.toLocaleString()}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{t('剩余题数')}</p>
                  </div>
                </div>
              ) : (
                <p role={statsError ? 'status' : undefined} className={`rounded-lg bg-slate-50 px-3 py-3 text-xs ${statsError ? 'text-rose-600' : 'text-slate-400'}`}>
                  {statsLoading || accountLoading ? t('正在获取刷题统计…') : statsError || t('暂无统计数据')}
                </p>
              )}
              {statsError && leetcodeStats && (
                <p role="status" className="mt-2 px-1 text-[11px] text-rose-600">{statsError}</p>
              )}
              <div className="my-3 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={logoutLeetCode}
                disabled={loggingOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                {loggingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                {loggingOut ? t('正在退出…') : t('退出登录')}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (leetcodeAccount) setAccountMenuOpen((open) => !open)
              else {
                window.dispatchEvent(new Event('open-leetcode-account-settings'))
                navigate('/settings')
              }
            }}
            title={leetcodeAccount?.displayName || t('绑定 LeetCode 账号')}
            aria-label={leetcodeAccount ? t('打开 LeetCode 账号菜单') : t('绑定 LeetCode 账号')}
            aria-haspopup={leetcodeAccount ? 'menu' : undefined}
            aria-expanded={leetcodeAccount ? accountMenuOpen : undefined}
            className={`flex h-10 items-center overflow-hidden text-slate-500 transition hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-100 ${
              collapsed ? 'w-10 justify-center rounded-full' : 'w-full gap-3 px-2 text-left'
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400">
              {leetcodeAccount ? (
                <UserAvatar src={leetcodeAccount.avatar} name={leetcodeAccount.displayName} />
              ) : (
                <UserRound size={18} />
              )}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {leetcodeAccount?.displayName || t('未登录')}
                </span>
              </span>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? t('展开菜单') : t('收起菜单')}
          aria-label={collapsed ? t('展开菜单') : t('收起菜单')}
          className="group relative mt-auto mb-3 flex h-7 w-full items-center justify-center border-t border-neutral-100 text-neutral-300 transition-colors hover:bg-neutral-50 hover:text-primary-600"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </aside>
      {accountMessage && !accountMenuOpen && (
        <div role="status" className="absolute bottom-4 left-24 z-50 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg">
          {accountMessage}
        </div>
      )}

      {/* 内容区 */}
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Outlet />}>
            <Route index element={<Dashboard />} />
            <Route path="problems" element={<Problems key="list" />} />
            <Route path="problems/review" element={<Problems key="review" reviewMode />} />
            <Route path="problems/:id" element={<ProblemDetail />} />
            <Route path="calendar" element={<CalendarStats />} />
            <Route path="ai" element={<AIChat />} />
            <Route
              path="settings"
              element={(
                <SettingsPage
                  latestRelease={latestRelease}
                  currentRelease={currentRelease}
                  updateAvailable={appUpdateAvailable}
                  releaseCheckError={releaseCheckError}
                  currentReleaseError={currentReleaseError}
                  checkingForUpdates={checkingForUpdates}
                  checkForUpdates={checkForUpdates}
                  openDownloadPage={() => openInSystemBrowser(DOWNLOAD_PAGE_URL)}
                />
              )}
            />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </main>
    </div>
  )
}
