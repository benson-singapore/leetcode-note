import { ChevronRight } from 'lucide-react'
import { FrequencyBars } from './FrequencyBars'

const OFFICIAL_DIFFICULTIES = {
  Easy: { color: 'text-emerald-500 bg-emerald-50 border-emerald-100', label: '简单' },
  Medium: { color: 'text-amber-500 bg-amber-50 border-amber-100', label: '中等' },
  Hard: { color: 'text-rose-500 bg-rose-50 border-rose-100', label: '困难' },
}

const PERSONAL_RATINGS = {
  1: { label: '秒杀', icon: '⚡' },
  2: { label: '拿捏', icon: '👌' },
  3: { label: '纠结', icon: '🤔' },
  4: { label: '烧脑', icon: '🤯' },
  5: { label: '地狱', icon: '💀' },
}

const STATUS_MAP = {
  Unpracticed: { label: '未练习', light: 'bg-slate-50 text-slate-600' },
  Confused: { label: '一脸懵逼😳', light: 'bg-red-50 text-red-600' },
  New: { label: '未掌握', light: 'bg-blue-50 text-blue-600' },
  Struggling: { label: '半生不熟', light: 'bg-orange-50 text-orange-600' },
  Relearning: { label: '需重练', light: 'bg-yellow-50 text-yellow-700' },
  Stable: { label: '很稳', light: 'bg-cyan-50 text-cyan-700' },
  Reviewing: { label: '复习中', light: 'bg-purple-50 text-purple-600' },
  Mastered: { label: '已精通', light: 'bg-emerald-50 text-emerald-700' },
}

/**
 * 与题库列表同列宽与样式。
 * variant 仅影响无数据时的提示文案。
 */
export function HeatmapDayProblemTable({
  problems,
  activeProblemId,
  onRowClick,
  selectedDateLabel,
  variant = 'reviews',
}) {
  const emptyText =
    variant === 'created'
      ? `${selectedDateLabel} 该日尚未录入题目`
      : `${selectedDateLabel} 当日无复习记录`

  if (!problems || problems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-14 text-center text-sm text-slate-400">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-card">
      <div className="grid grid-cols-12 items-center border-b border-slate-100 bg-slate-50/80 px-8 py-3.5 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">
        <div className="col-span-1">#</div>
        <div className="col-span-4">题名</div>
        <div className="col-span-1 text-center">通过率</div>
        <div className="col-span-1 text-center">难度</div>
        <div className="col-span-2 text-center">出题频率</div>
        <div className="col-span-1 text-center">手感</div>
        <div className="col-span-2 pr-4 text-right uppercase">Status</div>
      </div>

      <div className="divide-y divide-slate-50">
        {problems.map((p) => (
          <div
            key={`${p.id}-${p.userProblemId}`}
            role="button"
            tabIndex={0}
            onClick={() => onRowClick?.(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onRowClick?.(p.id)
              }
            }}
            className={`group grid grid-cols-12 items-center border-l-4 px-8 py-3 cursor-pointer transition-all hover:bg-primary-50/40 ${
              activeProblemId === p.id ? 'bg-primary-50/60 border-primary-600' : 'border-transparent'
            }`}
          >
            <div className="col-span-1 font-mono text-[11px] font-normal tabular-nums text-slate-300 group-hover:text-primary-500">
              {p.lcId}
            </div>
            <div className="col-span-4 flex items-center overflow-hidden pr-4">
              <span className="truncate text-[13px] font-normal text-slate-700 transition-colors group-hover:text-primary-800">
                {p.translatedTitle || p.title}
              </span>
            </div>
            <div className="col-span-1 text-center font-mono text-[11px] tabular-nums text-slate-400">
              {p.passRate}
            </div>
            <div className="col-span-1 flex justify-center">
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-tighter ${
                  OFFICIAL_DIFFICULTIES[p.difficulty]?.color ||
                  'text-slate-500 bg-slate-50 border-slate-100'
                }`}
              >
                {OFFICIAL_DIFFICULTIES[p.difficulty]?.label || p.difficulty || '—'}
              </span>
            </div>
            <div className="col-span-2 flex justify-center group/freq">
              <div className="relative">
                <FrequencyBars score={p.frequency} />
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/freq:opacity-100">
                  {p.frequency ? `出题频率 ${Number(p.frequency).toLocaleString()}` : '-'}
                </div>
              </div>
            </div>
            <div className="col-span-1 flex justify-center text-sm">
              {PERSONAL_RATINGS[p.personalDifficulty || 3]?.icon || '—'}
            </div>
            <div className="col-span-2 flex items-center justify-end gap-4">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-widest ${
                  STATUS_MAP[p.status]?.light || 'bg-slate-50 text-slate-600'
                }`}
              >
                {STATUS_MAP[p.status]?.label || p.status || '未知'}
              </span>
              <ChevronRight
                size={14}
                className="text-slate-200 transition-all group-hover:translate-x-1 group-hover:text-primary-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
