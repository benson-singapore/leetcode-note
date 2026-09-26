// 代码语言解析：跟随「设置 → 复习偏好 → 默认目标语言」自动切换
// 用于代码编辑器 / 解题方案代码面板的标签与高亮语言
import { getSettings } from '../api/leetcode'

// 设置项名称 → LeetCode codeSnippets 的 langSlug（含别名列表，按优先级排列）
export const SETTING_LANG_TO_SLUGS = {
  'Python 3': ['python3', 'python'],
  Python: ['python'],
  Java: ['java'],
  'C++': ['cpp'],
  JavaScript: ['javascript'],
  TypeScript: ['typescript'],
  Go: ['go'],
  Rust: ['rust'],
  'C#': ['csharp'],
}

const DEFAULT_SETTING_LANG = 'Python 3'

// 从设置接口读取默认语言并映射为 langSlug；失败时返回 ''（由调用方回退到首个片段）
export async function fetchDefaultLangSlug() {
  try {
    const res = await getSettings()
    const s = res?.data || res || {}
    const name = s.default_language || DEFAULT_SETTING_LANG
    return SETTING_LANG_TO_SLUGS[name]?.[0] || ''
  } catch {
    return ''
  }
}

/**
 * 从题目的 codeSnippets 中按默认语言优先挑选 langSlug：
 * 1. 优先返回与默认语言匹配的片段 langSlug；
 * 2. 片段中没有该语言时，直接使用默认语言本身的 langSlug（仅作为标签与高亮语言）；
 * 3. 默认语言不可用（设置未加载 / 请求失败）时回退到第一个片段。
 */
export function resolveLangSlug(codeSnippets, defaultSlug) {
  const list = codeSnippets || []
  if (defaultSlug) {
    const aliases = SETTING_LANG_TO_SLUGS[settingNameFromSlug(defaultSlug)] || [defaultSlug]
    const hit = list.find((s) => aliases.includes(s.langSlug || s.lang))
    if (hit) return hit.langSlug || hit.lang
    return defaultSlug
  }
  return list[0]?.langSlug || list[0]?.lang || 'java'
}

// 由 langSlug 反查设置项名称（用于取别名列表）
function settingNameFromSlug(slug) {
  return Object.keys(SETTING_LANG_TO_SLUGS).find(
    (name) => SETTING_LANG_TO_SLUGS[name][0] === slug
  )
}
