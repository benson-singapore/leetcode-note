import { get, post, put, del } from './client'

// ============ 题目 ============
export const getProblems = (params) => get('/api/v1/problems', params)
export const getProblem = (id) => get(`/api/v1/problems/${id}`)
export const createProblem = (data) => post('/api/v1/problems', data)
export const updateProblem = (id, data) => put(`/api/v1/problems/${id}`, data)
export const deleteProblem = (id) => del(`/api/v1/problems/${id}`)
export const getProblemStats = () => get('/api/v1/problems/stats')
export const fetchLeetCodeProblem = (params) => get('/api/v1/leetcode/fetch', params)
export const getSolutionDemo = (id) => get(`/api/v1/problems/${id}/solution-demo`)
export const putSolutionDemo = (id, html) =>
  put(`/api/v1/problems/${id}/solution-demo`, { html })

// ============ 用户题目记录 ============
export const getUserProblems = (params) => get('/api/v1/user-problems', params)
export const getUserProblem = (id) => get(`/api/v1/user-problems/${id}`)
export const createUserProblem = (data) => post('/api/v1/user-problems', data)
export const updateUserProblem = (id, data) => put(`/api/v1/user-problems/${id}`, data)
export const deleteUserProblem = (id) => del(`/api/v1/user-problems/${id}`)
export const getUserProblemStats = () => get('/api/v1/user-problems/stats')
export const getUserProblemsOnDate = (date) => get('/api/v1/user-problems/on-date', { date })

// ============ 复习 ============
export const getReviews = (userProblemId) => get(`/api/v1/reviews/user-problem/${userProblemId}`)
export const createReview = (data) => post('/api/v1/reviews', data)
export const updateReview = (id, data) => put(`/api/v1/reviews/${id}`, data)
export const deleteReview = (id) => del(`/api/v1/reviews/${id}`)
export const getHeatmap = () => get('/api/v1/reviews/activity-heatmap')
export const getActivityDay = (params) => get('/api/v1/reviews/activity-day', params)

// ============ 标签 ============
export const getTagSummary = () => get('/api/v1/tags')

// ============ 设置 ============
export const getSettings = () => get('/api/v1/settings')
export const getSetting = (key) => get(`/api/v1/settings/${key}`)
export const updateSetting = (key, value) => put(`/api/v1/settings/${key}`, { value })
export const updateSettings = (kv) => put('/api/v1/settings', kv)
