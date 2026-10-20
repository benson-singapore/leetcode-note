import { get, post, del } from './client'

// ============ 今日目标 ============
export const getTodayDailyGoal = (params) => get('/api/v1/daily-goals/today', params)
export const getDailyGoalOptions = () => get('/api/v1/daily-goals/options')
export const generateDailyGoalAI = (data) => post('/api/v1/daily-goals/generate', data)
export const createDailyGoal = (data) => post('/api/v1/daily-goals', data)
export const clearTodayDailyGoal = (params) => del(`/api/v1/daily-goals/today${params?.date ? `?date=${encodeURIComponent(params.date)}` : ''}`)
