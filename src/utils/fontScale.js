// 全局字号缩放：基于 html 根字号（默认 14px），支持 Cmd/Ctrl +/-/0 调节并持久化
// Tailwind 全部使用 rem，因此调整 html font-size 即可整体缩放 UI

const BASE_FONT_SIZE = 14
const SCALE_KEY = 'ui.fontScale'
const MIN_SCALE = 0.7
const MAX_SCALE = 1.6
const STEP = 0.1

let scale = parseFloat(localStorage.getItem(SCALE_KEY)) || 1

function apply() {
  document.documentElement.style.fontSize = `${(BASE_FONT_SIZE * scale).toFixed(2)}px`
}

export function setFontScale(next) {
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(next * 100) / 100))
  localStorage.setItem(SCALE_KEY, String(scale))
  apply()
}

export function zoomIn() {
  setFontScale(scale + STEP)
}

export function zoomOut() {
  setFontScale(scale - STEP)
}

export function zoomReset() {
  setFontScale(1)
}

// 注册 Cmd/Ctrl + '='/'-'/'0' 快捷键（加 Shift 或纯 '=' 皆可）
export function initFontZoomShortcuts() {
  apply()
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key
      if (key === '=' || key === '+') {
        e.preventDefault()
        zoomIn()
      } else if (key === '-') {
        e.preventDefault()
        zoomOut()
      } else if (key === '0') {
        e.preventDefault()
        zoomReset()
      }
    },
    true
  )
}
