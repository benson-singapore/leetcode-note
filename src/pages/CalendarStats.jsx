import { useState, useEffect, useCallback } from 'react'
import { Calendar, LayoutList } from 'lucide-react'
import { getHeatmap, getActivityDay, getUserProblemsOnDate, getProblem } from '../api/leetcode'
import { TrainingHeatmap } from '../components/TrainingHeatmap'
import { HeatmapDayProblemTable } from '../components/HeatmapDayProblemTable'
import { DetailDrawer } from '../components/DetailDrawer'

const emptyHeatmap = {
  startDate: '',
  endDate: '',
  days: 365,
  counts: {},
  problemCounts: {},
  total: 0,
}

function clampDateStr(value, min, max) {
  if (!min || !max) return value
  if (value < min) return min
  if (value > max) return max
  return value
}

// 日历统计：复习热力图 + 按日题目列表（今日题目 / 今日复习）
export default function CalendarStats() {
  const [heatmapData, setHeatmapData] = useState(emptyHeatmap)
  const [heatmapLoading, setHeatmapLoading] = useState(true)
  const [heatmapError, setHeatmapError] = useState(null)

  const [selectedDate, setSelectedDate] = useState('')
  const [listTab, setListTab] = useState('created')
  const [createdProblems, setCreatedProblems] = useState([])
  const [reviewProblems, setReviewProblems] = useState([])
  const [dayLoading, setDayLoading] = useState(false)
  const [dayError, setDayError] = useState(null)

  const [activeProblemId, setActiveProblemId] = useState(null)
  const [activeProblem, setActiveProblem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadHeatmap = useCallback(async () => {
    setHeatmapLoading(true)
    setHeatmapError(null)
    try {
      const res = await getHeatmap()
      setHeatmapData(res?.data || emptyHeatmap)
    } catch (e) {
      setHeatmapError(e)
      setHeatmapData(emptyHeatmap)
    } finally {
      setHeatmapLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHeatmap()
  }, [loadHeatmap])

  useEffect(() => {
    if (!heatmapData.startDate || !heatmapData.endDate) return
    setSelectedDate((prev) =>
      clampDateStr(prev || heatmapData.endDate, heatmapData.startDate, heatmapData.endDate)
    )
  }, [heatmapData.startDate, heatmapData.endDate])

  useEffect(() => {
    if (!selectedDate || !heatmapData.startDate || !heatmapData.endDate) return
    let cancel = false
    ;(async () => {
      setDayLoading(true)
      setDayError(null)
      try {
        const [createdRes, reviewedRes] = await Promise.all([
          getUserProblemsOnDate(selectedDate),
          getActivityDay({ date: selectedDate }),
        ])
        if (!cancel) {
          setCreatedProblems(createdRes?.data?.problems || [])
          setReviewProblems(reviewedRes?.data?.problems || [])
        }
      } catch (e) {
        if (!cancel) {
          setCreatedProblems([])
          setReviewProblems([])
          setDayError(e)
        }
      } finally {
        if (!cancel) setDayLoading(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [selectedDate, heatmapData.startDate, heatmapData.endDate])

  const onHeatmapDaySelect = useCallback((date) => {
    setSelectedDate(date)
  }, [])

  const onTableRowClick = useCallback((problemId) => {
    setActiveProblemId(problemId)
    setActiveProblem(null)
    setDetailLoading(true)
    getProblem(problemId)
      .then((res) => {
        setActiveProblem(res?.data || res)
      })
      .catch(() => {
        setActiveProblemId(null)
      })
      .finally(() => setDetailLoading(false))
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-white p-8 md:p-12">
      <div className="mx-auto max-w-6xl space-y-10 animate-in fade-in duration-700">
        <header className="space-y-1">
          <h1 className="text-lg font-black tracking-tight text-slate-900">日历统计</h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            复习热力图 · 按日题目列表
          </p>
        </header>

        <div className="rounded-[2.5rem] border border-slate-100 bg-white p-10 shadow-sm space-y-10">
          <div>
            <div className="mb-4 flex max-w-3xl flex-col items-center gap-2 text-center mx-auto">
              <h3 className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                <Calendar size={14} className="shrink-0 text-primary-500" /> 复习热力图
              </h3>
              <p className="text-[10px] font-bold leading-relaxed text-slate-400">
                以今天为结束日，向前 {heatmapData.days || 365} 天 · 格子颜色表示当日复习的不重复
                user_problem 数 · 点击格子同步下方列表日期
              </p>
            </div>
            {heatmapError && (
              <p className="mb-4 text-sm text-rose-600">加载热力图失败，请稍后重试。</p>
            )}
            {heatmapLoading ? (
              <div className="flex items-center gap-3 py-12 text-sm font-medium text-slate-400">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                加载中…
              </div>
            ) : heatmapData.startDate && heatmapData.endDate ? (
              <TrainingHeatmap
                startDate={heatmapData.startDate}
                endDate={heatmapData.endDate}
                days={heatmapData.days}
                counts={heatmapData.counts}
                problemCounts={heatmapData.problemCounts}
                total={heatmapData.total}
                selectedDate={selectedDate}
                onDaySelect={onHeatmapDaySelect}
              />
            ) : (
              <p className="py-8 text-sm text-slate-500">暂无热力图数据</p>
            )}
          </div>

          {!heatmapLoading && heatmapData.startDate && heatmapData.endDate && (
            <div className="border-t border-slate-100 pt-10">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <h3 className="flex shrink-0 items-center gap-3 text-sm font-black uppercase tracking-wide text-slate-800">
                    <span className="rounded-lg bg-primary-600 p-1.5 text-white shadow-sm">
                      <LayoutList size={16} />
                    </span>
                    题目列表
                  </h3>
                  <div
                    className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
                    role="tablist"
                    aria-label="题目列表类型"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={listTab === 'created'}
                      onClick={() => setListTab('created')}
                      className={`relative rounded-md px-4 py-1.5 text-[11px] font-black uppercase tracking-wide transition-all ${
                        listTab === 'created'
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 pr-2.5">今日题目</span>
                      {createdProblems.length > 0 && (
                        <span className="pointer-events-none absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] font-bold text-white shadow-sm">
                          {createdProblems.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={listTab === 'reviews'}
                      onClick={() => setListTab('reviews')}
                      className={`relative rounded-md px-4 py-1.5 text-[11px] font-black uppercase tracking-wide transition-all ${
                        listTab === 'reviews'
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 pr-2.5">今日复习</span>
                      {reviewProblems.length > 0 && (
                        <span className="pointer-events-none absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white shadow-sm">
                          {reviewProblems.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  按日期筛选
                  <input
                    type="date"
                    min={heatmapData.startDate}
                    max={heatmapData.endDate}
                    value={selectedDate}
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) return
                      setSelectedDate(clampDateStr(v, heatmapData.startDate, heatmapData.endDate))
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </label>
              </div>
              <p className="mb-4 text-[10px] font-bold text-slate-400">
                {listTab === 'created'
                  ? '按 problems 创建时间筛选，即该日新创建的题目；与热力图悬停中的「N 道题」一致。'
                  : '按复习记录筛选（按 user_problem_id 去重）；同一 user_problem 当日多条复习合并为一行，次数为当日合计。'}
              </p>
              {dayError && (
                <p className="mb-4 text-sm text-rose-600">加载列表失败，请稍后重试。</p>
              )}
              {dayLoading ? (
                <div className="flex items-center gap-3 py-12 text-sm font-medium text-slate-400">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                  加载题目列表…
                </div>
              ) : (
                <HeatmapDayProblemTable
                  problems={listTab === 'created' ? createdProblems : reviewProblems}
                  variant={listTab}
                  onRowClick={onTableRowClick}
                  selectedDateLabel={selectedDate}
                  activeProblemId={activeProblemId}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {(activeProblem || detailLoading) && activeProblemId && (
        <DetailDrawer
          activeProblem={activeProblem}
          onDeleted={() => {
            setActiveProblemId(null)
            setActiveProblem(null)
            loadHeatmap()
          }}
          onClose={() => {
            setActiveProblemId(null)
            setActiveProblem(null)
          }}
          loading={detailLoading}
        />
      )}
    </div>
  )
}
