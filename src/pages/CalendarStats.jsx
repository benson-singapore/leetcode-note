import { useState, useEffect, useCallback } from 'react'
import { Calendar, LayoutList } from 'lucide-react'
import { getHeatmap, getActivityDay, getUserProblemsOnDate, getProblem, getSettings } from '../api/leetcode'
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
  const [dailyTarget, setDailyTarget] = useState(6)
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
    getSettings()
      .then((res) => {
        const settings = res?.data || res || {}
        const reviewTarget = Number(settings.daily_review_target) || 3
        const studyTarget = Number(settings.daily_study_target) || 3
        setDailyTarget(Math.max(1, reviewTarget + studyTarget))
      })
      .catch(() => {})
  }, [])

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
    <div className="h-full overflow-y-auto bg-white p-8 pt-5 md:px-12 md:pt-5">
      <div className="space-y-8 animate-in fade-in duration-700">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">日历统计</h1>
          <p className="text-xs font-normal tracking-wide text-slate-400">
            复习热力图 · 按日期题目列表
          </p>
        </header>

        {/* 复习热力图 */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <Calendar size={15} />
              </span>
              复习热力图
            </h3>
            <p className="text-xs font-normal leading-relaxed text-slate-400">
              以今天为结束日，向前 {heatmapData.days || 365} 天 · 点击格子同步下方列表日期
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
              dailyTarget={dailyTarget}
              total={heatmapData.total}
              selectedDate={selectedDate}
              onDaySelect={onHeatmapDaySelect}
            />
          ) : (
            <p className="py-8 text-sm text-slate-500">暂无热力图数据</p>
          )}
        </section>

        {/* 题目列表 */}
        {!heatmapLoading && heatmapData.startDate && heatmapData.endDate && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <h3 className="flex shrink-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-900">
                  <span className="rounded-lg bg-primary-600 p-1.5 text-white shadow-card">
                    <LayoutList size={16} />
                  </span>
                  题目列表
                </h3>
                <div
                  className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
                  role="tablist"
                  aria-label="题目列表类型"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={listTab === 'created'}
                    onClick={() => setListTab('created')}
                    className={`relative rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                      listTab === 'created'
                        ? 'bg-white font-semibold text-primary-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 pr-1">今日题目</span>
                    {createdProblems.length > 0 && (
                      <span
                        className={`pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium text-white shadow-sm ${
                          listTab === 'created' ? 'bg-primary-600' : 'bg-slate-400'
                        }`}
                      >
                        {createdProblems.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={listTab === 'reviews'}
                    onClick={() => setListTab('reviews')}
                    className={`relative rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                      listTab === 'reviews'
                        ? 'bg-white font-semibold text-primary-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5 pr-1">今日复习</span>
                    {reviewProblems.length > 0 && (
                      <span
                        className={`pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-medium text-white shadow-sm ${
                          listTab === 'reviews' ? 'bg-primary-600' : 'bg-slate-400'
                        }`}
                      >
                        {reviewProblems.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-600">
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
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium tabular-nums text-slate-700 shadow-sm outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-50"
                />
              </label>
            </div>
            <p className="text-xs font-normal text-slate-400">
              {listTab === 'created'
                ? '按 problems 创建时间筛选，即该日新创建的题目；与热力图悬停中的「N 道题」一致。'
                : '按复习记录筛选（按 user_problem_id 去重）；同一 user_problem 当日多条复习合并为一行，次数为当日合计。'}
            </p>
            {dayError && (
              <p className="text-sm text-rose-600">加载列表失败，请稍后重试。</p>
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
          </section>
        )}
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
