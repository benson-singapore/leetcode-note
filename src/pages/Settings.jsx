import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link2,
  Sparkles,
  GraduationCap,
  SlidersHorizontal,
  Info,
  Puzzle,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Loader2,
  KeyRound,
  UserRound,
  BarChart3,
  DownloadCloud,
} from 'lucide-react'
import { getSettings, updateSettings, fetchLeetCodeProblem, getLeetCodeUserProfile, getLeetCodeSolvedStats, getLeetCodeSolvedList, importLeetCodeSolved } from '../api/leetcode'
import { getAISettings, updateAISettings, listProviders } from '../api/ai'
import { get, post, isTauri, resolveBase } from '../api/client'
import pluginScriptRaw from '../../tamper-monkey/leetcode-note-drawer.user.js?raw'

const NAV = [
  { id: 'binding', label: '账号绑定', icon: Link2 },
  { id: 'ai', label: 'AI 助手', icon: Sparkles },
  { id: 'review', label: '复习偏好', icon: GraduationCap },
  { id: 'appearance', label: '外观显示', icon: SlidersHorizontal },
  { id: 'plugin', label: '插件同步', icon: Puzzle },
  { id: 'about', label: '关于', icon: Info },
]

const inputCls =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-50'

const labelCls = 'mb-1.5 block text-xs font-medium text-slate-500'
const hintCls = 'mt-1.5 text-[11px] font-normal text-slate-400'

function SectionHeader({ title, desc, badge }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        {badge}
      </div>
      {desc && <p className="text-xs font-normal text-slate-400">{desc}</p>}
    </div>
  )
}

function Card({ icon: Icon, iconBg, title, desc, children, footer }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
      <div className="mb-5 flex items-start gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${iconBg}`}
        >
          <Icon size={20} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {desc && <p className="mt-1 text-xs leading-relaxed text-slate-400">{desc}</p>}
        </div>
      </div>
      {children}
      {footer && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          {footer}
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  )
}

const LANGUAGES = ['Python 3', 'Java', 'C++', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'C#']
const REGIONS = [
  { value: 'cn', label: '力扣中国 (leetcode.cn)' },
  { value: 'com', label: '国际站 (leetcode.com)' },
]

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [ai, setAi] = useState(null)
  const [providers, setProviders] = useState([])
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('ok')
  const [active, setActive] = useState('binding')
  const [loginState, setLoginState] = useState('idle') // idle | logging-in | success | failed
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // { ok, text }
  const [cacheInfo, setCacheInfo] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [profile, setProfile] = useState(null) // { avatar, username, realName, userSlug }
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [cookieEditing, setCookieEditing] = useState(false)
  const [solvedStats, setSolvedStats] = useState(null)
  const [solvedStatsLoading, setSolvedStatsLoading] = useState(false)
  const [solvedStatsError, setSolvedStatsError] = useState('')
  const [importState, setImportState] = useState(null) // { phase, total, done, imported, skipped, failed, error }
  const [importedTotal, setImportedTotal] = useState(null) // 累计从 LeetCode 导入的题数
  const [serverHost, setServerHost] = useState('')
  const [copied, setCopied] = useState(false)

  // 解析后台服务地址（Tauri 下取 sidecar 动态端口，浏览器调试默认 17877）
  useEffect(() => {
    resolveBase()
      .then((base) => setServerHost(base || 'http://127.0.0.1:17877'))
      .catch(() => setServerHost('http://127.0.0.1:17877'))
  }, [])

  // 将脚本中的 API_HOST 替换为当前后台服务地址，@match 替换为所选区域对应的站点
  const pluginHost = serverHost || 'http://127.0.0.1:17877'
  const pluginRegion = settings.leetcode_region || 'cn'
  const pluginMatch =
    pluginRegion === 'com' ? 'https://leetcode.com/problems/**' : 'https://leetcode.cn/problems/**'
  const pluginScript = pluginScriptRaw
    .replace(/const API_HOST = '[^']*';/, `const API_HOST = '${pluginHost}';`)
    .replace(/^\/\/ @match\s+.*$/m, `// @match        ${pluginMatch}`)

  const copyPluginScript = async () => {
    try {
      await navigator.clipboard.writeText(pluginScript)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = pluginScript
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const loadProfile = async () => {
    if (!settings.leetcode_cookie) return
    setProfileLoading(true)
    setProfileError('')
    try {
      const res = await getLeetCodeUserProfile()
      const data = res?.data ?? res
      if (data?.username) {
        setProfile(data)
        setSettings((prev) => ({
          ...prev,
          leetcode_username: prev.leetcode_username || data.realName || data.username,
        }))
      } else {
        setProfileError('未获取到账号信息')
      }
    } catch (e) {
      setProfileError(e.message || '拉取账号信息失败')
    } finally {
      setProfileLoading(false)
    }
  }

  const flash = (text, type = 'ok') => {
    setMsg(text)
    setMsgType(type)
    setTimeout(() => setMsg(''), 3000)
  }

  // 刷题统计：按难度分组的已通过 / 尝试失败 / 未做
  const statSummary = useMemo(() => {
    if (!solvedStats) return null
    const sum = (arr) => (arr || []).reduce((a, c) => a + (c.count || 0), 0)
    const pick = (arr, d) => arr?.find((x) => x.difficulty === d)?.count ?? 0
    const solved = sum(solvedStats.numAcceptedQuestions)
    const failed = sum(solvedStats.numFailedQuestions)
    const untouched = sum(solvedStats.numUntouchedQuestions)
    const byDifficulty = [
      { key: 'EASY', label: '简单', bar: 'bg-emerald-500', text: 'text-emerald-600' },
      { key: 'MEDIUM', label: '中等', bar: 'bg-amber-500', text: 'text-amber-600' },
      { key: 'HARD', label: '困难', bar: 'bg-rose-500', text: 'text-rose-600' },
    ].map(({ key, label, bar, text }) => {
      const solvedN = pick(solvedStats.numAcceptedQuestions, key)
      const totalN = solvedN + pick(solvedStats.numFailedQuestions, key) + pick(solvedStats.numUntouchedQuestions, key)
      return { key, label, bar, text, solved: solvedN, total: totalN }
    })
    return { solved, failed, untouched, total: solved + failed + untouched, byDifficulty }
  }, [solvedStats])

  const loadSolvedStats = async () => {
    if (!settings.leetcode_cookie) return
    setSolvedStatsLoading(true)
    setSolvedStatsError('')
    try {
      const res = await getLeetCodeSolvedStats()
      const data = res?.data ?? res
      if (data?.numAcceptedQuestions) {
        setSolvedStats(data)
      } else {
        setSolvedStatsError('未获取到刷题统计')
      }
    } catch (e) {
      setSolvedStatsError(e.message || '拉取刷题统计失败')
    } finally {
      setSolvedStatsLoading(false)
    }
  }

  // 一键导入：先拉取已刷题列表，再分批导入并实时更新进度条
  const runSolvedImport = async () => {
    if (importState?.running) return
    setImportState({ running: true, phase: 'list', total: 0, done: 0, imported: 0, skipped: 0, failed: 0, error: '' })
    let imported = 0
    let skipped = 0
    let failed = 0
    try {
      const listRes = await getLeetCodeSolvedList()
      const list = listRes?.data ?? listRes
      const slugs = (list?.questions || []).map((q) => q.titleSlug)
      if (!slugs.length) {
        setImportState((s) => ({ ...s, running: false, phase: 'done', error: '未获取到已刷题列表' }))
        flash('未获取到已刷题列表，请稍后重试', 'err')
        return
      }
      setImportState((s) => ({ ...s, phase: 'import', total: slugs.length }))

      const BATCH = 10
      for (let i = 0; i < slugs.length; i += BATCH) {
        const res = await importLeetCodeSolved(slugs.slice(i, i + BATCH))
        const d = res?.data ?? res
        imported += d?.imported ?? 0
        skipped += d?.skipped ?? 0
        failed += d?.failed ?? 0
        setImportState((s) => ({
          ...s,
          done: Math.min(i + BATCH, slugs.length),
          imported,
          skipped,
          failed,
        }))
        if (d?.importedTotal != null) {
          setImportedTotal(Number(d.importedTotal) || 0)
          setSettings((prev) => ({ ...prev, leetcode_imported_count: d.importedTotal }))
        }
      }

      setImportState((s) => ({ ...s, running: false, phase: 'done' }))
      flash(
        failed > 0
          ? `导入完成：新增 ${imported} 题，已存在 ${skipped} 题，失败 ${failed} 题`
          : `导入完成：新增 ${imported} 题，已存在 ${skipped} 题`,
        failed > 0 ? 'err' : 'ok'
      )
    } catch (e) {
      setImportState((s) => ({ ...s, running: false, phase: 'done', error: e.message || '导入失败' }))
      flash(`导入失败：${e.message}`, 'err')
    }
  }

  // 已有 Cookie 时自动拉取账号资料与刷题统计
  useEffect(() => {
    if (settings.leetcode_cookie && !profile) {
      loadProfile()
      loadSolvedStats()
    }
    if (settings.leetcode_cookie && active === 'binding' && !solvedStats && !solvedStatsLoading) {
      loadSolvedStats()
    }
  }, [settings.leetcode_cookie, active])

  // 设置里读取累计导入题数
  useEffect(() => {
    if (settings.leetcode_imported_count != null) {
      setImportedTotal(Number(settings.leetcode_imported_count) || 0)
    }
  }, [settings.leetcode_imported_count])

  useEffect(() => {
    getSettings().then((res) => setSettings(res.data || res)).catch(() => {})
    getAISettings().then((res) => setAi(res.data || res)).catch(() => {})
    listProviders().then((res) => setProviders(res.data?.list || [])).catch(() => {})
  }, [])

  const setKV = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))

  const persist = async (kv, text) => {
    try {
      await updateSettings(kv)
      flash(text)
    } catch (e) {
      flash(`保存失败：${e.message}`, 'err')
    }
  }

  // 监听登录窗口回传的 Cookie 事件（仅 Tauri 环境）
  useEffect(() => {
    if (!isTauri()) return
    let unlisten
    let cancelled = false
    import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlisten = await listen('leetcode-login-result', (event) => {
        if (cancelled) return
        const { success, cookie, message } = event.payload
        if (success && cookie) {
          setSettings((prev) => ({ ...prev, leetcode_cookie: cookie }))
          updateSettings({ leetcode_cookie: cookie })
            .then(() => {
              setLoginState('success')
              flash('LeetCode 登录成功，Cookie 已自动保存')
              loadProfile()
            })
            .catch(() => setLoginState('failed'))
        } else {
          setLoginState('failed')
          flash(message || '登录未完成，请重试', 'err')
        }
      })
    }).catch(() => {})
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const changeRegion = async (e) => {
    const region = e.target.value
    setKV('leetcode_region', region)
    try {
      await updateSettings({ leetcode_region: region })
      flash(`已切换到${REGIONS.find((r) => r.value === region)?.label || region}`)
    } catch (err) {
      flash(`保存区域失败：${err.message}`, 'err')
    }
  }

  const startLeetCodeLogin = async () => {
    setLoginState('logging-in')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // 根据所选区域打开对应站点的登录窗口（cn / com）
      await invoke('open_leetcode_login', { region: settings.leetcode_region || 'cn' })
    } catch (e) {
      setLoginState('failed')
      flash(`打开登录窗口失败: ${e}`, 'err')
    }
  }

  const cancelLeetCodeLogin = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('close_leetcode_login')
    } catch {}
    setLoginState('idle')
  }

  // 测试连接：用当前 Cookie 实际抓取一道题（two-sum，幂等）
  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetchLeetCodeProblem({ titleSlug: 'two-sum' })
      const title = res?.data?.title || res?.data?.translatedTitle
      setTestResult({ ok: true, text: `连接成功，已验证抓取「${title || '两数之和'}」` })
    } catch (e) {
      setTestResult({ ok: false, text: `连接失败：${e.message}` })
    } finally {
      setTesting(false)
    }
  }

  const loadCacheInfo = async () => {
    try {
      const res = await get('/api/v1/leetcode/cache/stats')
      setCacheInfo(res?.data || null)
      flash('缓存统计已刷新')
    } catch (e) {
      flash(`读取缓存统计失败：${e.message}`, 'err')
    }
  }

  const clearCache = async () => {
    setClearing(true)
    try {
      await post('/api/v1/leetcode/cache/clear')
      setCacheInfo(null)
      flash('题目缓存已清除')
    } catch (e) {
      flash(`清除缓存失败：${e.message}`, 'err')
    } finally {
      setClearing(false)
    }
  }

  const saveAI = async () => {
    try {
      await updateAISettings(ai)
      flash('AI 设置已保存')
    } catch (e) {
      flash(`保存失败：${e.message}`, 'err')
    }
  }

  const hasCookie = Boolean(settings.leetcode_cookie)
  const connected = hasCookie

  const badge = connected
    ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />已连接</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />未配置</span>

  return (
    <div className="flex h-full bg-white">
      {/* 左侧设置导航 */}
      <aside className="w-56 shrink-0 border-r border-slate-100 bg-white p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">设置</h1>
        <p className="mt-1 mb-6 text-xs text-slate-400">管理账户与刷题偏好</p>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                active === item.id
                  ? 'border border-slate-100 bg-white text-primary-700 shadow-card'
                  : 'border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 右侧内容 */}
      <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50/40 p-8 md:px-10">
        <div key={active} className="space-y-8 animate-in fade-in duration-300">
          {msg && (
            <p className={`text-xs font-medium ${msgType === 'err' ? 'text-rose-600' : 'text-primary-700'}`}>
              {msg}
            </p>
          )}

          {/* 账号绑定（含个人资料） */}
          {active === 'binding' && (
            <section className="space-y-5">
              <SectionHeader
                title="账号绑定"
                badge={badge}
                desc="绑定 LeetCode 账号：自动拉取头像昵称、提交记录与已同步代码，数据仅保存在本地"
              />
            <Card
              icon={ShieldCheck}
              iconBg="bg-primary-600"
              title="LeetCode 同步设置"
              desc="点击「一键登录」在弹窗中登录后自动抓取 Cookie 与账号信息；也可以手动更换 Cookie。"
              footer={
                <>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <RefreshCw size={14} />
                    {cacheInfo
                      ? `缓存 ${cacheInfo.count ?? 0} 条 · 命中率 ${cacheInfo.hit_rate ?? '—'}`
                      : 'Cookie 仅用于本地拉取数据，不会上传任何云端服务器'}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={loadCacheInfo}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                    >
                      刷新缓存统计
                    </button>
                    <button
                      type="button"
                      onClick={clearCache}
                      disabled={clearing}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                    >
                      {clearing ? '清除中…' : '清除缓存'}
                    </button>
                  </div>
                </>
              }
            >
              {/* 账号信息卡片：登录后自动展示头像 / 昵称 */}
              <div className="mb-4 flex items-center gap-4 rounded-xl bg-slate-50/80 p-5">
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt="头像"
                    className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-400">
                    <UserRound size={24} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {profile?.realName || profile?.username || (hasCookie ? '已绑定账号' : '未绑定账号')}
                    </span>
                    {connected && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        已连接
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {profile?.username
                      ? `@${profile.username}`
                      : profileLoading
                        ? '正在获取账号信息…'
                        : profileError
                          ? profileError
                          : hasCookie
                            ? '账号信息加载失败，可点击「刷新账号信息」重试'
                            : '等待绑定 LeetCode 账号'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadProfile}
                  disabled={profileLoading || !hasCookie}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                >
                  {profileLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  刷新账号信息
                </button>
              </div>

              <div className="space-y-4 rounded-xl bg-slate-50/80 p-5">
                {isTauri() && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">账号区域</span>
                      <select
                        value={settings.leetcode_region || 'cn'}
                        onChange={changeRegion}
                        disabled={loginState === 'logging-in'}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-50"
                      >
                        {REGIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={startLeetCodeLogin}
                      disabled={loginState === 'logging-in'}
                      className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
                    >
                      {loginState === 'logging-in' && <Loader2 size={14} className="animate-spin" />}
                      {loginState === 'logging-in' ? '等待登录…' : '一键登录 LeetCode'}
                    </button>
                    {loginState === 'logging-in' && (
                      <button
                        type="button"
                        onClick={cancelLeetCodeLogin}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        取消
                      </button>
                    )}
                    {loginState === 'success' && <span className="text-xs text-primary-700">✓ 已登录</span>}
                    {loginState === 'failed' && <span className="text-xs text-rose-500">登录失败，请重试</span>}
                  </div>
                )}

                {/* Cookie 默认隐藏，点击「更换 Cookie」后展开 */}
                {cookieEditing ? (
                  <>
                    <Field label="Session Cookie (LEETCODE_SESSION)">
                      <textarea
                        rows={3}
                        value={settings.leetcode_cookie || ''}
                        onChange={(e) => setKV('leetcode_cookie', e.target.value)}
                        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-50"
                        placeholder="LEETCODE_SESSION=...; csrftoken=..."
                      />
                    </Field>
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <ShieldCheck size={12} />
                      您的 Cookie 仅用于本地拉取数据，我们不会上传至任何云端服务器。
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="text-xs">
                        {testResult && (
                          <span className={testResult.ok ? 'font-medium text-primary-700' : 'font-medium text-rose-600'}>
                            {testResult.ok ? '✓ ' : '✕ '}
                            {testResult.text}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={testConnection}
                          disabled={testing}
                          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                        >
                          {testing && <Loader2 size={14} className="animate-spin" />}
                          测试连接
                        </button>
                        <button
                          type="button"
                          onClick={() => persist({ leetcode_cookie: settings.leetcode_cookie || '' }, 'Cookie 已保存')}
                          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                        >
                          更新授权
                        </button>
                        <button
                          type="button"
                          onClick={() => setCookieEditing(false)}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
                        >
                          收起
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <KeyRound size={14} />
                      {hasCookie ? '已配置登录凭证（默认隐藏）' : '尚未配置登录凭证'}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCookieEditing(true)}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                    >
                      <KeyRound size={14} />
                      更换 Cookie
                    </button>
                  </div>
                 )}
               </div>
             </Card>

             {/* 刷题统计与一键导入 */}
             <Card
               icon={BarChart3}
               iconBg="bg-amber-500"
               title="刷题统计"
               desc="实时获取当前 LeetCode 账号的刷题进度与难度分布，并支持一键导入已刷题到本地题库。"
               footer={
                 <>
                   <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                     <DownloadCloud size={14} />
                     {importedTotal != null
                       ? `已从 LeetCode 导入 ${importedTotal} 题到本地题库`
                       : '导入的题目会保存到本地题库，可离线浏览与复习'}
                   </div>
                   <div className="flex items-center gap-3">
                     <button
                       type="button"
                       onClick={loadSolvedStats}
                       disabled={solvedStatsLoading || !hasCookie || importState?.running}
                       className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                     >
                       {solvedStatsLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                       刷新统计
                     </button>
                     <button
                       type="button"
                       onClick={runSolvedImport}
                       disabled={!hasCookie || importState?.running}
                       className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
                     >
                       {importState?.running
                         ? <Loader2 size={14} className="animate-spin" />
                         : <DownloadCloud size={14} />}
                       {importState?.running ? '导入中…' : '一键导入已刷题到题库'}
                     </button>
                   </div>
                 </>
               }
             >
               {!hasCookie ? (
                 <div className="rounded-xl bg-slate-50/80 p-5 text-xs text-slate-400">
                   绑定 LeetCode 账号后即可查看刷题统计与导入已刷题。
                 </div>
               ) : (
                 <div className="space-y-5">
                   {solvedStatsError && !statSummary && (
                     <div className="rounded-xl bg-rose-50/60 p-4 text-xs font-medium text-rose-600">
                       {solvedStatsError}
                       <button type="button" onClick={loadSolvedStats} className="ml-2 underline underline-offset-2">
                         重试
                       </button>
                     </div>
                   )}

                   {statSummary && (
                     <>
                       {/* 概览数字 */}
                       <div className="grid grid-cols-3 gap-3">
                         {[
                           { label: '已刷题数', value: statSummary.solved, accent: 'text-emerald-600' },
                           { label: '剩余题数', value: statSummary.untouched, accent: 'text-slate-700' },
                           { label: '尝试失败', value: statSummary.failed, accent: 'text-amber-600' },
                         ].map((item) => (
                           <div key={item.label} className="rounded-xl bg-slate-50/80 p-4 text-center">
                             <p className={`text-2xl font-bold tabular-nums ${item.accent}`}>{item.value}</p>
                             <p className="mt-0.5 text-xs text-slate-400">{item.label}</p>
                           </div>
                         ))}
                       </div>

                       {/* 难度分布 */}
                       <div className="space-y-3 rounded-xl bg-slate-50/80 p-4">
                         <p className="text-xs font-medium text-slate-500">难度分布（已刷 / 总题量）</p>
                         {statSummary.byDifficulty.map((d) => {
                           const pct = d.total > 0 ? Math.min(100, Math.round((d.solved / d.total) * 100)) : 0
                           return (
                             <div key={d.key} className="space-y-1.5">
                               <div className="flex items-center justify-between text-xs">
                                 <span className="font-medium text-slate-600">{d.label}</span>
                                 <span className="tabular-nums text-slate-400">
                                   已刷 <span className={`font-semibold ${d.text}`}>{d.solved}</span> / {d.total}（{pct}%）
                                 </span>
                               </div>
                               <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                                 <div
                                   className={`h-full rounded-full transition-all duration-500 ${d.bar}`}
                                   style={{ width: `${pct}%` }}
                                 />
                               </div>
                             </div>
                           )
                         })}
                       </div>
                     </>
                   )}

                   {solvedStatsLoading && !statSummary && (
                     <div className="flex items-center gap-2 rounded-xl bg-slate-50/80 p-4 text-xs text-slate-400">
                       <Loader2 size={14} className="animate-spin" />
                       正在从 LeetCode 拉取刷题统计…
                     </div>
                   )}

                   {/* 导入进度条 */}
                   {importState && (
                     <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                       {importState.phase === 'list' && (
                         <div className="flex items-center gap-2 text-xs text-slate-500">
                           <Loader2 size={14} className="animate-spin" />
                           正在获取已刷题列表…
                         </div>
                       )}
                       {importState.phase === 'import' && (
                         <>
                           <div className="flex items-center justify-between text-xs">
                             <span className="font-medium text-slate-600">
                               从 LeetCode 导入中（{importState.done} / {importState.total}）
                             </span>
                             <span className="tabular-nums text-slate-400">
                               新增 {importState.imported} · 已存在 {importState.skipped}
                               {importState.failed > 0 ? ` · 失败 ${importState.failed}` : ''}
                             </span>
                           </div>
                           <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                             <div
                               className="h-full rounded-full bg-primary-500 transition-all duration-300"
                               style={{
                                 width: `${importState.total > 0 ? Math.round((importState.done / importState.total) * 100) : 0}%`,
                               }}
                             />
                           </div>
                         </>
                       )}
                       {importState.phase === 'done' && (
                         <div className="flex items-center gap-2 text-xs">
                           {importState.error ? (
                             <>
                               <span className="font-medium text-rose-600">✕ 导入失败：{importState.error}</span>
                             </>
                           ) : (
                             <span className="font-medium text-primary-700">
                               ✓ 导入完成：新增 {importState.imported} 题，已存在 {importState.skipped} 题
                               {importState.failed > 0 ? `，失败 ${importState.failed} 题` : ''}
                             </span>
                           )}
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               )}
             </Card>
             </section>
           )}

          {/* AI 助手 */}
          {active === 'ai' && ai && (
            <section className="space-y-5">
              <SectionHeader title="AI 助手" desc="为题目解析、笔记润色等功能提供模型配置" />
              <Card
                icon={Sparkles}
                iconBg="bg-violet-500"
                title="AI Provider"
                footer={
                  <div className="flex w-full justify-end">
                    <button
                      type="button"
                      onClick={saveAI}
                      className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                    >
                      保存
                    </button>
                  </div>
                }
              >
                <div className="space-y-4">
                  <Field label="默认 Provider">
                    <select
                      value={ai.defaultProvider}
                      onChange={(e) => setAi({ ...ai, defaultProvider: e.target.value })}
                      className={inputCls}
                    >
                      {providers.map((p) => (
                        <option key={p.name} value={p.name}>{p.label}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-3">
                    <div className="sm:col-span-3 text-xs font-medium text-slate-600">OpenAI 兼容（含 DeepSeek / Ollama 等）</div>
                    <input className={inputCls} placeholder="API Key" value={ai.openai?.apiKey || ''}
                      onChange={(e) => setAi({ ...ai, openai: { ...ai.openai, apiKey: e.target.value } })} />
                    <input className={inputCls} placeholder="Base URL（可选）" value={ai.openai?.baseURL || ''}
                      onChange={(e) => setAi({ ...ai, openai: { ...ai.openai, baseURL: e.target.value } })} />
                    <input className={inputCls} placeholder="模型" value={ai.openai?.model || ''}
                      onChange={(e) => setAi({ ...ai, openai: { ...ai.openai, model: e.target.value } })} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-3">
                    <div className="sm:col-span-3 text-xs font-medium text-slate-600">Anthropic Claude</div>
                    <input className={inputCls} placeholder="API Key" value={ai.anthropic?.apiKey || ''}
                      onChange={(e) => setAi({ ...ai, anthropic: { ...ai.anthropic, apiKey: e.target.value } })} />
                    <input className={inputCls} placeholder="Base URL（可选）" value={ai.anthropic?.baseURL || ''}
                      onChange={(e) => setAi({ ...ai, anthropic: { ...ai.anthropic, baseURL: e.target.value } })} />
                    <input className={inputCls} placeholder="模型" value={ai.anthropic?.model || ''}
                      onChange={(e) => setAi({ ...ai, anthropic: { ...ai.anthropic, model: e.target.value } })} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-3">
                    <div className="sm:col-span-3 text-xs font-medium text-slate-600">本地 CLI（如 claude）</div>
                    <input className={inputCls} placeholder="命令" value={ai.cli?.command || ''}
                      onChange={(e) => setAi({ ...ai, cli: { ...ai.cli, command: e.target.value } })} />
                    <input className={inputCls} placeholder="参数（空格分隔）" value={(ai.cli?.args || []).join(' ')}
                      onChange={(e) => setAi({ ...ai, cli: { ...ai.cli, args: e.target.value.split(' ').filter(Boolean) } })} />
                    <input className={inputCls} placeholder="模型（可选）" value={ai.cli?.model || ''}
                      onChange={(e) => setAi({ ...ai, cli: { ...ai.cli, model: e.target.value } })} />
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* 复习偏好 */}
          {active === 'review' && (
            <section className="space-y-5">
              <SectionHeader title="复习偏好" desc="影响复习随机抽题、热力图展示等行为" />
            <Card
              icon={GraduationCap}
              iconBg="bg-emerald-500"
              title="复习与热力图"
              footer={
                <div className="flex w-full justify-end">
                  <button
                    type="button"
                    onClick={() => persist(
                      {
                        default_language: settings.default_language || 'Python 3',
                        daily_review_target: settings.daily_review_target || '3',
                        heatmap_peak: settings.heatmap_peak || '4',
                      },
                      '复习偏好已保存'
                    )}
                    className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                  >
                    保存
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="默认目标语言" hint="在题目列表中优先显示该语言的提交记录">
                  <select
                    value={settings.default_language || 'Python 3'}
                    onChange={(e) => setKV('default_language', e.target.value)}
                    className={inputCls}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="每日复习目标 (题)" hint="决定热力图达到最深颜色的阈值">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.daily_review_target || '3'}
                    onChange={(e) => setKV('daily_review_target', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </Card>
            </section>
          )}

          {/* 外观显示 */}
          {active === 'appearance' && (
            <section className="space-y-5">
              <SectionHeader title="外观显示" desc="题库列表的分页与信息密度" />
            <Card
              icon={SlidersHorizontal}
              iconBg="bg-slate-700"
              title="列表与信息"
              footer={
                <div className="flex w-full justify-end">
                  <button
                    type="button"
                    onClick={() => persist(
                      {
                        page_size: String(Math.min(100, Math.max(8, Number(settings.page_size) || 16))),
                        show_pass_rate: settings.show_pass_rate === 'true' ? 'true' : 'false',
                      },
                      '显示设置已保存'
                    )}
                    className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                  >
                    保存
                  </button>
                </div>
              }
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="列表每页条数" hint="题库列表分页大小（8 - 100，默认 16）">
                    <input
                      type="number"
                      min="8"
                      max="100"
                      value={settings.page_size || '16'}
                      onChange={(e) => setKV('page_size', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="显示通过率" hint="在题库列表中展示官方通过率列">
                    <select
                      value={settings.show_pass_rate || 'true'}
                      onChange={(e) => setKV('show_pass_rate', e.target.value)}
                      className={inputCls}
                    >
                      <option value="true">显示</option>
                      <option value="false">隐藏</option>
                    </select>
                  </Field>
                </div>
              </div>
            </Card>
            </section>
          )}

          {/* 插件同步 */}
          {active === 'plugin' && (
            <section className="space-y-5">
              <SectionHeader
                title="插件同步"
                desc="通过油猴脚本在 LeetCode 题目页直接读取 / 写入本应用的题目笔记，实现数据双向同步"
              />
              <Card
                icon={Puzzle}
                iconBg="bg-amber-500"
                title="Tampermonkey 油猴脚本"
                desc="安装脚本后，在 leetcode.cn 题目页面会出现「笔记」按钮，数据将与本应用后台同步"
              >
                <div className="space-y-4">
                  {/* 后台服务地址 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">当前后台服务地址</p>
                      <p className="mt-1 truncate font-mono text-sm text-slate-900">{serverHost || '获取中…'}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      运行中
                    </span>
                  </div>

                  {/* 配置步骤 */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="mb-3 text-xs font-medium text-slate-600">配置步骤</p>
                    <ol className="space-y-2.5 text-xs leading-relaxed text-slate-500">
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">1</span>
                        在浏览器安装 Tampermonkey 扩展（Chrome / Edge / Firefox 均支持）
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">2</span>
                        点击下方「一键复制脚本」，脚本中的 API_HOST 已自动替换为当前后台地址 <span className="font-mono text-slate-700">{serverHost}</span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">3</span>
                        打开 Tampermonkey 管理面板 → 新建脚本 → 粘贴并保存（或拖入 .user.js 文件安装）
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">4</span>
                        访问任意 leetcode.cn 题目页面，右侧会出现「笔记」按钮，打开即可与本应用同步笔记数据
                      </li>
                    </ol>
                  </div>

                  {/* 一键复制 */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <ShieldCheck size={12} />
                      复制时已自动将脚本内 API_HOST 替换为当前后台地址，@match 替换为「账号绑定」中选择的站点（{pluginRegion === 'com' ? 'leetcode.com 国际站' : 'leetcode.cn 国内站'}），无需手动修改
                    </p>
                    <button
                      type="button"
                      onClick={copyPluginScript}
                      disabled={!serverHost}
                      className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? '已复制到剪贴板' : '一键复制脚本'}
                    </button>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* 关于 */}
          {active === 'about' && (
            <section className="space-y-5">
              <SectionHeader title="关于" />
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-700 text-lg font-bold text-white">
                    L
                  </span>
                  <div>
                    <p className="text-base font-semibold text-slate-900">LeetCode 刷题笔记</p>
                    <p className="text-xs text-slate-400">v0.1.0 · Tauri + React + Go (Gin) + SQLite</p>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  本地优先的 LeetCode 刷题与复习管理工具：题库同步、间隔复习、复习热力图、AI 笔记助手与油猴脚本联动，数据全部保存在本地。
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
