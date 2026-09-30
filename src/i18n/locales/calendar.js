// 日历统计（src/pages/CalendarStats.jsx）与按日题目列表（HeatmapDayProblemTable.jsx）
export default {
  '日历统计': 'Calendar',
  '复习热力图 · 按日期题目列表': 'Review heatmap · Problems by date',
  '复习热力图': 'Review heatmap',
  '以今天为结束日，向前 {days} 天 · 点击格子同步下方列表日期':
    'Ending today and covering the previous {days} days · Click a cell to sync the list below',
  '加载热力图失败，请稍后重试。': 'Failed to load the heatmap, please try again later.',
  '暂无热力图数据': 'No heatmap data yet',
  '加载题目列表…': 'Loading problems…',
  '加载列表失败，请稍后重试。': 'Failed to load the list, please try again later.',
  '题目列表': 'Problems',
  '题目列表类型': 'Problem list type',
  '今日题目': "Today's problems",
  '今日复习': "Today's reviews",
  '按日期筛选': 'Filter by date',
  '按 problems 创建时间筛选，即该日新创建的题目；与热力图悬停中的「N 道题」一致。':
    'Filters by problem creation time, i.e. problems created that day. Matches the "N problems" tooltip in the heatmap.',
  '按复习记录筛选（按 user_problem_id 去重）；同一 user_problem 当日多条复习合并为一行，次数为当日合计。':
    'Filters by review records (deduplicated by user_problem_id). Multiple reviews of the same problem that day are merged into one row, with the total count.',

  // 按日列表表头
  '题名': 'Title',
  '通过率': 'Acceptance',
  '难度': 'Difficulty',
  '出题频率': 'Frequency',
  '手感': 'Feel',
  '该日尚未录入题目': 'has no problems added yet',
  '当日无复习记录': 'has no review records',

  // 状态
  '未练习': 'Unpracticed',
  '一脸懵逼😳': 'Totally lost 😳',
  '未掌握': 'Not mastered',
  '半生不熟': 'Getting there',
  '需重练': 'Needs practice',
  '很稳': 'Solid',
  '复习中': 'Reviewing',
  '未知': 'Unknown',

  // 手感自评
  '秒杀': 'Instant',
  '拿捏': 'Smooth',
  '纠结': 'Tricky',
  '烧脑': 'Mind-bending',
  '地狱': 'Nightmare',
}
