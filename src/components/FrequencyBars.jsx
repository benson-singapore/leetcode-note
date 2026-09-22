export function FrequencyBars({ score }) {
  // 将出题频率转换为 0-10 的柱子数量
  const barCount = Math.round((score || 0) / 10)

  return (
    <div className="flex h-3 items-end gap-0.5">
      {[...Array(10)].map((_, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all duration-500 ${
            i < barCount ? 'h-full bg-amber-400' : 'h-1/2 bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}
