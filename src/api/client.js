// HTTP 客户端：自动探测 sidecar 地址
// - Tauri WebView 内：通过 Rust 命令 get_server_info 获取动态端口
// - 浏览器调试：走 Vite 代理（/api -> 127.0.0.1:17877）

let serverInfo = null
let pending = null

export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export async function resolveBase() {
  if (!isTauri()) return ''
  if (serverInfo) return serverInfo.base_url
  if (!pending) {
    const { invoke } = await import('@tauri-apps/api/core')
    pending = invoke('get_server_info').then((info) => {
      serverInfo = info
      return info
    })
  }
  await pending
  return serverInfo.base_url
}

export async function request(path, { method = 'GET', body, headers, ...rest } = {}) {
  const base = await resolveBase()
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[${res.status}] ${text || res.statusText}`)
  }
  return res.json()
}

export function get(path, params) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  return request(`${path}${query}`)
}

export function post(path, body) {
  return request(path, { method: 'POST', body })
}

export function put(path, body) {
  return request(path, { method: 'PUT', body })
}

export function del(path) {
  return request(path, { method: 'DELETE' })
}
