import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  Plus,
  Pencil,
  Trash2,
  Terminal,
  Brain,
  Star,
  Gauge,
  X,
} from 'lucide-react'
import { getSettings, updateSettings, fetchLeetCodeProblem, getLeetCodeUserProfile, getLeetCodeSolvedStats, getLeetCodeSolvedList, importLeetCodeSolved } from '../api/leetcode'
import {
  listAssistants,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  setDefaultAssistant,
  toggleAssistant,
  toggleModel,
  listCLIModels,
  testAssistant,
} from '../api/ai'
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

// ============ AI 助手相关组件 ============

const TYPE_META = {
  openai: { label: 'API · OpenAI 兼容', icon: Sparkles, iconBg: 'bg-violet-500', hint: 'DeepSeek / Ollama / SiliconFlow 等 OpenAI 协议服务' },
  anthropic: { label: 'API · Anthropic Claude', icon: Brain, iconBg: 'bg-orange-500', hint: 'Claude 系列官方 API 或中转服务' },
  cli: { label: '本地 CLI', icon: Terminal, iconBg: 'bg-slate-600', hint: '本地命令行工具，已内置适配' },
}

// 已内置适配的本地 CLI：后端按类型单独组装参数并解析输出（codex JSONL / claude stream-json）
const CLI_PRESETS = [
  {
    kind: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    desc: 'OpenAI Codex，自动追加 exec --json 并解析流式结果',
    preview: 'codex exec --json --skip-git-repo-check [--model <模型>] "<提示词>"',
  },
  {
    kind: 'claude',
    label: 'Claude Code',
    command: 'claude',
    desc: 'Anthropic Claude Code，自动追加 -p stream-json 并解析流式结果',
    preview: 'claude -p --output-format stream-json --verbose [--model <模型>] "<提示词>"',
  },
  {
    kind: 'generic',
    label: '自定义命令',
    command: '',
    desc: '手动指定命令与参数，提示词经 stdin 传入',
    preview: '',
  },
]

const cliPresetOf = (a) => CLI_PRESETS.find((p) => p.kind === a?.cliKind)

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function AssistantCard({ assistant: a, isDefault, onEdit, onDelete, onMakeDefault, onToggle, onToggleModel, onTest, testState }) {
  const meta = TYPE_META[a.type] || TYPE_META.openai
  const Icon = meta.icon
  const enabledModels = (a.models || []).filter((m) => m.enabled).length
  const preset = cliPresetOf(a)
  const metaLine = a.type === 'cli'
    ? preset && preset.kind !== 'generic'
      ? `${preset.label} · ${preset.command}`
      : `${a.command}${(a.args || []).length ? ' ' + a.args.join(' ') : ''}`
    : a.baseURL || '官方默认地址'

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-card transition-all ${a.enabled ? 'border-slate-200/80' : 'border-slate-100 opacity-75'}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${meta.iconBg}`}>
          <Icon size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{a.name}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {meta.label}
            </span>
            {isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                <Star size={10} className="fill-amber-500 text-amber-500" />
                默认
              </span>
            )}
            {!a.enabled && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                已停用
              </span>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-slate-400">{metaLine}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {meta.hint} · 启用模型 {enabledModels} / {(a.models || []).length}
          </p>

          {/* 测速结果 */}
          {testState?.result && (
            <p className={`mt-0.5 text-[11px] font-medium ${testState.result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {testState.result.ok
                ? `✓ 连通正常 ${testState.result.latencyMs}ms · ${testState.result.model}`
                : `✕ 连通失败：${testState.result.error}`}
            </p>
          )}

          {/* 模型列表（点击可启用 / 停用） */}
          {(a.models || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggleModel(m)}
                  title={m.enabled ? '点击停用该模型' : '点击启用该模型'}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all active:scale-95 ${
                    m.enabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${m.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {m.id}
                </button>
              ))}
            </div>
          )}
          {(a.models || []).length === 0 && (
            <p className="mt-3 text-[11px] text-amber-600">尚未配置模型，点击「编辑」添加</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Toggle checked={a.enabled} onChange={onToggle} />
          {!isDefault && (
            <button
              type="button"
              onClick={onMakeDefault}
              title="设为默认助手"
              className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-amber-50 hover:text-amber-500"
            >
              <Star size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onTest}
            disabled={testState?.loading}
            title="连通测速（默认用第一个启用模型）"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 disabled:opacity-60"
          >
            {testState?.loading ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />}
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="编辑"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="删除"
            className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function AssistantEditor({ initial, onSave, onClose }) {
  const isEdit = Boolean(initial?.id)
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...initial,
          apiKey: initial.apiKey || '',
          cliKind: initial.cliKind || CLI_PRESETS.find((p) => p.command === initial.command)?.kind || 'generic',
          argsText: (initial.args || []).join(' '),
          models: (initial.models || []).map((m) => ({ ...m })),
        }
      : {
          name: '',
          type: 'openai',
          apiKey: '',
          baseURL: '',
          cliKind: 'codex',
          command: 'codex',
          argsText: '',
          models: [],
        }
  )
  const [saving, setSaving] = useState(false)
  const [cliModelsLoading, setCliModelsLoading] = useState(false)

  const isCli = form.type === 'cli'
  const cliPreset = CLI_PRESETS.find((p) => p.kind === form.cliKind)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const addModel = () => set({ models: [...form.models, { id: '', enabled: true }] })
  const updateModel = (i, patch) =>
    set({ models: form.models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) })
  const removeModel = (i) => set({ models: form.models.filter((_, idx) => idx !== i) })

  // 从 CLI 本地配置自动发现模型（codex 读 ~/.codex/config.toml，claude 读 settings.json）
  const loadCLIModels = async () => {
    if (!isCli || form.cliKind === 'generic' || cliModelsLoading) return
    setCliModelsLoading(true)
    try {
      const res = await listCLIModels(form.cliKind)
      const found = (res?.data?.models || res?.models || []).map((m) =>
        typeof m === 'string' ? { id: m, enabled: true } : { id: m.id, enabled: true }
      )
      if (!found.length) {
        alert('未从本地 CLI 配置中发现模型，请手动添加')
        return
      }
      // 合并：保留已配置模型（含启停状态），追加新发现的
      setForm((f) => {
        const existing = new Set(f.models.map((m) => m.id))
        return { ...f, models: [...f.models, ...found.filter((m) => !existing.has(m.id))] }
      })
    } catch (e) {
      alert(`读取 CLI 模型失败：${e.message}`)
    } finally {
      setCliModelsLoading(false)
    }
  }

  const submit = async () => {
    if (!form.name.trim()) return alert('请填写助手名称')
    if (isCli && form.cliKind === 'generic' && !form.command.trim()) return alert('请填写 CLI 命令')
    setSaving(true)
    try {
      await onSave({
        id: form.id,
        name: form.name.trim(),
        type: form.type,
        enabled: isEdit ? form.enabled !== false : true,
        apiKey: form.apiKey || '',
        baseURL: form.baseURL || '',
        cliKind: isCli ? form.cliKind : '',
        command: isCli ? (form.command.trim() || cliPreset?.command || '') : '',
        args: isCli && form.cliKind === 'generic' ? form.argsText.split(' ').filter(Boolean) : [],
        models: form.models
          .map((m) => ({ id: String(m.id || '').trim(), enabled: m.enabled !== false }))
          .filter((m) => m.id),
      })
    } finally {
      setSaving(false)
    }
  }

  // 挂载到 body，避免被页面内 animate-in 等祖先的 stacking context 困住，
  // 同时 z-[60] 盖过顶部 macOS 拖拽条，消除遮罩顶部的留白
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">{isEdit ? '编辑 AI 助手' : '新增 AI 助手'}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <Field label="助手名称">
            <input
              className={inputCls}
              placeholder="如 DeepSeek / 公司中转 / 本地 claude"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>

          {/* 接入方式 */}
          <Field label="接入方式" hint={isCli ? '通过本地命令行工具调用，无需 API Key' : '通过 HTTP API 调用，支持 OpenAI 兼容协议与 Anthropic'}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'openai', label: 'API 接入', icon: Sparkles, desc: 'OpenAI 兼容 / Claude' },
                { value: 'cli', label: '本地 CLI', icon: Terminal, desc: 'Codex / Claude Code' },
              ].map((opt) => {
                const selected = isCli ? opt.value === 'cli' : opt.value === 'openai'
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ type: opt.value })}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-primary-400 bg-primary-50/60 ring-1 ring-primary-100'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${selected ? 'text-primary-700' : 'text-slate-600'}`}>
                      <opt.icon size={14} />
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-slate-400">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          {!isCli && (
            <>
              <Field label="Provider 类型">
                <select
                  className={inputCls}
                  value={form.type === 'cli' ? 'openai' : form.type}
                  onChange={(e) => set({ type: e.target.value })}
                >
                  <option value="openai">OpenAI 兼容（DeepSeek / Ollama 等）</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="API Key">
                  <input
                    className={inputCls}
                    type="text"
                    placeholder="sk-..."
                    value={form.apiKey}
                    onChange={(e) => set({ apiKey: e.target.value })}
                  />
                </Field>
                <Field label="Base URL（可选）" hint="留空使用官方默认地址">
                  <input
                    className={inputCls}
                    placeholder="https://api.deepseek.com/v1"
                    value={form.baseURL}
                    onChange={(e) => set({ baseURL: e.target.value })}
                  />
                </Field>
              </div>
            </>
          )}

          {isCli && (
            <div className="space-y-4">
              <Field label="CLI 类型" hint="已内置适配的命令行工具，参数与输出解析由应用自动处理">
                <select
                  className={inputCls}
                  value={form.cliKind}
                  onChange={(e) => {
                    const preset = CLI_PRESETS.find((p) => p.kind === e.target.value)
                    set({ cliKind: e.target.value, command: preset.command || '', argsText: '' })
                  }}
                >
                  {CLI_PRESETS.map((p) => (
                    <option key={p.kind} value={p.kind}>
                      {p.label} — {p.desc}
                    </option>
                  ))}
                </select>
              </Field>
              {form.cliKind === 'generic' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="命令">
                    <input
                      className={inputCls}
                      placeholder="如 ollama"
                      value={form.command}
                      onChange={(e) => set({ command: e.target.value })}
                    />
                  </Field>
                  <Field label="参数（空格分隔）" hint="提示词通过 stdin 传入，逐行输出作为回复">
                    <input
                      className={inputCls}
                      placeholder="--verbose"
                      value={form.argsText}
                      onChange={(e) => set({ argsText: e.target.value })}
                    />
                  </Field>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50/80 px-4 py-3">
                  <p className="text-[11px] font-medium text-slate-500">实际执行命令（模型参数按需自动附加）</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-400">{cliPreset.preview}</p>
                </div>
              )}
            </div>
          )}

          {/* 模型管理 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">模型列表</label>
              <div className="flex items-center gap-3">
                {isCli && form.cliKind !== 'generic' && (
                  <button
                    type="button"
                    onClick={loadCLIModels}
                    disabled={cliModelsLoading}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-60"
                  >
                    {cliModelsLoading ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
                    自动读取模型
                  </button>
                )}
                <button
                  type="button"
                  onClick={addModel}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  <Plus size={13} />
                  添加模型
                </button>
              </div>
            </div>
            {isCli && form.cliKind !== 'generic' && (
              <p className={hintCls}>可从本地 CLI 配置自动读取（codex 读 ~/.codex/config.toml，claude 读 ~/.claude/settings.json）</p>
            )}
            {form.models.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-center text-[11px] text-slate-400">
                还没有模型，点击「添加模型」
              </p>
            )}
            {form.models.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Toggle checked={m.enabled !== false} onChange={() => updateModel(i, { enabled: m.enabled === false })} />
                <input
                  className={inputCls}
                  placeholder="模型 ID，如 gpt-4o-mini"
                  value={m.id}
                  onChange={(e) => updateModel(i, { id: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeModel(i)}
                  className="shrink-0 rounded-lg p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {form.models.length > 0 && (
              <p className={hintCls}>开关控制模型的启用 / 停用，停用后对话下拉中不可选</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? '保存修改' : '创建助手'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const LANGUAGES = ['Python 3', 'Java', 'C++', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'C#']
const REGIONS = [
  { value: 'cn', label: '力扣中国 (leetcode.cn)' },
  { value: 'com', label: '国际站 (leetcode.com)' },
]

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [assistants, setAssistants] = useState([])
  const [aiDefault, setAiDefault] = useState('')
  const [assistantEditor, setAssistantEditor] = useState(null) // null | {data} 编辑现有 | {data:null} 新增
  const [testStates, setTestStates] = useState({}) // id -> { loading, result }
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
    loadAssistants()
  }, [])

  const loadAssistants = async () => {
    try {
      const res = await listAssistants()
      const d = res?.data ?? res
      setAssistants(d?.list || [])
      setAiDefault(d?.default || '')
    } catch (e) {
      flash(`加载 AI 助手失败：${e.message}`, 'err')
    }
  }

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

  // AI 助手操作
  const saveAssistant = async (config) => {
    try {
      if (config.id) {
        await updateAssistant(config.id, config)
        flash('AI 助手已更新')
      } else {
        await createAssistant(config)
        flash('AI 助手已创建')
      }
      setAssistantEditor(null)
      loadAssistants()
    } catch (e) {
      flash(`保存失败：${e.message}`, 'err')
    }
  }

  const removeAssistant = async (a) => {
    if (!window.confirm(`确定删除 AI 助手「${a.name}」吗？`)) return
    try {
      await deleteAssistant(a.id)
      flash('AI 助手已删除')
      loadAssistants()
    } catch (e) {
      flash(`删除失败：${e.message}`, 'err')
    }
  }

  const makeDefault = async (a) => {
    try {
      await setDefaultAssistant(a.id)
      flash(`已将「${a.name}」设为默认助手`)
      loadAssistants()
    } catch (e) {
      flash(`设置失败：${e.message}`, 'err')
    }
  }

  const switchAssistant = async (a) => {
    try {
      await toggleAssistant(a.id, !a.enabled)
      loadAssistants()
    } catch (e) {
      flash(`操作失败：${e.message}`, 'err')
    }
  }

  const switchModel = async (a, model) => {
    try {
      await toggleModel(a.id, model.id, !model.enabled)
      loadAssistants()
    } catch (e) {
      flash(`操作失败：${e.message}`, 'err')
    }
  }

  // 连通测速：后端用第一个启用模型发一条最小消息，返回耗时
  const testAssistantConn = async (a) => {
    if (testStates[a.id]?.loading) return
    setTestStates((s) => ({ ...s, [a.id]: { loading: true } }))
    try {
      const res = await testAssistant(a.id)
      const d = res?.data ?? res
      setTestStates((s) => ({ ...s, [a.id]: { loading: false, result: d } }))
    } catch (e) {
      setTestStates((s) => ({ ...s, [a.id]: { loading: false, result: { ok: false, error: e.message } } }))
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
          {active === 'ai' && (
            <section className="space-y-5">
              <SectionHeader
                title="AI 助手"
                desc="可添加多个 AI 助手：自定义 API 接入或使用本地 CLI 工具，每个助手下可管理多个模型并独立启用 / 停用"
                badge={
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                    共 {assistants.length} 个助手
                  </span>
                }
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAssistantEditor({ data: null })}
                  className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                >
                  <Plus size={15} />
                  新增 AI 助手
                </button>
              </div>

              {/* 助手列表 */}
              {assistants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center">
                  <Sparkles size={28} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">还没有 AI 助手</p>
                  <p className="mt-1 text-xs text-slate-400">点击右上角「新增 AI 助手」接入 OpenAI 兼容 API、Claude 或本地 CLI</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {assistants.map((a) => (
                    <AssistantCard
                      key={a.id}
                      assistant={a}
                      isDefault={a.id === aiDefault}
                      onEdit={() => setAssistantEditor({ data: a })}
                      onDelete={() => removeAssistant(a)}
                      onMakeDefault={() => makeDefault(a)}
                      onToggle={() => switchAssistant(a)}
                      onToggleModel={(m) => switchModel(a, m)}
                      onTest={() => testAssistantConn(a)}
                      testState={testStates[a.id]}
                    />
                  ))}
                </div>
              )}

              {/* 新增 / 编辑抽屉 */}
              {assistantEditor && (
                <AssistantEditor
                  initial={assistantEditor.data}
                  onSave={saveAssistant}
                  onClose={() => setAssistantEditor(null)}
                />
              )}
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
