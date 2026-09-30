import { useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

// 月份缩写：英文界面用英文，其余沿用中文
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const LEVEL_CLASS = [
  'bg-slate-100 border border-slate-200/70',
  'bg-emerald-200 border border-emerald-200/50',
  'bg-emerald-400 border border-emerald-400/50',
  'bg-emerald-600 border border-emerald-600/50',
  'bg-emerald-800 border border-emerald-800/50',
]

function parseYMD(s) {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function formatYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function levelForCount(c, dailyTarget) {
  if (c <= 0) return 0
  const target = Math.max(1, Number(dailyTarget) || 1)
  if (c >= target) return 4
  if (c * 4 >= target * 3) return 3
  if (c * 2 >= target) return 2
  if (c * 4 >= target) return 1
  return 1
}

/** 含首尾：startKey ~ endKey（YYYY-MM-DD 字典序可比） */
function inRollingRange(key, startKey, endKey) {
  return key >= startKey && key <= endKey
}

/** GitHub 风格周列：从含窗口起点的那一周前的周日，到含窗口终点的那一周周六 */
function buildWeeksForRange(startDateStr, endDateStr, counts, problemCounts) {
  const rangeStart = parseYMD(startDateStr)
  const rangeEnd = parseYMD(endDateStr)

  const cur = new Date(rangeStart)
  cur.setDate(cur.getDate() - cur.getDay())

  const endSat = new Date(rangeEnd)
  endSat.setDate(rangeEnd.getDate() + (6 - rangeEnd.getDay()))

  const weeks = []
  let week = []
  const d = new Date(cur)
  while (d <= endSat) {
    const key = formatYMD(d)
    const inRange = inRollingRange(key, startDateStr, endDateStr)
    // 复习记录数 + 新题目数，只要有一个就显示
    const reviewCount = inRange ? counts[key] ?? 0 : 0
    const problemCount = inRange ? problemCounts[key] ?? 0 : 0
    const count = reviewCount + problemCount // 合并计数用于着色
    week.push({ date: key, count, reviewCount, problemCount, inRange })
    if (d.getDay() === 6) {
      weeks.push(week)
      week = []
    }
    d.setDate(d.getDate() + 1)
  }
  if (week.length) weeks.push(week)
  return weeks
}

function monthLabelsForWeeks(weeks, language) {
  const months = language === 'en' ? MONTH_EN : MONTH_ZH
  let prevKey = null
  return weeks.map((w) => {
    const firstIn = w.find((c) => c.inRange)
    if (!firstIn) return ''
    const d = parseYMD(firstIn.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (key === prevKey) return ''
    prevKey = key
    return months[d.getMonth()]
  })
}

function cellClass(cell, dailyTarget) {
  if (!cell.inRange) {
    return 'bg-slate-50/80 border border-transparent'
  }
  const lv = levelForCount(cell.count, dailyTarget)
  return LEVEL_CLASS[lv]
}

const ROW_LABELS_ZH = ['日', '', '二', '', '四', '', '六']
const ROW_LABELS_EN = ['S', '', 'T', '', 'T', '', 'S']

function HeatmapTooltip({ tip }) {
  const { t } = useI18n()
  if (!tip) return null
  return createPortal(
    <div
      className="fixed z-[200] px-3 py-2 rounded-lg bg-slate-900 text-white text-xs shadow-overlay pointer-events-none -translate-x-1/2 -translate-y-full"
      style={{ left: tip.x, top: tip.y - 8 }}
      role="tooltip"
    >
      <div className="font-mono text-[11px] text-slate-400 mb-0.5">{tip.date}</div>
      {tip.inRange ? (
        <>
          {tip.problems > 0 && (
            <div className="font-semibold text-base text-white tabular-nums">{tip.problems} {t('道新题')}</div>
          )}
          {tip.reviews > 0 && (
            <div className="text-[11px] text-slate-300 mt-0.5 tabular-nums">{tip.reviews} {t('条复习记录')}</div>
          )}
          {tip.reviews === 0 && tip.problems === 0 && (
            <div className="text-[11px] text-slate-400">{t('无活动')}</div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-slate-400">{t('不在统计窗口内')}</div>
      )}
    </div>,
    document.body
  )
}

export function TrainingHeatmap({
  startDate,
  endDate,
  counts,
  problemCounts,
  dailyTarget = 4,
  total,
  days = 365,
  selectedDate,
  onDaySelect,
}) {
  const { t, language } = useI18n()
  const [tip, setTip] = useState(null)

  const weeks = useMemo(
    () => buildWeeksForRange(startDate, endDate, counts || {}, problemCounts || {}),
    [startDate, endDate, counts, problemCounts]
  )
  const monthLabels = useMemo(() => monthLabelsForWeeks(weeks, language), [weeks, language])

  const showTip = useCallback((e, cell) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top
    if (!cell.inRange) {
      setTip({ x, y, date: cell.date, inRange: false })
      return
    }
    const reviews = cell.reviewCount ?? 0 // 复习记录数（按 user_problem_id 去重）
    const problems = cell.problemCount ?? 0 // 新创建的题目数
    setTip({
      x,
      y,
      date: cell.date,
      inRange: true,
      reviews, // 复习记录数
      problems, // 新创建题目数
    })
  }, [])

  const hideTip = useCallback(() => setTip(null), [])

  return (
    <div className="flex w-full flex-col">
      <HeatmapTooltip tip={tip} />
      <div className="flex w-full max-w-full justify-center overflow-x-auto pb-1">
        <div className="flex w-max min-w-0 shrink-0 gap-2">
          <div
            className="flex select-none shrink-0 flex-col gap-1 pt-[24px] pr-1.5 text-[10px] font-medium text-slate-400"
            aria-hidden
          >
            {(language === 'en' ? ROW_LABELS_EN : ROW_LABELS_ZH).map((lab, i) => (
              <span key={i} className="flex h-3.5 w-5 items-center justify-end text-[10px] leading-none">
                {lab}
              </span>
            ))}
          </div>
          <div className="min-w-0 shrink-0">
            <div className="mb-1 flex min-h-[18px] items-end gap-1">
              {weeks.map((_, wi) => (
                <div key={wi} className="w-3.5 flex shrink-0 justify-center">
                  <span className="whitespace-nowrap text-[10px] font-medium leading-none text-slate-400">
                    {monthLabels[wi] || '\u00a0'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-1" onMouseLeave={hideTip}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex shrink-0 flex-col gap-1">
                  {week.map((cell) => (
                    <div
                      key={cell.date}
                      onMouseEnter={(e) => showTip(e, cell)}
                      onFocus={(e) => showTip(e, cell)}
                      onBlur={hideTip}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        hideTip()
                        if (cell.inRange) onDaySelect?.(cell.date)
                      }}
                      tabIndex={0}
                      role={cell.inRange ? 'button' : undefined}
                      className={`h-3.5 w-3.5 rounded-[3px] transition-transform outline-none focus:ring-2 focus:ring-primary-400 ${
                        cell.inRange
                          ? 'cursor-pointer hover:z-10 hover:ring-2 hover:ring-primary-300/80'
                          : ''
                      } ${
                        cell.inRange && cell.date === selectedDate
                          ? 'z-20 ring-2 ring-primary-700 ring-offset-1 ring-offset-white'
                          : ''
                      } ${cellClass(cell, dailyTarget)}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-normal text-slate-500">{t('更少')}</span>
          <div className="flex items-center gap-0.5">
            {LEVEL_CLASS.map((cls, i) => (
              <div key={i} className={`h-3.5 w-3.5 rounded-[3px] ${cls}`} />
            ))}
          </div>
          <span className="font-normal text-slate-500">{t('更多')}</span>
        </div>
        <p className="font-normal tabular-nums text-slate-400">
          {t('最近 {days} 天（{start} ~ {end}）· 每日目标 {target} 题 · 复习累计', { days, start: startDate, end: endDate, target: dailyTarget })}{' '}
          <span className="font-semibold text-primary-700">{total}</span> {t('条（按 user_problem 逐日计）')}
        </p>
      </div>
    </div>
  )
}
