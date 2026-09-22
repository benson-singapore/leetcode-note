import { useEffect, useState } from 'react'
import { getSettings, updateSettings } from '../api/leetcode'
import { getAISettings, updateAISettings, listProviders } from '../api/ai'

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold text-neutral-800">{title}</h2>
      {children}
    </div>
  )
}

const inputCls = 'h-9 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-primary-400'

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [ai, setAi] = useState(null)
  const [providers, setProviders] = useState([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getSettings().then((res) => setSettings(res.data || res)).catch(() => {})
    getAISettings().then((res) => setAi(res.data || res)).catch(() => {})
    listProviders().then((res) => setProviders(res.data?.list || [])).catch(() => {})
  }, [])

  const saveLeetCode = async () => {
    await updateSettings({ leetcode_cookie: settings.leetcode_cookie || '' })
    setMsg('LeetCode Cookie 已保存')
    setTimeout(() => setMsg(''), 2500)
  }

  const saveAI = async () => {
    await updateAISettings(ai)
    setMsg('AI 设置已保存')
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-xl font-semibold text-neutral-900">设置</h1>
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {/* LeetCode Cookie（供题目抓取与已同步代码拉取） */}
      <Section title="LeetCode Cookie">
        <p className="mb-3 text-xs text-neutral-400">
          登录 leetcode.cn 后从浏览器复制 Cookie，用于抓取题目详情和拉取站内已同步代码。
        </p>
        <textarea
          rows={3}
          value={settings.leetcode_cookie || ''}
          onChange={(e) => setSettings({ ...settings, leetcode_cookie: e.target.value })}
          className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 font-mono text-xs outline-none focus:border-primary-400"
          placeholder="LEETCODE_SESSION=...; csrftoken=..."
        />
        <div className="mt-3 text-right">
          <button onClick={saveLeetCode} className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm text-white hover:bg-primary-600">
            保存
          </button>
        </div>
      </Section>

      {/* AI 设置 */}
      {ai && (
        <Section title="AI Provider">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">默认 Provider</label>
              <select
                value={ai.defaultProvider}
                onChange={(e) => setAi({ ...ai, defaultProvider: e.target.value })}
                className={inputCls}
              >
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-100 p-4 sm:grid-cols-3">
              <div className="sm:col-span-3 text-xs font-medium text-neutral-600">OpenAI 兼容（含 DeepSeek / Ollama 等）</div>
              <input className={inputCls} placeholder="API Key" value={ai.openai?.apiKey || ''}
                onChange={(e) => setAi({ ...ai, openai: { ...ai.openai, apiKey: e.target.value } })} />
              <input className={inputCls} placeholder="Base URL（可选）" value={ai.openai?.baseURL || ''}
                onChange={(e) => setAi({ ...ai, openai: { ...ai.openai, baseURL: e.target.value } })} />
              <input className={inputCls} placeholder="模型" value={ai.openai?.model || ''}
                onChange={(e) => setAi({ ...ai, openai: { ...ai.openai, model: e.target.value } })} />
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-100 p-4 sm:grid-cols-3">
              <div className="sm:col-span-3 text-xs font-medium text-neutral-600">Anthropic Claude</div>
              <input className={inputCls} placeholder="API Key" value={ai.anthropic?.apiKey || ''}
                onChange={(e) => setAi({ ...ai, anthropic: { ...ai.anthropic, apiKey: e.target.value } })} />
              <input className={inputCls} placeholder="Base URL（可选）" value={ai.anthropic?.baseURL || ''}
                onChange={(e) => setAi({ ...ai, anthropic: { ...ai.anthropic, baseURL: e.target.value } })} />
              <input className={inputCls} placeholder="模型" value={ai.anthropic?.model || ''}
                onChange={(e) => setAi({ ...ai, anthropic: { ...ai.anthropic, model: e.target.value } })} />
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-100 p-4 sm:grid-cols-3">
              <div className="sm:col-span-3 text-xs font-medium text-neutral-600">本地 CLI（如 claude）</div>
              <input className={inputCls} placeholder="命令" value={ai.cli?.command || ''}
                onChange={(e) => setAi({ ...ai, cli: { ...ai.cli, command: e.target.value } })} />
              <input className={inputCls} placeholder="参数（空格分隔）" value={(ai.cli?.args || []).join(' ')}
                onChange={(e) => setAi({ ...ai, cli: { ...ai.cli, args: e.target.value.split(' ').filter(Boolean) } })} />
              <input className={inputCls} placeholder="模型（可选）" value={ai.cli?.model || ''}
                onChange={(e) => setAi({ ...ai, cli: { ...ai.cli, model: e.target.value } })} />
            </div>
          </div>
          <div className="mt-4 text-right">
            <button onClick={saveAI} className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm text-white hover:bg-primary-600">
              保存
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}
