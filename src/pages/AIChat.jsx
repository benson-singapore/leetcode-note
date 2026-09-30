import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Plus, Send, Trash2, MessageSquare, Square } from 'lucide-react'
import {
  listSessions, deleteSession, cancelChat,
  chatStream, listProviders,
} from '../api/ai'
import { useI18n } from '../i18n'

export default function AIChat() {
  const { t } = useI18n()
  const [sessions, setSessions] = useState([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [providers, setProviders] = useState([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  const loadSessions = () =>
    listSessions().then((res) => {
      const d = res?.data ?? res
      setSessions(Array.isArray(d) ? d : [])
    }).catch(() => {})

  useEffect(() => {
    loadSessions()
    listProviders().then((res) => {
      const d = res.data || res
      const list = d?.list || []
      setProviders(list)
      const def = list.find((p) => p.name === d?.default) || list[0]
      if (def) {
        setProvider(def.name)
        const defModel = (def.models || []).find((m) => m.default) || (def.models || [])[0]
        if (defModel?.id) setModel(defModel.id)
      }
    }).catch(() => {})
  }, [])

  const changeProvider = (name) => {
    setProvider(name)
    const p = providers.find((x) => x.name === name)
    const defModel = (p?.models || []).find((m) => m.default) || (p?.models || [])[0]
    setModel(defModel?.id || '')
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const openSession = (id) => {
    setActiveId(id)
    import('../api/ai').then(({ getSession }) =>
      getSession(id).then((res) => setMessages(res.data?.messages || [])).catch(() => {}),
    )
  }

  const newSession = () => {
    setActiveId('')
    setMessages([])
  }

  const removeSession = async (id) => {
    await deleteSession(id).catch(() => {})
    if (id === activeId) newSession()
    loadSessions()
  }

  const send = async () => {
    const content = input.trim()
    if (!content || streaming) return
    setInput('')
    setStreaming(true)
    setMessages((m) => [...m, { role: 'user', content }, { role: 'assistant', content: '' }])

    let ctrl = null
    try {
      // fetch 返回值用于中断流
      const promise = chatStream(
        { sessionId: activeId || undefined, message: content, provider, model },
        ({ event, data }) => {
          if (event === 'session') setActiveId(data)
          else if (event === 'delta')
            setMessages((m) => {
              const next = [...m]
              next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + data }
              return next
            })
          else if (event === 'error')
            setMessages((m) => {
              const next = [...m]
              next[next.length - 1] = { ...next[next.length - 1], content: `⚠️ ${data}` }
              return next
            })
        },
      )
      abortRef.current = { cancel: () => cancelChat().catch(() => {}) }
      await promise
    } catch (e) {
      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = { ...next[next.length - 1], content: `⚠️ ${e.message}` }
        return next
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
      loadSessions()
    }
  }

  const stop = () => abortRef.current?.cancel?.()

  return (
    <div className="flex h-full">
      {/* 会话列表 */}
      <div className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-neutral-700">{t('会话')}</span>
          <button onClick={newSession} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-primary-600">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer ${
                activeId === s.id ? 'bg-primary-50 text-primary-600' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
              onClick={() => openSession(s.id)}
            >
              <MessageSquare size={14} className="shrink-0" />
              <span className="flex-1 truncate">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeSession(s.id) }}
                className="hidden rounded p-0.5 text-neutral-400 hover:text-red-500 group-hover:block"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && <div className="px-3 py-6 text-center text-xs text-neutral-400">{t('暂无会话')}</div>}
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex flex-1 flex-col">
        {/* 顶栏：助手与模型选择 */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
          <span className="text-sm font-medium text-neutral-700">{t('AI 问答')}</span>
          <div className="flex items-center gap-2">
            <select
              value={provider}
              onChange={(e) => changeProvider(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none"
            >
              {providers.length === 0 && <option value="">{t('未配置 AI 助手')}</option>}
              {providers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label}{p.default ? t('（默认）') : ''}
                </option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!provider}
              className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none disabled:opacity-50"
            >
              {(providers.find((p) => p.name === provider)?.models || []).map((m) => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              {t('选择会话或直接输入消息开始对话（会自动创建会话）')}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`mb-4 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-primary-500 text-white' : 'bg-white text-neutral-700 border border-neutral-200'
              }`}>
                {m.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{m.content || '…'}</ReactMarkdown>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* 输入区 */}
        <div className="border-t border-neutral-200 bg-white p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              rows={2}
              placeholder={t('输入问题，Enter 发送，Shift+Enter 换行')}
              className="flex-1 resize-none rounded-xl border border-neutral-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400"
            />
            {streaming ? (
              <button onClick={stop} className="flex h-10 items-center gap-1.5 rounded-xl bg-neutral-200 px-4 text-sm text-neutral-600 hover:bg-neutral-300">
                <Square size={14} /> {t('停止')}
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim()} className="flex h-10 items-center gap-1.5 rounded-xl bg-primary-500 px-4 text-sm text-white hover:bg-primary-600 disabled:opacity-40">
                <Send size={14} /> {t('发送')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
