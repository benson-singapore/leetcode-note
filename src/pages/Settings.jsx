import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  ChevronUp,
  ChevronDown,
  BookOpenCheck,
  BrainCircuit,
  CalendarDays,
  Database,
  Globe,
  LogOut,
} from 'lucide-react'
import packageJson from '../../package.json'
import { useI18n } from '../i18n'
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
  getDefaultChain,
  updateDefaultChain,
} from '../api/ai'
import { get, post, isTauri, resolveBase } from '../api/client'
import pluginScriptRaw from '../../tamper-monkey/leetcode-note-drawer.user.js?raw'

const NAV = [
  { id: 'binding', label: '账号绑定', icon: Link2 },
  { id: 'ai', label: 'AI 助手', icon: Sparkles },
  { id: 'general', label: '通用设置', icon: SlidersHorizontal },
  { id: 'plugin', label: '插件同步', icon: Puzzle },
  { id: 'about', label: '关于', icon: Info },
]


const inputCls =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-50'

const labelCls = 'mb-1.5 block text-xs font-medium text-slate-500'
const hintCls = 'mt-1.5 text-[11px] font-normal text-slate-400'
const APP_VERSION = packageJson.version

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

// DefaultChainSection 系统默认模型链配置（failover）
// 链上第一个为系统默认模型；请求失败自动切换下一个，失败模型进入冷却期后恢复
function DefaultChainSection({ assistants }) {
  const { t } = useI18n()
  const [chain, setChain] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [cooldownMinutes, setCooldownMinutes] = useState(10)

  useEffect(() => {
    getDefaultChain()
      .then((res) => {
        const d = res?.data ?? res
        setChain(Array.isArray(d?.chain) ? d.chain : [])
        if (d?.cooldownMinutes) setCooldownMinutes(d.cooldownMinutes)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 可用供应商：已启用的助手
  const enabledAssistants = assistants.filter((a) => a.enabled)

  const modelsOf = (assistantId) => {
    const a = enabledAssistants.find((x) => x.id === assistantId)
    return (a?.models || []).filter((m) => m.id)
  }

  const firstEnabledAssistant = enabledAssistants[0]

  const addEntry = () => {
    if (!firstEnabledAssistant) return
    const model = modelsOf(firstEnabledAssistant.id)[0]?.id || ''
    setChain((c) => [...c, { assistantId: firstEnabledAssistant.id, model }])
    setDirty(true)
  }

  const updateEntry = (idx, patch) => {
    setChain((c) =>
      c.map((e, i) => {
        if (i !== idx) return e
        const next = { ...e, ...patch }
        // 切换供应商时，模型重置为该供应商下第一个
        if (patch.assistantId && patch.assistantId !== e.assistantId) {
          next.model = modelsOf(patch.assistantId)[0]?.id || ''
        }
        return next
      }),
    )
    setDirty(true)
  }

  const removeEntry = (idx) => {
    setChain((c) => c.filter((_, i) => i !== idx))
    setDirty(true)
  }

  const moveEntry = (idx, dir) => {
    const target = idx + dir
    setChain((c) => {
      if (target < 0 || target >= c.length) return c
      const next = [...c]
      const tmp = next[idx]
      next[idx] = next[target]
      next[target] = tmp
      return next
    })
    setDirty(true)
  }

  const saveChain = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await updateDefaultChain(chain)
      const d = res?.data ?? res
      setChain(Array.isArray(d?.chain) ? d.chain : [])
      setDirty(false)
      flash(t('默认模型已保存'), 'ok')
    } catch (e) {
      flash(`保存默认模型失败：${e.message}`, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
      <div className="mb-5 flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white">
          <Star size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{t('默认模型配置')}</h3>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600">{t('系统默认')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            从已配置的 AI 助手中选择模型组成默认模型链。第 1 个为系统默认模型；请求失败或异常时自动切换到下一个，失败的模型将进入 {cooldownMinutes} 分钟冷却期，期间被跳过，冷却结束后重新从第 1 个开始尝试。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" />{t('加载默认模型…')}
        </div>
      ) : enabledAssistants.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs text-slate-400">{t('请先在下方添加并启用 AI 助手，再配置默认模型')}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {chain.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-400">{t('还没有配置默认模型，点击「添加模型」开始')}
              </p>
            )}
            {chain.map((entry, idx) => {
              const models = modelsOf(entry.assistantId)
              const hasAssistant = models.length > 0 || enabledAssistants.some((x) => x.id === entry.assistantId)
              return (
                <div
                  key={`${entry.assistantId}|${entry.model}|${idx}`}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-200 font-mono text-[11px] font-bold text-slate-600">
                    {idx + 1}
                  </span>
                  <select
                    value={entry.assistantId}
                    onChange={(e) => updateEntry(idx, { assistantId: e.target.value })}
                    className="h-9 max-w-[45%] flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-primary-400"
                  >
                    {enabledAssistants.some((x) => x.id === entry.assistantId) ? null : (
                      <option value={entry.assistantId}>{t('（助手已停用或删除）')}</option>
                    )}
                    {enabledAssistants.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={entry.model}
                    onChange={(e) => updateEntry(idx, { model: e.target.value })}
                    disabled={!hasAssistant}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs text-slate-700 outline-none focus:border-primary-400 disabled:opacity-50"
                  >
                    {!entry.model && <option value="">{t('选择模型')}</option>}
                    {(models.find((m) => m.id === entry.model)
                      ? models
                      : [...models, { id: entry.model }]
                    )
                      .filter((m) => m.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                  </select>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title={t('上移')}
                      disabled={idx === 0}
                      onClick={() => moveEntry(idx, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      title={t('下移')}
                      disabled={idx === chain.length - 1}
                      onClick={() => moveEntry(idx, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      title={t('移除')}
                      onClick={() => removeEntry(idx)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {idx === 0 && (
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t('默认')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addEntry}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-primary-300 hover:text-primary-600"
            >
              <Plus size={14} />{t('添加模型')}
            </button>
            <button
              type="button"
              onClick={saveChain}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {dirty ? t('保存默认模型') : t('已保存')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

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
  const { t } = useI18n()
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
              {t(meta.label)}
            </span>
            {isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                <Star size={10} className="fill-amber-500 text-amber-500" />{t('默认')}
              </span>
            )}
            {!a.enabled && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">{t('已停用')}
              </span>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-slate-400">{metaLine}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {t(meta.hint)} · {t('启用模型 {enabled} / {total}', { enabled: enabledModels, total: (a.models || []).length })}
          </p>

          {/* 测速结果 */}
          {testState?.result && (
            <p className={`mt-0.5 text-[11px] font-medium ${testState.result.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {testState.result.ok
                ? t('✓ 连通正常 {ms}ms · {model}', { ms: testState.result.latencyMs, model: testState.result.model })
                : t('✕ 连通失败：{error}', { error: testState.result.error })}
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
                  title={m.enabled ? t('点击停用该模型') : t('点击启用该模型')}
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
            <p className="mt-3 text-[11px] text-amber-600">{t('尚未配置模型，点击「编辑」添加')}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Toggle checked={a.enabled} onChange={onToggle} />
          {!isDefault && (
            <button
              type="button"
              onClick={onMakeDefault}
              title={t('设为默认助手')}
              className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-amber-50 hover:text-amber-500"
            >
              <Star size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onTest}
            disabled={testState?.loading}
            title={t('连通测速（默认用第一个启用模型）')}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 disabled:opacity-60"
          >
            {testState?.loading ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />}
          </button>
          <button
            type="button"
            onClick={onEdit}
            title={t('编辑')}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title={t('删除')}
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
  const { t } = useI18n()
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
      alert(t('读取 CLI 模型失败：{error}', { error: e.message }))
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
          <Field label={t('助手名称')}>
            <input
              className={inputCls}
              placeholder={t('如 DeepSeek / 公司中转 / 本地 claude')}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>

          {/* 接入方式 */}
          <Field label={t('接入方式')} hint={isCli ? '通过本地命令行工具调用，无需 API Key' : '通过 HTTP API 调用，支持 OpenAI 兼容协议与 Anthropic'}>
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
              <Field label={t('Provider 类型')}>
                <select
                  className={inputCls}
                  value={form.type === 'cli' ? 'openai' : form.type}
                  onChange={(e) => set({ type: e.target.value })}
                >
                  <option value="openai">{t('OpenAI 兼容（DeepSeek / Ollama 等）')}</option>
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
                <Field label={t('Base URL（可选）')} hint={t('留空使用官方默认地址')}>
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
              <Field label={t('CLI 类型')} hint={t('已内置适配的命令行工具，参数与输出解析由应用自动处理')}>
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
                      {t(p.label)} — {t(p.desc)}
                    </option>
                  ))}
                </select>
              </Field>
              {form.cliKind === 'generic' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('命令')}>
                    <input
                      className={inputCls}
                      placeholder={t('如 ollama')}
                      value={form.command}
                      onChange={(e) => set({ command: e.target.value })}
                    />
                  </Field>
                  <Field label={t('参数（空格分隔）')} hint={t('提示词通过 stdin 传入，逐行输出作为回复')}>
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
                  <p className="text-[11px] font-medium text-slate-500">{t('实际执行命令（模型参数按需自动附加）')}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-400">{cliPreset.preview}</p>
                </div>
              )}
            </div>
          )}

          {/* 模型管理 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">{t('模型列表')}</label>
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
                  <Plus size={13} />{t('添加模型')}
                </button>
              </div>
            </div>
            {isCli && form.cliKind !== 'generic' && (
              <p className={hintCls}>{t('可从本地 CLI 配置自动读取（codex 读 ~/.codex/config.toml，claude 读 ~/.claude/settings.json）')}</p>
            )}
            {form.models.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-center text-[11px] text-slate-400">{t('还没有模型，点击「添加模型」')}
              </p>
            )}
            {form.models.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <Toggle checked={m.enabled !== false} onChange={() => updateModel(i, { enabled: m.enabled === false })} />
                <input
                  className={inputCls}
                  placeholder={t('模型 ID，如 gpt-4o-mini')}
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
              <p className={hintCls}>{t('开关控制模型的启用 / 停用，停用后对话下拉中不可选')}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >{t('取消')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? t('保存修改') : '创建助手'}
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

export default function Settings({
  latestRelease,
  currentRelease,
  updateAvailable,
  releaseCheckError,
  currentReleaseError,
  checkingForUpdates,
  checkForUpdates,
  openReleasePage,
}) {
  const { t, language, setLanguage } = useI18n()
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const accountMenuRef = useRef(null)
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
        setProfileError(t('未获取到账号信息'))
      }
    } catch (e) {
      setProfileError(e.message || t('拉取账号信息失败'))
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
        setSolvedStatsError(t('未获取到刷题统计'))
      }
    } catch (e) {
      setSolvedStatsError(e.message || t('拉取刷题统计失败'))
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
        setImportState((s) => ({ ...s, running: false, phase: 'done', error: t('未获取到已刷题列表') }))
        flash(t('未获取到已刷题列表，请稍后重试'), 'err')
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
          ? t('导入完成：新增 {imported} 题，已存在 {skipped} 题，失败 {failed} 题', { imported, skipped, failed })
          : t('导入完成：新增 {imported} 题，已存在 {skipped} 题', { imported, skipped }),
        failed > 0 ? 'err' : 'ok'
      )
    } catch (e) {
      setImportState((s) => ({ ...s, running: false, phase: 'done', error: e.message || '导入失败' }))
      flash(t('导入失败：{error}', { error: e.message }), 'err')
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

  useEffect(() => {
    const syncAccountSettings = () => {
      getSettings().then((res) => {
        const latestSettings = res.data || res
        setSettings(latestSettings)
        if (!latestSettings.leetcode_cookie) {
          setProfile(null)
          setSolvedStats(null)
          setSolvedStatsError('')
        }
      }).catch(() => {})
    }
    window.addEventListener('leetcode-account-changed', syncAccountSettings)
    return () => window.removeEventListener('leetcode-account-changed', syncAccountSettings)
  }, [])

  useEffect(() => {
    const openAccountBinding = () => setActive('binding')
    window.addEventListener('open-leetcode-account-settings', openAccountBinding)
    return () => window.removeEventListener('open-leetcode-account-settings', openAccountBinding)
  }, [])

  const loadAssistants = async () => {
    try {
      const res = await listAssistants()
      const d = res?.data ?? res
      setAssistants(d?.list || [])
      setAiDefault(d?.default || '')
    } catch (e) {
      flash(t('加载 AI 助手失败：{error}', { error: e.message }), 'err')
    }
  }

  const setKV = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))

  const persist = async (kv, text) => {
    try {
      await updateSettings(kv)
      if (Object.prototype.hasOwnProperty.call(kv, 'leetcode_cookie')) {
        window.dispatchEvent(new Event('leetcode-account-changed'))
      }
      flash(text)
    } catch (e) {
      flash(t('保存失败：{error}', { error: e.message }), 'err')
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
              flash(t('LeetCode 登录成功，Cookie 已自动保存'))
              window.dispatchEvent(new Event('leetcode-account-changed'))
              loadProfile()
            })
            .catch(() => setLoginState('failed'))
        } else {
          setLoginState('failed')
          flash(message || t('登录未完成，请重试'), 'err')
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
      flash(t('已切换到{region}', { region: REGIONS.find((r) => r.value === region)?.label || region }))
    } catch (err) {
      flash(t('保存区域失败：{error}', { error: err.message }), 'err')
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
      flash(t('打开登录窗口失败: {error}', { error: e }), 'err')
    }
  }

  const cancelLeetCodeLogin = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('close_leetcode_login')
    } catch {}
    setLoginState('idle')
  }

  const logoutLeetCode = async () => {
    setLoggingOut(true)
    try {
      await updateSettings({ leetcode_cookie: '', leetcode_username: '' })
      setSettings((prev) => ({ ...prev, leetcode_cookie: '', leetcode_username: '' }))
      setProfile(null)
      setSolvedStats(null)
      setSolvedStatsError('')
      setAccountMenuOpen(false)
      window.dispatchEvent(new Event('leetcode-account-changed'))
      flash(t('已退出 LeetCode 账号'))
    } catch (e) {
      flash(t('退出失败：{error}', { error: e.message }), 'err')
    } finally {
      setLoggingOut(false)
    }
  }

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

  // 测试连接：用当前 Cookie 实际抓取一道题（two-sum，幂等）
  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetchLeetCodeProblem({ titleSlug: 'two-sum' })
      const title = res?.data?.title || res?.data?.translatedTitle
      setTestResult({ ok: true, text: t('连接成功，已验证抓取「{title}」', { title: title || t('两数之和') }) })
    } catch (e) {
      setTestResult({ ok: false, text: t('连接失败：{error}', { error: e.message }) })
    } finally {
      setTesting(false)
    }
  }

  const loadCacheInfo = async () => {
    try {
      const res = await get('/api/v1/leetcode/cache/stats')
      setCacheInfo(res?.data || null)
      flash(t('缓存统计已刷新'))
    } catch (e) {
      flash(t('读取缓存统计失败：{error}', { error: e.message }), 'err')
    }
  }

  const clearCache = async () => {
    setClearing(true)
    try {
      await post('/api/v1/leetcode/cache/clear')
      setCacheInfo(null)
      flash(t('题目缓存已清除'))
    } catch (e) {
      flash(t('清除缓存失败：{error}', { error: e.message }), 'err')
    } finally {
      setClearing(false)
    }
  }

  // AI 助手操作
  const saveAssistant = async (config) => {
    try {
      if (config.id) {
        await updateAssistant(config.id, config)
        flash(t('AI 助手已更新'))
      } else {
        await createAssistant(config)
        flash(t('AI 助手已创建'))
      }
      setAssistantEditor(null)
      loadAssistants()
    } catch (e) {
      flash(t('保存失败：{error}', { error: e.message }), 'err')
    }
  }

  const removeAssistant = async (a) => {
    if (!window.confirm(t('确定删除 AI 助手「{name}」吗？', { name: a.name }))) return
    try {
      await deleteAssistant(a.id)
      flash(t('AI 助手已删除'))
      loadAssistants()
    } catch (e) {
      flash(t('删除失败：{error}', { error: e.message }), 'err')
    }
  }

  const makeDefault = async (a) => {
    try {
      await setDefaultAssistant(a.id)
      flash(t('已将「{name}」设为默认助手', { name: a.name }))
      loadAssistants()
    } catch (e) {
      flash(t('设置失败：{error}', { error: e.message }), 'err')
    }
  }

  const switchAssistant = async (a) => {
    try {
      await toggleAssistant(a.id, !a.enabled)
      loadAssistants()
    } catch (e) {
      flash(t('操作失败：{error}', { error: e.message }), 'err')
    }
  }

  const switchModel = async (a, model) => {
    try {
      await toggleModel(a.id, model.id, !model.enabled)
      loadAssistants()
    } catch (e) {
      flash(t('操作失败：{error}', { error: e.message }), 'err')
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
    ? <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('已连接')}</span>
    : <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />{t('未配置')}</span>

  return (
    <div className="flex h-full bg-white">
      {/* 左侧设置导航 */}
      <aside className="w-56 shrink-0 border-r border-slate-100 bg-white p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('设置')}</h1>
        <p className="mt-1 mb-6 text-xs text-slate-400">{t('管理账户与刷题偏好')}</p>
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
              {t(item.label)}
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
                title={t('账号绑定')}
                badge={badge}
                desc={t('绑定 LeetCode 账号：自动拉取头像昵称、提交记录与已同步代码，数据仅保存在本地')}
              />
            <Card
              icon={ShieldCheck}
              iconBg="bg-primary-600"
              title={t('LeetCode 同步设置')}
              desc={t('点击「一键登录」在弹窗中登录后自动抓取 Cookie 与账号信息；也可以手动更换 Cookie。')}
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
                    >{t('刷新缓存统计')}
                    </button>
                    <button
                      type="button"
                      onClick={clearCache}
                      disabled={clearing}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                    >
                      {clearing ? '清除中…' : t('清除缓存')}
                    </button>
                  </div>
                </>
              }
            >
              {/* 账号信息卡片：登录后自动展示头像 / 昵称 */}
              <div className="mb-4 flex items-center gap-4 rounded-xl bg-slate-50/80 p-5">
                <div ref={accountMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((open) => !open)}
                    aria-label={t('打开账号菜单')}
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:border-primary-300 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt={t('头像')} className="h-full w-full object-cover" />
                    ) : (
                      <UserRound size={24} />
                    )}
                  </button>
                  {accountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute left-0 top-[calc(100%+8px)] z-30 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                    >
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-slate-800">{t('LeetCode 账号')}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {hasCookie
                            ? profile?.realName || profile?.username || t('已配置登录凭证')
                            : t('尚未绑定账号')}
                        </p>
                      </div>
                      <div className="my-1 border-t border-slate-100" />
                      {hasCookie ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={logoutLeetCode}
                          disabled={loggingOut}
                          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          {loggingOut ? '正在退出…' : '退出登录'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setAccountMenuOpen(false)
                            if (isTauri()) startLeetCodeLogin()
                            else setCookieEditing(true)
                          }}
                          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-primary-700 transition hover:bg-primary-50"
                        >{t('绑定账号信息')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {profile?.realName || profile?.username || (hasCookie ? t('已绑定账号') : t('未绑定账号'))}
                    </span>
                    {connected && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('已连接')}
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
                            ? t('账号信息加载失败，可点击「刷新账号信息」重试')
                            : '等待绑定 LeetCode 账号'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={loadProfile}
                    disabled={profileLoading || !hasCookie}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                  >
                    {profileLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    刷新账号信息
                  </button>
                  {hasCookie && (
                    <button
                      type="button"
                      onClick={logoutLeetCode}
                      disabled={loggingOut}
                      className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 shadow-sm transition-all hover:bg-rose-50 active:scale-95 disabled:opacity-50"
                    >
                      {loggingOut ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                      {loggingOut ? '退出中…' : '退出账号'}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-xl bg-slate-50/80 p-5">
                {isTauri() && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">{t('账号区域')}</span>
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
                      >{t('取消')}
                      </button>
                    )}
                    {loginState === 'success' && <span className="text-xs text-primary-700">{t('✓ 已登录')}</span>}
                    {loginState === 'failed' && <span className="text-xs text-rose-500">{t('登录失败，请重试')}</span>}
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
                      <ShieldCheck size={12} />{t('您的 Cookie 仅用于本地拉取数据，我们不会上传至任何云端服务器。')}
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
                          onClick={() => persist({ leetcode_cookie: settings.leetcode_cookie || '' }, t('Cookie 已保存'))}
                          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                        >{t('更新授权')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCookieEditing(false)}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
                        >{t('收起')}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <KeyRound size={14} />
                      {hasCookie ? t('已配置登录凭证（默认隐藏）') : t('尚未配置登录凭证')}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCookieEditing(true)}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                    >
                      <KeyRound size={14} />{t('更换 Cookie')}
                    </button>
                  </div>
                 )}
               </div>
             </Card>

             {/* 刷题统计与一键导入 */}
             <Card
               icon={BarChart3}
               iconBg="bg-amber-500"
               title={t('刷题统计')}
               desc={t('实时获取当前 LeetCode 账号的刷题进度与难度分布，并支持一键导入已刷题到本地题库。')}
               footer={
                 <>
                   <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                     <DownloadCloud size={14} />
                     {importedTotal != null
                       ? t('已从 LeetCode 导入 {count} 题到本地题库', { count: importedTotal })
                       : t('导入的题目会保存到本地题库，可离线浏览与复习')}
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
                       {importState?.running ? '导入中…' : t('一键导入已刷题到题库')}
                     </button>
                   </div>
                 </>
               }
             >
               {!hasCookie ? (
                 <div className="rounded-xl bg-slate-50/80 p-5 text-xs text-slate-400">{t('绑定 LeetCode 账号后即可查看刷题统计与导入已刷题。')}
                 </div>
               ) : (
                 <div className="space-y-5">
                   {solvedStatsError && !statSummary && (
                     <div className="rounded-xl bg-rose-50/60 p-4 text-xs font-medium text-rose-600">
                       {solvedStatsError}
                       <button type="button" onClick={loadSolvedStats} className="ml-2 underline underline-offset-2">{t('重试')}
                       </button>
                     </div>
                   )}

                   {statSummary && (
                     <>
                       {/* 概览数字 */}
                       <div className="grid grid-cols-3 gap-3">
                         {[
                           { label: t('已刷题数'), value: statSummary.solved, accent: 'text-emerald-600' },
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
                         <p className="text-xs font-medium text-slate-500">{t('难度分布（已刷 / 总题量）')}</p>
                         {statSummary.byDifficulty.map((d) => {
                           const pct = d.total > 0 ? Math.min(100, Math.round((d.solved / d.total) * 100)) : 0
                           return (
                             <div key={d.key} className="space-y-1.5">
                               <div className="flex items-center justify-between text-xs">
                                 <span className="font-medium text-slate-600">{d.label}</span>
                                 <span className="tabular-nums text-slate-400">{t('已刷')} <span className={`font-semibold ${d.text}`}>{d.solved}</span> / {d.total}（{pct}%）
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
                       <Loader2 size={14} className="animate-spin" />{t('正在从 LeetCode 拉取刷题统计…')}
                     </div>
                   )}

                   {/* 导入进度条 */}
                   {importState && (
                     <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                       {importState.phase === 'list' && (
                         <div className="flex items-center gap-2 text-xs text-slate-500">
                           <Loader2 size={14} className="animate-spin" />{t('正在获取已刷题列表…')}
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
                               <span className="font-medium text-rose-600">✕ {t('导入失败：{error}', { error: importState.error })}</span>
                             </>
                           ) : (
                             <span className="font-medium text-primary-700">
                               ✓ {t('导入完成：新增 {imported} 题，已存在 {skipped} 题', { imported: importState.imported, skipped: importState.skipped })}
                               {importState.failed > 0 ? t('，失败 {failed} 题', { failed: importState.failed }) : ''}
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
                title={t('AI 助手')}
                desc={t('可添加多个 AI 助手：自定义 API 接入或使用本地 CLI 工具，每个助手下可管理多个模型并独立启用 / 停用')}
                badge={
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                    {t('共 {count} 个助手', { count: assistants.length })}
                  </span>
                }
              />

              {/* 默认模型配置（failover 链） */}
              <DefaultChainSection assistants={assistants} />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAssistantEditor({ data: null })}
                  className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                >
                  <Plus size={15} />{t('新增 AI 助手')}
                </button>
              </div>

              {/* 助手列表 */}
              {assistants.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center">
                  <Sparkles size={28} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">{t('还没有 AI 助手')}</p>
                  <p className="mt-1 text-xs text-slate-400">{t('点击右上角「新增 AI 助手」接入 OpenAI 兼容 API、Claude 或本地 CLI')}</p>
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

          {/* 通用设置：界面语言（置于通用设置最上方） */}
          {active === 'general' && (
            <section className="space-y-5">
            <Card
              icon={Globe}
              iconBg="bg-indigo-500"
              title={t('界面语言')}
              desc={t('选择应用界面显示语言后，导航、列表与抽屉文案会立即切换。')}
            >
              <Field label={t('选择语言')} hint={t('选择应用界面显示语言')}>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className={inputCls}
                >
                  <option value="zh">{t('中文')}</option>
                  <option value="en">{t('英文')}</option>
                </select>
              </Field>
            </Card>
            </section>
          )}

          {/* 通用设置：语言与列表显示 */}
          {active === 'general' && (
            <section className="space-y-5">
              <SectionHeader title={t('通用设置')} desc={t('统一管理学习目标、题目列表与浏览器行为')} />
            <Card
              icon={SlidersHorizontal}
              iconBg="bg-sky-600"
              title={t('默认语言与列表显示')}
              footer={
                <div className="flex w-full justify-end">
                  <button
                    type="button"
                    onClick={() => persist(
                      {
                        default_language: settings.default_language || 'Python 3',
                        page_size: String(Math.min(100, Math.max(8, Number(settings.page_size) || 16))),
                        show_pass_rate: settings.show_pass_rate === 'true' ? 'true' : 'false',
                      },
                      t('通用设置已保存')
                    )}
                    className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                  >
                    {t('保存')}
                  </button>
                </div>
              }
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('默认目标语言')} hint={t('在题目列表中优先显示该语言的提交记录')}>
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
                  <Field label={t('列表每页条数')} hint={t('题库列表分页大小（8 - 100，默认 16）')}>
                    <input
                      type="number"
                      min="8"
                      max="100"
                      value={settings.page_size || '16'}
                      onChange={(e) => setKV('page_size', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('显示通过率')} hint={t('在题库列表中展示官方通过率列')}>
                    <select
                      value={settings.show_pass_rate || 'true'}
                      onChange={(e) => setKV('show_pass_rate', e.target.value)}
                      className={inputCls}
                    >
                      <option value="true">{t('显示')}</option>
                      <option value="false">{t('隐藏')}</option>
                    </select>
                  </Field>
                </div>
              </div>
            </Card>
            </section>
          )}

          {/* 通用设置：目标与热力图 */}
          {active === 'general' && (
            <section className="space-y-5">
            <Card
              icon={GraduationCap}
              iconBg="bg-emerald-500"
              title={t('每日目标与热力图')}
              desc={t('设置每日复习和学习目标，热力图会按两个目标的总数自动调整颜色深浅。')}
              footer={
                <div className="flex w-full justify-end">
                  <button
                    type="button"
                    onClick={() => persist(
                      {
                        daily_review_target: String(Math.min(50, Math.max(1, Number(settings.daily_review_target) || 3))),
                        daily_study_target: String(Math.min(50, Math.max(1, Number(settings.daily_study_target) || 3))),
                      },
                      t('每日目标已保存')
                    )}
                    className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                  >
                    {t('保存')}
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('每日复习目标 (题)')} hint={t('每天计划完成复习的题数')}>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.daily_review_target || '3'}
                    onChange={(e) => setKV('daily_review_target', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label={t('每日学习目标 (题)')} hint={t('每天计划新增并学习的题数')}>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.daily_study_target || '3'}
                    onChange={(e) => setKV('daily_study_target', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            </Card>
            </section>
          )}

          {/* 通用设置：浏览器 */}
          {active === 'general' && (
            <section className="space-y-5">
              <Card
                icon={Globe}
                iconBg="bg-sky-500"
                title={t('题目页与内置浏览器')}
                desc={t('控制题目链接的打开位置，以及内置浏览器中提供的笔记和打卡功能。')}
                footer={
                  <div className="flex w-full justify-end">
                    <button
                      type="button"
                      onClick={() => persist(
                        {
                          leetcode_open_mode: settings.leetcode_open_mode || 'embedded',
                          embedded_notes_enabled: settings.embedded_notes_enabled === 'false' ? 'false' : 'true',
                        },
                        t('浏览器设置已保存')
                      )}
                      className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-600 active:scale-95"
                    >
                      {t('保存')}
                    </button>
                  </div>
                }
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('题目页打开方式')} hint={t('VIEW_LEETCODE 和训练打卡按钮打开 LeetCode 题目页使用的浏览器')}>
                    <select
                      value={settings.leetcode_open_mode || 'embedded'}
                      onChange={(e) => setKV('leetcode_open_mode', e.target.value)}
                      className={inputCls}
                    >
                      <option value="embedded">{t('内置浏览器（应用内窗口，共享登录状态）')}</option>
                      <option value="system">{t('系统默认浏览器')}</option>
                    </select>
                  </Field>
                  <Field label={t('内置浏览器笔记与打卡按钮')} hint={t('仅内置浏览器生效；开启后自动注入应用自带的笔记和打卡功能')}>
                    <label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={settings.embedded_notes_enabled !== 'false'}
                        onChange={(e) => {
                          const value = e.target.checked ? 'true' : 'false'
                          setKV('embedded_notes_enabled', value)
                          persist({ embedded_notes_enabled: value }, t('内置浏览器笔记设置已保存'))
                        }}
                        className="h-4 w-4 accent-primary-600"
                      />
                      {t('自动加载 LeetCode 笔记与打卡功能')}
                    </label>
                  </Field>
                </div>
              </Card>
            </section>
          )}

          {/* 插件同步 */}
          {active === 'plugin' && (
            <section className="space-y-5">
              <SectionHeader
                title={t('插件同步')}
                desc={t('内置浏览器会自动注入同一套笔记功能；外部浏览器仍可安装油猴脚本实现数据双向同步')}
              />
              <Card
                icon={Puzzle}
                iconBg="bg-amber-500"
                title={t('Tampermonkey 油猴脚本')}
                desc={t('Tauri 内置浏览器无需安装扩展；系统浏览器请安装 Tampermonkey 脚本。两种方式均会读取和保存本应用本地数据库中的笔记数据')}
              >
                <div className="space-y-4">
                  {/* 后台服务地址 */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{t('当前后台服务地址')}</p>
                      <p className="mt-1 truncate font-mono text-sm text-slate-900">{serverHost || '获取中…'}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('运行中')}
                    </span>
                  </div>

                  {/* 配置步骤 */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="mb-3 text-xs font-medium text-slate-600">{t('配置步骤')}</p>
                    <ol className="space-y-2.5 text-xs leading-relaxed text-slate-500">
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">1</span>{t('在浏览器安装 Tampermonkey 扩展（Chrome / Edge / Firefox 均支持）')}
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">2</span>{t('点击下方「一键复制脚本」，脚本中的 API_HOST 已自动替换为当前后台地址')} <span className="font-mono text-slate-700">{serverHost}</span>
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">3</span>{t('打开 Tampermonkey 管理面板 → 新建脚本 → 粘贴并保存（或拖入 .user.js 文件安装）')}
                      </li>
                      <li className="flex gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">4</span>{t('访问任意 leetcode.cn 题目页面，右侧会出现「笔记」按钮，打开即可与本应用同步笔记数据')}
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
                      {copied ? t('已复制到剪贴板') : '一键复制脚本'}
                    </button>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* 关于 */}
          {active === 'about' && (
            <section className="space-y-5 pb-2">
              <SectionHeader title={t('关于')} desc={t('应用信息与功能介绍')} />

              <div className="relative isolate overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-card">
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-50 via-white to-lime-50/70" />
                <div className="absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full bg-emerald-100/60 blur-3xl" />
                <div className="flex flex-col gap-7 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
                  <div className="flex min-w-0 items-center gap-5">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-emerald-500 to-green-700 p-1 shadow-lg shadow-emerald-900/15 ring-1 ring-white/70">
                      <img src="/logo.png" alt={t('LeetCode 刷题笔记应用 Logo')} className="h-full w-full rounded-[1.1rem] object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">LEETCODE STUDY DESK</p>
                      <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{t('LeetCode 刷题笔记')}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{t('把刷题、记录与复习放在一个地方。专注积累每一次解题思路，让复习节奏清晰可见。')}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 shadow-sm sm:self-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Sparkles size={17} />
                    </span>
                    <div>
                      <p className="text-[10px] font-medium tracking-wide text-slate-400">{t('当前版本')}</p>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">v{APP_VERSION}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-px border-t border-emerald-100 bg-emerald-100/70 sm:grid-cols-3">
                  {[
                    { icon: BookOpenCheck, title: '题库与笔记', desc: '同步题目，沉淀解题思路' },
                    { icon: CalendarDays, title: '间隔复习', desc: '规划复习节奏，追踪学习记录' },
                    { icon: BrainCircuit, title: 'AI 学习助手', desc: '辅助整理思路与知识点' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="flex items-start gap-3 bg-white/90 px-5 py-4">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <Icon size={16} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{title}</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-5 shadow-card sm:p-6 ${updateAvailable ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200/80 bg-white'}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-800">
                        {updateAvailable ? t('发现新版本') : t('版本更新')}
                      </h3>
                      {updateAvailable && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{t('新版本')}</span>
                      )}
                    </div>
                    {latestRelease ? (
                      <>
                        <p className="mt-2 text-xs text-slate-600">
                          {updateAvailable
                            ? <>{t('最新版本')} <span className="font-mono font-semibold text-emerald-800">v{latestRelease.version}</span>{latestRelease.name.replace(/^v/i, '') !== latestRelease.version && ` · ${latestRelease.name}`}</>
                            : t('当前已是最新版本')}
                        </p>
                        {latestRelease.publishedAt && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            {t('发布时间')}：{new Date(latestRelease.publishedAt).toLocaleDateString()}
                          </p>
                        )}
                        {updateAvailable && latestRelease.body && (
                          <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-emerald-100 bg-white/80 p-4">
                            <p className="mb-2 text-[11px] font-semibold text-slate-600">{t('更新日志')}</p>
                            <div className="break-words text-xs leading-6 text-slate-600 [&_a]:text-emerald-700 [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{latestRelease.body}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {updateAvailable && !latestRelease.body && (
                          <p className="mt-3 text-xs text-slate-500">{t('此版本暂未提供更新日志')}</p>
                        )}
                      </>
                    ) : releaseCheckError ? (
                      <p role="status" className="mt-2 text-xs text-amber-700">{t('检查更新失败')}：{releaseCheckError}</p>
                    ) : (
                      <p role="status" className="mt-2 text-xs text-slate-500">{t('正在检查更新…')}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={checkForUpdates}
                      disabled={checkingForUpdates}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <RefreshCw size={14} className={checkingForUpdates ? 'animate-spin' : ''} />
                      {checkingForUpdates ? t('同步中…') : t('手动刷新')}
                    </button>
                    {updateAvailable && (
                      <button
                        type="button"
                        onClick={openReleasePage}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
                      >
                        <DownloadCloud size={15} />
                        {t('前往下载')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
                <h3 className="text-sm font-semibold text-slate-800">{t('当前版本更新日志')}</h3>
                {currentRelease ? (
                  <>
                    <p className="mt-2 text-xs text-slate-500">
                      v{currentRelease.version}{currentRelease.publishedAt && ` · ${new Date(currentRelease.publishedAt).toLocaleDateString()}`}
                    </p>
                    {currentRelease.body ? (
                      <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="break-words text-xs leading-6 text-slate-600 [&_a]:text-emerald-700 [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentRelease.body}</ReactMarkdown>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">{t('此版本暂未提供更新日志')}</p>
                    )}
                  </>
                ) : currentReleaseError ? (
                  <p role="status" className="mt-2 text-xs text-slate-500">{t('当前版本更新日志暂不可用')}：{currentReleaseError}</p>
                ) : checkingForUpdates ? (
                  <p role="status" className="mt-2 text-xs text-slate-500">{t('正在获取当前版本更新日志…')}</p>
                ) : (
                  <p role="status" className="mt-2 text-xs text-slate-500">{t('GitHub 暂无当前版本的发布说明')}</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Database size={16} className="text-emerald-700" />
                  <h3 className="text-sm font-semibold text-slate-800">{t('应用信息')}</h3>
                </div>
                <div className="grid gap-x-10 sm:grid-cols-2">
                  {[
                    ['应用名称', 'LeetCode 刷题笔记'],
                    ['当前版本', `v${APP_VERSION}`],
                    ['技术架构', 'Tauri · React · Go (Gin)'],
                    [t('数据存储'), 'SQLite · 本地优先'],
                  ].map(([label, value], index) => (
                    <div key={label} className={`flex items-center justify-between gap-4 py-3 border-b border-slate-100 ${index < 2 ? 'sm:border-b' : 'sm:border-b-0'}`}>
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className={`text-right text-xs font-medium text-slate-700 ${label === '当前版本' ? 'font-mono' : ''}`}>{value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">{t('复习热力图、LeetCode 账号联动与 Tampermonkey 插件同步，帮助你形成持续、可回顾的刷题记录。')}
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
