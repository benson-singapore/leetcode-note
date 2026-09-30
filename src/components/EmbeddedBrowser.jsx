import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ExternalLink, X, Globe } from 'lucide-react'
import { getSettings } from '../api/leetcode'
import { resolveBase } from '../api/client'
import { useI18n } from '../i18n'

// 是否运行在 Tauri 环境（浏览器调试时降级为 window.open）
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// 并发去重：多个实例同时挂载时只发起一次打开请求
let openingPromise = null
// Keep the close timer outside the component: a fast reopen creates a new
// component instance, so an instance-local ref cannot cancel the old close.
let closingTimer = null
const openEmbedded = (url, notesEnabled, apiHost, toolMode) => {
  if (closingTimer) {
    clearTimeout(closingTimer)
    closingTimer = null
  }
  if (!openingPromise) {
    openingPromise = invoke('open_embedded_browser', { url, notesEnabled, apiHost, toolMode }).finally(() => {
      openingPromise = null
    })
  }
  return openingPromise
}

/**
 * 内嵌 LeetCode 浏览器：
 * - 在 Tauri 中通过 invoke 打开独立原生窗口（public/embed-browser.html），
 *   窗口内以 iframe 展示 LeetCode 页面，右上角提供「默认浏览器打开」。
 * - 非 Tauri 环境（纯浏览器调试）时退化为 window.open。
 *
 * 注意：原生窗口与登录窗口共用默认 WebView 数据存储，
 * 因此登录后内嵌浏览器同样是已登录状态。
 */
export function EmbeddedBrowser({ url, toolMode = 'notes', onClose }) {
  const { t } = useI18n()
  const [noticeVisible, setNoticeVisible] = useState(true)

  useEffect(() => {
    // 取消上一次卸载时排队的延迟关闭
    // （React 18 StrictMode 开发模式下 effect 会 mount → unmount → mount）
    const open = async () => {
      if (!isTauri) {
        const target = new URL(url)
        target.searchParams.set('__lcn_tool_mode', toolMode)
        window.open(target.toString(), '_blank', 'noreferrer')
        onClose?.()
        return
      }
      try {
        const [settings, apiHost] = await Promise.all([getSettings(), resolveBase()])
        const values = settings?.data || settings || {}
        await openEmbedded(
          url,
          values.embedded_notes_enabled !== 'false',
          apiHost || 'http://127.0.0.1:17877',
          toolMode
        )
      } catch (error) {
        console.error('打开内嵌浏览器失败:', error)
        // 降级：尝试用系统默认浏览器
        invoke('open_in_system_browser', { url }).catch(() => {})
      }
    }

    open()

    return () => {
      // 延迟关闭：若 StrictMode 立即重挂载则取消，真正卸载时才关窗口
      if (closingTimer) clearTimeout(closingTimer)
      closingTimer = setTimeout(() => {
        closingTimer = null
        if (isTauri) {
          invoke('close_embedded_browser').catch(() => {})
        }
      }, 250)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, toolMode])

  useEffect(() => {
    setNoticeVisible(true)
    const timer = window.setTimeout(() => setNoticeVisible(false), 5000)
    return () => window.clearTimeout(timer)
  }, [url])

  // 用户通过原生标题栏关闭内嵌窗口时，同步清理主窗口中的浮层
  useEffect(() => {
    if (!isTauri) return
    let disposed = false
    const unlisten = listen('leetcode-embed-closed', () => {
      if (!disposed) onClose?.()
    })
    return () => {
      disposed = true
      unlisten.then((fn) => fn()).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!noticeVisible) return null

  return (
    <div className="absolute right-5 bottom-5 z-20 flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Globe size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-700 leading-tight">
          内嵌浏览器已打开
        </p>
        <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate max-w-[220px]">
          {url}
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          if (isTauri) {
            try {
              await invoke('open_in_system_browser', { url })
            } catch (error) {
              console.error(t('打开系统浏览器失败:'), error)
            }
          } else {
            window.open(url, '_blank', 'noreferrer')
          }
        }}
        title={t('使用系统默认浏览器打开此页面')}
        className="flex h-8 items-center gap-1.5 rounded-full bg-primary-600 px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-primary-700 active:scale-95 transition-all"
      >
        <ExternalLink size={12} />
        {t('默认浏览器打开')}
      </button>
      <button
        type="button"
        onClick={onClose}
        title={t('关闭内嵌浏览器')}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:bg-slate-50 hover:text-slate-600 transition-all"
      >
        <X size={15} />
      </button>
    </div>
  )
}
