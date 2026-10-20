package models

import "time"

// Problem 题目表
type Problem struct {
	ID                string `json:"id"`
	LcID              string `json:"lc_id"`
	LcFrontendID      int    `json:"lc_frontend_id"`
	Title             string `json:"title"`
	TitleSlug         string `json:"title_slug"`
	TranslatedTitle   string `json:"translated_title"`
	Difficulty        string `json:"difficulty"`
	Content           string `json:"content"`
	TranslatedContent string `json:"translated_content"`
	CategoryTitle     string `json:"category_title"`
	TopicTags         string `json:"topic_tags"`
	CodeSnippets      string `json:"code_snippets"`
	ExampleTestcases  string `json:"example_testcases"`
	SampleTestCase    string `json:"sample_test_case"`
	Likes             int    `json:"likes"`
	Dislikes          int    `json:"dislikes"`
	IsPaidOnly        bool   `json:"is_paid_only"`
	Stats             string `json:"stats"`
	PassRate          string `json:"pass_rate"`
	Frequency         int    `json:"frequency"`
	Description       string `json:"description"`
	Examples          string `json:"examples"`
	Constraints       string `json:"constraints"`
	SimilarQuestions  string `json:"similar_questions"`
	PositionLevelTags string `json:"position_level_tags"`
	HasHtmlDemo       int    `json:"has_html_demo"` // 1 = 存在解题演示 HTML 文件
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

// UserProblem 用户题目记录表
type UserProblem struct {
	ID                 string     `json:"id"`
	ProblemID          string     `json:"problem_id"`
	Problem            Problem    `json:"problem,omitempty"`
	PersonalDifficulty int        `json:"personal_difficulty"`
	Status             string     `json:"status"`          // 默认值: "Unpracticed"
	ProgressStatus     string     `json:"progress_status"` // Unpracticed | Reviewing | Mastered
	ReviewCount        int        `json:"review_count"`
	Notes              string     `json:"notes"`
	Code               string     `json:"code"`
	LastReview         *time.Time `json:"last_review"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	HasHtmlDemo        int        `json:"has_html_demo"`
}

// ProblemTag 题目标签表
type ProblemTag struct {
	ID        string    `json:"id"`
	ProblemID string    `json:"problem_id"`
	Tag       string    `json:"tag"`
	CreatedAt time.Time `json:"created_at"`
}

// Review 复习记录表
type Review struct {
	ID                 string    `json:"id"`
	UserProblemID      string    `json:"user_problem_id"`
	ReviewDate         time.Time `json:"review_date"`
	Status             string    `json:"status"`
	ProgressStatus     string    `json:"progress_status"`
	PersonalDifficulty int       `json:"personal_difficulty"`
	Comment            string    `json:"comment"`
	Code               string    `json:"code"`
	CodeLanguage       string    `json:"code_language"`
	CreatedAt          time.Time `json:"created_at"`
}

// SolutionScheme 解题方案表：一道题的多种解法（默认实现不落库，额外方案存此表）
type SolutionScheme struct {
	ID        string    `json:"id"`
	ProblemID string    `json:"problem_id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	HtmlDemo  string    `json:"html_demo"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SaveSolutionSchemeRequest 创建/更新解题方案请求
type SaveSolutionSchemeRequest struct {
	Name *string `json:"name,omitempty"`
	Code *string `json:"code,omitempty"`
	Html *string `json:"html,omitempty"` // 传 nil 表示不修改对应字段
}

// Pagination 分页对象
type Pagination struct {
	Total      int64       `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
	TotalPages int64       `json:"total_pages"`
	Items      interface{} `json:"items"`
}

// CreateProblemRequest 创建题目请求
type CreateProblemRequest struct {
	LcID        string   `json:"lc_id" binding:"required"`
	Title       string   `json:"title" binding:"required"`
	Difficulty  string   `json:"difficulty" binding:"required"`
	PassRate    string   `json:"pass_rate"`
	Frequency   int      `json:"frequency"`
	Description string   `json:"description"`
	Examples    string   `json:"examples"`
	Constraints string   `json:"constraints"`
	Tags        []string `json:"tags"`
}

// CreateUserProblemRequest 创建用户题目请求
type CreateUserProblemRequest struct {
	ProblemID          string `json:"problem_id" binding:"required"`
	PersonalDifficulty int    `json:"personal_difficulty"`
	Status             string `json:"status"`
	ProgressStatus     string `json:"progress_status"`
	Notes              string `json:"notes"`
	Code               string `json:"code"`
}

// UpdateUserProblemRequest 更新用户题目请求
type UpdateUserProblemRequest struct {
	PersonalDifficulty int    `json:"personalDifficulty"`
	Status             string `json:"status"`
	ProgressStatus     string `json:"progressStatus"`
	Notes              string `json:"notes"`
	Code               string `json:"code"`
}

// CreateReviewRequest 创建复习记录请求
type CreateReviewRequest struct {
	UserProblemID      string `json:"user_problem_id" binding:"required"`
	Status             string `json:"status" binding:"required"`
	ProgressStatus     string `json:"progress_status"`
	PersonalDifficulty int    `json:"personal_difficulty"`
	Comment            string `json:"comment"`
	Code               string `json:"code"`
	CodeLanguage       string `json:"code_language"`
}

// StatsResponse 统计数据响应
type StatsResponse struct {
	Total       int64 `json:"total"`
	Mastered    int64 `json:"mastered"`
	New         int64 `json:"new"`
	Struggling  int64 `json:"struggling"`
	Reviewing   int64 `json:"reviewing"`
	Confused    int64 `json:"confused"`
	Unpracticed int64 `json:"unpracticed"`
}

// ProblemDetail 题目详情（含 user_problems 和复习统计）
type ProblemDetail struct {
	Problem
	UserProblemID      string     `json:"user_problem_id"`
	PersonalDifficulty int        `json:"personal_difficulty"`
	Status             string     `json:"status"`
	ProgressStatus     string     `json:"progressStatus"`
	Notes              string     `json:"notes"`
	Code               string     `json:"code"`
	LastReview         *time.Time `json:"last_review"`
	ReviewCount        int        `json:"review_count"`
}

// ActivityDayProblem 热力图按日题目列表（与前端题库表格字段对齐）
type ActivityDayProblem struct {
	ID                 string `json:"id"`
	UserProblemID      string `json:"userProblemId"`
	LcID               string `json:"lcId"`
	Title              string `json:"title"`
	TranslatedTitle    string `json:"translatedTitle"`
	Difficulty         string `json:"difficulty"`
	PassRate           string `json:"passRate"`
	Frequency          int    `json:"frequency"`
	PersonalDifficulty int    `json:"personalDifficulty"`
	Status             string `json:"status"`
	ReviewCount        int    `json:"reviewCount"`
}

// DailyGoal 今日目标（每日一组题目与选题配置）
type DailyGoal struct {
	ID        string          `json:"id"`
	GoalDate  string          `json:"goal_date"`
	Title     string          `json:"title"`
	Config    string          `json:"config"`
	Total     int             `json:"total"`
	Completed int             `json:"completed"`
	Items     []DailyGoalItem `json:"items"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

// DailyGoalItem 今日目标中的题目；完成状态与 user_problems 实时同步
type DailyGoalItem struct {
	ID              string `json:"id"`
	GoalID          string `json:"goal_id"`
	ProblemID       string `json:"problem_id"`
	SortOrder       int    `json:"sort_order"`
	LcID            string `json:"lc_id"`
	LcFrontendID    int    `json:"lc_frontend_id"`
	Title           string `json:"title"`
	TranslatedTitle string `json:"translated_title"`
	Difficulty      string `json:"difficulty"`
	TopicTags       string `json:"topic_tags"`
	UserProblemID   string `json:"user_problem_id"`
	Status          string `json:"status"`
	ProgressStatus  string `json:"progress_status"`
	BaselineStatus  string `json:"baseline_status"`
	Completed       bool   `json:"completed"`
}

// DailyGoalCandidate 供 AI 选题使用的最小题目信息
type DailyGoalCandidate struct {
	ProblemID       string
	LcID            string
	LcFrontendID    int
	Title           string
	TranslatedTitle string
	Difficulty      string
	TopicTags       string
	ProgressStatus  string
}

// DailyGoalConfig 今日目标选题配置
type DailyGoalConfig struct {
	Count        int      `json:"count"`
	Tags         []string `json:"tags"`
	Difficulties []string `json:"difficulties"`
	Notes        string   `json:"notes"`
}

// CalendarQuestionDetail 按日历日期返回的题目详情，包含题目正文与用户答题数据。
type CalendarQuestionDetail struct {
	Problem     Problem            `json:"problem"`
	UserProblem *UserProblemAnswer `json:"user_problem,omitempty"`
	CheckIn     *Review            `json:"check_in,omitempty"`
}

// CalendarReviewDetail 按题目聚合某日的复习打卡记录。
type CalendarReviewDetail struct {
	Problem     Problem           `json:"problem"`
	UserProblem UserProblemAnswer `json:"user_problem"`
	CheckIn     *Review           `json:"check_in"`
}

// DailyGoalItemDetail 今日目标中的完整题目、用户答题与当日打卡数据。
type DailyGoalItemDetail struct {
	Item        DailyGoalItem      `json:"item"`
	Problem     Problem            `json:"problem"`
	UserProblem *UserProblemAnswer `json:"user_problem,omitempty"`
	CheckIn     *Review            `json:"check_in,omitempty"`
}

// DailyGoalDetails 返回目标统计及带完整题目、答题数据的目标项。
type DailyGoalDetails struct {
	ID        string                `json:"id"`
	GoalDate  string                `json:"goal_date"`
	Title     string                `json:"title"`
	Config    string                `json:"config"`
	Total     int                   `json:"total"`
	Completed int                   `json:"completed"`
	Items     []DailyGoalItemDetail `json:"items"`
	CreatedAt string                `json:"created_at"`
	UpdatedAt string                `json:"updated_at"`
}

// CalendarDayDetails 日历单日聚合详情。
type CalendarDayDetails struct {
	Date      string                   `json:"date"`
	Problems  []CalendarQuestionDetail `json:"problems"`
	Reviews   []CalendarReviewDetail   `json:"reviews"`
	DailyGoal *DailyGoalDetails        `json:"daily_goal"`
}

// UserProblemAnswer 是面向详情响应的答题记录，不重复嵌套完整题目对象。
type UserProblemAnswer struct {
	ID                 string     `json:"id"`
	ProblemID          string     `json:"problem_id"`
	PersonalDifficulty int        `json:"personal_difficulty"`
	Status             string     `json:"status"`
	ProgressStatus     string     `json:"progress_status"`
	ReviewCount        int        `json:"review_count"`
	Notes              string     `json:"notes"`
	Code               string     `json:"code"`
	LastReview         *time.Time `json:"last_review"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	HasHtmlDemo        int        `json:"has_html_demo"`
}

// User 用户账号表
type User struct {
	ID             string     `json:"id"`
	Username       string     `json:"username"`
	PasswordHash   string     `json:"-"`
	Token          string     `json:"token,omitempty"`
	TokenExpiresAt *time.Time `json:"token_expires_at,omitempty"`
	LeetCodeCookie string     `json:"leetcode_cookie,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
}

// ChangePasswordRequest 修改密码请求
type ChangePasswordRequest struct {
	OldPassword string `json:"oldPassword" binding:"required"`
	NewPassword string `json:"newPassword" binding:"required"`
}

// UpdateLeetCodeCookieRequest 更新 LeetCode Cookie 请求
type UpdateLeetCodeCookieRequest struct {
	LeetCodeCookie string `json:"leetcodeCookie"`
}

// UploadImageByURLRequest 图片直链转存图床请求
type UploadImageByURLRequest struct {
	URL string `json:"url" binding:"required" example:"https://example.com/image.png"`
}

// ImageUploadResult 图床上传成功后统一响应 data 字段（预览地址在 image.url）
type ImageUploadResult struct {
	Image ImagePreview `json:"image"`
}

// ImagePreview 图床返回的预览信息
type ImagePreview struct {
	URL string `json:"url" example:"https://i.ibb.co/abc/xyz.png"`
}
