import { request, get, post, put, del, isTauri } from './client'

// ============ Provider / 设置 ============
export const listProviders = () => get('/api/v1/ai/providers')
export const getAISettings = () => get('/api/v1/ai/settings')

// ============ AI 助手（多实例，可自定义 API / CLI）============
export const listAssistants = () => get('/api/v1/ai/assistants')
export const createAssistant = (data) => post('/api/v1/ai/assistants', data)
export const updateAssistant = (id, data) => put(`/api/v1/ai/assistants/${id}`, data)
export const deleteAssistant = (id) => del(`/api/v1/ai/assistants/${id}`)
export const setDefaultAssistant = (id) => put(`/api/v1/ai/assistants/${id}/default`, {})
export const toggleAssistant = (id, enabled) => put(`/api/v1/ai/assistants/${id}/enabled`, { enabled })
export const toggleModel = (assistantId, modelId, enabled) =>
  put(`/api/v1/ai/assistants/${assistantId}/models/${encodeURIComponent(modelId)}/enabled`, { enabled })
// 从 CLI 本地配置尽力发现可用模型（codex / claude）
export const listCLIModels = (kind) => get(`/api/v1/ai/cli/models?kind=${encodeURIComponent(kind)}`)
// 连通性测速：默认取第一个启用模型发一条最小消息
export const testAssistant = (id) => post(`/api/v1/ai/assistants/${id}/test`, {})

// ============ 会话 ============
export const listSessions = () => get('/api/v1/ai/sessions')
export const createSession = (data) => post('/api/v1/ai/sessions', data)
export const getSession = (id) => get(`/api/v1/ai/sessions/${id}`)
export const updateSession = (id, data) => put(`/api/v1/ai/sessions/${id}`, data)
export const deleteSession = (id) => del(`/api/v1/ai/sessions/${id}`)
export const cancelChat = () => post('/api/v1/ai/chat/cancel')

// ============ SSE 流式对话 ============
// POST /api/v1/ai/chat，解析 "data: {...}" 帧，回调 onEvent({event, data})
// 返回原始 Response 供取消
export async function chatStream(body, onEvent) {
  let url
  if (isTauri()) {
    // Tauri 内：fetch 绝对地址（client.js 同款探测逻辑）
    const { invoke } = await import('@tauri-apps/api/core')
    const info = await invoke('get_server_info')
    url = `${info.base_url}/api/v1/ai/chat`
  } else {
    url = '/api/v1/ai/chat'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${text || res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // 按帧拆分（帧以空行结尾）
    const frames = buffer.split('\n\n')
    buffer = frames.pop()
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        onEvent(JSON.parse(payload))
      } catch {
        // 非法帧忽略
      }
    }
  }
  return res
}
