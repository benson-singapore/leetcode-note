import { invoke } from '@tauri-apps/api/core'
import { getSettings } from '../api/leetcode'
import { isTauri } from '../api/client'

// 题目页打开方式（设置 → 复习偏好 → 题目页打开方式）：'embedded' | 'system'
// 带短 TTL 缓存，避免连续点击题目时重复请求设置接口
let openModeCache = { value: null, ts: 0 }

export async function getBrowserOpenMode() {
  const now = Date.now()
  if (openModeCache.value && now - openModeCache.ts < 5000) {
    return openModeCache.value
  }
  try {
    const res = await getSettings()
    const mode = (res?.data || res || {}).leetcode_open_mode || 'embedded'
    openModeCache = { value: mode, ts: now }
    return mode
  } catch {
    return openModeCache.value || 'embedded'
  }
}

// 用系统默认浏览器打开 URL（非 Tauri 环境退化为 window.open）
export function openInSystemBrowser(url) {
  if (isTauri()) {
    return invoke('open_in_system_browser', { url }).catch((e) =>
      console.error('打开系统浏览器失败:', e)
    )
  }
  window.open(url, '_blank', 'noreferrer')
  return Promise.resolve()
}
