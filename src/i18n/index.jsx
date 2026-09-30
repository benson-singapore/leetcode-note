import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import common from './locales/common'
import app from './locales/app'
import dashboard from './locales/dashboard'
import problems from './locales/problems'
import problemDetail from './locales/problemDetail'
import calendar from './locales/calendar'
import aiChat from './locales/aiChat'
import settings from './locales/settings'
import detailDrawer from './locales/detailDrawer'
import solutionSchemes from './locales/solutionSchemes'
import heatmap from './locales/heatmap'
import codeEditor from './locales/codeEditor'

export const LANGUAGE_KEY = 'app.ui_language'
export const LANGUAGE_CHANGED_EVENT = 'app-language-changed'

// 合并所有模块的字典。key 统一为中文原文，value 为英文。
const DICTIONARY = {
  ...common,
  ...app,
  ...dashboard,
  ...problems,
  ...problemDetail,
  ...calendar,
  ...aiChat,
  ...settings,
  ...detailDrawer,
  ...solutionSchemes,
  ...heatmap,
  ...codeEditor,
}

function readStoredLanguage() {
  if (typeof localStorage === 'undefined') return 'zh'
  return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh'
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage)

  // 同一窗口内的多处设置入口（设置页、侧边栏等）保持同步
  useEffect(() => {
    const sync = (event) => {
      const next = event?.detail === 'en' ? 'en' : 'zh'
      setLanguageState(next)
    }
    window.addEventListener(LANGUAGE_CHANGED_EVENT, sync)
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, sync)
  }, [])

  // 同步 <html lang>，便于无障碍与浏览器翻译识别
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  }, [language])

  const setLanguage = useCallback((next) => {
    const normalized = next === 'en' ? 'en' : 'zh'
    localStorage.setItem(LANGUAGE_KEY, normalized)
    setLanguageState(normalized)
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: normalized }))
  }, [])

  // t('已精通 {count} 题', { count }) 会对占位符做插值；缺参数时原样返回 key。
  const t = useCallback(
    (key, params) => {
      if (typeof key !== 'string' || key === '') return ''
      const template = language === 'en' ? DICTIONARY[key] || key : key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      )
    },
    [language]
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n 必须在 <I18nProvider> 内使用')
  return ctx
}
