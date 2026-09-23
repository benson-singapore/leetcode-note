package controller

import (
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// SaveUserProblemRequest 保存用户题目请求
type SaveUserProblemRequest struct {
	TitleSlug          string `json:"titleSlug" binding:"required"`
	Notes              string `json:"notes"`
	Code               string `json:"code"`
	PersonalDifficulty int    `json:"personalDifficulty"`
	Status             string `json:"status"`
	ProgressStatus     string `json:"progressStatus"`
}

// UserProblemDetailResponse 用户题目详情响应
type UserProblemDetailResponse struct {
	Notes              string `json:"notes"`
	Code               string `json:"code"`
	PersonalDifficulty int    `json:"personalDifficulty"`
	Status             string `json:"status"`
	ProgressStatus     string `json:"progressStatus"`
}

// LeetCodeSyncedCodeResponse 力扣站内涵盖已同步代码（GraphQL syncedCode）
type LeetCodeSyncedCodeResponse struct {
	Code      string `json:"code"`
	Timestamp string `json:"timestamp"`
}

type LeetCodeController struct {
	scraper     *service.LeetCodeScraper
	graphql     *service.LeetCodeGraphQL
	curl        *service.LeetCodeCurl
	cache       *service.LeetCodeCache
	sync        *service.ProblemSyncService
	userProblem *service.UserProblemService
	problem     *service.ProblemService
}

func NewLeetCodeController() *LeetCodeController {
	return &LeetCodeController{
		scraper:     service.NewLeetCodeScraper(),
		graphql:     service.NewLeetCodeGraphQL(),
		curl:        service.NewLeetCodeCurl(),
		cache:       service.NewLeetCodeCache(24 * time.Hour),
		sync:        service.NewProblemSyncService(),
		userProblem: service.NewUserProblemService(),
		problem:     service.NewProblemService(),
	}
}

// FetchProblem 获取 LeetCode 题目信息
// @Summary 获取 LeetCode 题目
// @Description 获取题目信息并存入数据库，返回数据库中的题目数据
// @Tags LeetCode
// @Accept json
// @Produce json
// @Param titleSlug query string false "题目 slug"
// @Param frontendId query string false "题目前端 ID"
// @Success 200 {object} models.Problem
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /leetcode/fetch [get]
func (c *LeetCodeController) FetchProblem(ctx *gin.Context) {
	titleSlug := ctx.Query("titleSlug")
	frontendID := ctx.Query("frontendId")

	if titleSlug == "" && frontendID == "" {
		log.Printf("[Controller] 错误: 缺少 titleSlug 或 frontendId 参数\n")
		utils.BadRequest(ctx, "缺少 titleSlug 或 frontendId 参数")
		return
	}

	log.Printf("[Controller] 收到获取题目请求: titleSlug=%s, frontendId=%s\n", titleSlug, frontendID)

	// 如果只有 frontendId，先获取 titleSlug
	if titleSlug == "" && frontendID != "" {
		log.Printf("[Controller] 根据 frontendId 获取题目信息\n")
		freq := service.NewLeetCodeFrequency()
		info, err := freq.GetQuestionInfoByFrontendID(frontendID)
		if err != nil {
			log.Printf("[Controller] 获取题目信息失败: %v\n", err)
			utils.InternalError(ctx, "获取题目信息失败: "+err.Error())
			return
		}
		titleSlug = info.TitleSlug
		log.Printf("[Controller] 获取到 titleSlug: %s, frequency: %.2f\n", titleSlug, info.Frequency)
	}

	log.Printf("[Controller] 开始获取并同步题目到数据库\n")

	// 获取题目并同步到数据库
	problem, err := c.sync.SyncAndFetch(titleSlug)
	if err != nil {
		log.Printf("[Controller] 获取或同步失败: %v\n", err)
		utils.InternalError(ctx, "获取题目失败: "+err.Error())
		return
	}

	log.Printf("[Controller] 返回数据库中的题目数据: %s\n", problem.Title)

	utils.Success(ctx, problem)
}

// CheckPlaywright 检查 Playwright 是否已安装
// @Summary 检查 Playwright
// @Description 检查系统中是否已安装 Playwright
// @Tags LeetCode
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /leetcode/check-playwright [get]
func (c *LeetCodeController) CheckPlaywright(ctx *gin.Context) {
	installed := c.scraper.CheckPlaywrightInstalled()
	ctx.JSON(http.StatusOK, gin.H{
		"installed": installed,
		"message": map[bool]string{
			true:  "Playwright 已安装",
			false: "Playwright 未安装，请运行 npm install playwright",
		}[installed],
	})
}

// InstallPlaywright 安装 Playwright
// @Summary 安装 Playwright
// @Description 自动安装 Playwright 依赖
// @Tags LeetCode
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} utils.Response
// @Router /leetcode/install-playwright [post]
func (c *LeetCodeController) InstallPlaywright(ctx *gin.Context) {
	if err := c.scraper.InstallPlaywright(); err != nil {
		utils.InternalError(ctx, "安装失败: "+err.Error())
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "Playwright 安装成功",
	})
}

// ClearCache 清空缓存
// @Summary 清空缓存
// @Description 清空所有缓存的题目数据
// @Tags LeetCode
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /leetcode/cache/clear [post]
func (c *LeetCodeController) ClearCache(ctx *gin.Context) {
	c.cache.Clear()
	ctx.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "缓存已清空",
	})
}

// GetCacheStats 获取缓存统计
// @Summary 获取缓存统计
// @Description 获取当前缓存的题目数量
// @Tags LeetCode
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /leetcode/cache/stats [get]
func (c *LeetCodeController) GetCacheStats(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{
		"code":      0,
		"cacheSize": c.cache.GetSize(),
		"cacheTTL":  "24h",
		"message":   "缓存统计",
	})
}

// SaveUserProblem 保存用户题目记录
// @Summary 保存用户题目记录
// @Description 根据 titleSlug 保存用户题目记录，包括笔记、代码、手感和状态
// @Tags LeetCode
// @Accept json
// @Produce json
// @Param request body SaveUserProblemRequest true "保存用户题目请求"
// @Success 200 {object} models.UserProblem
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /leetcode/user-problem/save [post]
func (c *LeetCodeController) SaveUserProblem(ctx *gin.Context) {
	var req SaveUserProblemRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		log.Printf("[Controller] 请求参数错误: %v\n", err)
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	c.saveUserProblemWithReq(ctx, &req)
}

func (c *LeetCodeController) saveUserProblemWithReq(ctx *gin.Context, req *SaveUserProblemRequest) {

	if req.TitleSlug == "" {
		log.Printf("[Controller] 错误: 缺少 titleSlug 参数\n")
		utils.BadRequest(ctx, "缺少 titleSlug 参数")
		return
	}

	log.Printf("[Controller] 收到保存用户题目请求: titleSlug=%s\n", req.TitleSlug)

	// 1. 根据 titleSlug 查找 problem
	problem, err := c.problem.GetProblemByTitleSlug(req.TitleSlug)
	if err != nil {
		log.Printf("[Controller] 题目不存在，开始从 LeetCode 获取: %v\n", err)

		// 2. 如果不存在，调用 sync 服务获取并创建
		problem, err = c.sync.SyncAndFetch(req.TitleSlug)
		if err != nil {
			log.Printf("[Controller] 获取或同步题目失败: %v\n", err)
			utils.InternalError(ctx, "获取题目失败: "+err.Error())
			return
		}
		log.Printf("[Controller] 成功从 LeetCode 获取题目: %s\n", problem.Title)
	}

	log.Printf("[Controller] 找到题目: %s (ID: %s)\n", problem.Title, problem.ID)

	// 3. 更新或创建 user_problem 记录
	updateReq := &models.UpdateUserProblemRequest{
		PersonalDifficulty: req.PersonalDifficulty,
		Status:             req.Status,
		ProgressStatus:     req.ProgressStatus,
		Notes:              req.Notes,
		Code:               req.Code,
	}

	userProblem, err := c.userProblem.UpsertUserProblem(problem.ID, updateReq)
	if err != nil {
		log.Printf("[Controller] 保存用户题目记录失败: %v\n", err)
		utils.InternalError(ctx, "保存用户题目记录失败: "+err.Error())
		return
	}

	log.Printf("[Controller] 成功保存用户题目记录: %s\n", userProblem.ID)

	utils.Success(ctx, userProblem)
}

// SaveUserProblemV2 保存用户题目记录（支持 progressStatus，供脚本等免登录调用）
// @Summary 保存用户题目记录（V2）
// @Description 根据 titleSlug 保存用户题目记录，包括笔记、代码、手感、掌握程度 status 与完成状态 progressStatus（默认 Reviewing）
// @Tags LeetCode
// @Accept json
// @Produce json
// @Param request body SaveUserProblemRequest true "保存用户题目请求（含 progressStatus）"
// @Success 200 {object} models.UserProblem
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /leetcode/user-problem/save-v2 [post]
func (c *LeetCodeController) SaveUserProblemV2(ctx *gin.Context) {
	var req SaveUserProblemRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		log.Printf("[Controller] 请求参数错误: %v\n", err)
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}

	if req.ProgressStatus == "" {
		req.ProgressStatus = "Reviewing"
	}

	c.saveUserProblemWithReq(ctx, &req)
}

// GetUserProblemDetail 查询用户题目记录详情
// @Summary 查询用户题目记录详情
// @Description 根据 titleSlug 查询用户题目记录，返回 notes、code、personalDifficulty、status；不存在则返回空字符串和 0
// @Tags LeetCode
// @Produce json
// @Param titleSlug query string true "题目 slug"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} utils.Response
// @Router /leetcode/user-problem/detail [get]
func (c *LeetCodeController) GetUserProblemDetail(ctx *gin.Context) {
	titleSlug := ctx.Query("titleSlug")
	if titleSlug == "" {
		utils.BadRequest(ctx, "缺少 titleSlug 参数")
		return
	}

	emptyData := UserProblemDetailResponse{
		Notes:              "",
		Code:               "",
		PersonalDifficulty: 0,
		Status:             "",
		ProgressStatus:     "Reviewing",
	}

	problem, err := c.problem.GetProblemByTitleSlug(titleSlug)
	if err != nil || problem == nil {
		utils.Success(ctx, emptyData)
		return
	}

	userProblem, err := c.userProblem.GetUserProblemByProblemID(problem.ID)
	if err != nil || userProblem == nil {
		utils.Success(ctx, emptyData)
		return
	}

	utils.Success(ctx, UserProblemDetailResponse{
		Notes:              userProblem.Notes,
		Code:               userProblem.Code,
		PersonalDifficulty: userProblem.PersonalDifficulty,
		Status:             userProblem.Status,
		ProgressStatus:     userProblem.ProgressStatus,
	})
}

// GetLeetCodeSyncedCode 根据题目 slug 从力扣拉取当前登录账号在该题、指定语言下已同步的代码
// @Summary 查询力扣已同步代码
// @Description 调用力扣 GraphQL syncedCode（noj-go），使用当前登录用户绑定的 LeetCode Cookie
// @Tags LeetCode
// @Produce json
// @Param questionSlug query string true "题目 titleSlug，与力扣 URL 一致"
// @Param langSlug query string false "语言 slug，如 java、python3、golang，默认 java"
// @Success 200 {object} utils.Response{data=LeetCodeSyncedCodeResponse}
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /leetcode/user-synced-code [get]
func (c *LeetCodeController) GetLeetCodeSyncedCode(ctx *gin.Context) {
	questionSlug := ctx.Query("questionSlug")
	if questionSlug == "" {
		questionSlug = ctx.Query("titleSlug")
	}
	if questionSlug == "" {
		utils.BadRequest(ctx, "缺少 questionSlug 参数（或与 titleSlug 二选一）")
		return
	}

	langSlug := ctx.Query("langSlug")
	if langSlug == "" {
		langSlug = "java"
	}

	log.Printf("[Controller] 拉取力扣已同步代码: questionSlug=%s langSlug=%s\n", questionSlug, langSlug)

	synced, err := c.graphql.FetchSyncedUserCode(questionSlug, langSlug)
	if err != nil {
		log.Printf("[Controller] 拉取已同步代码失败: %v\n", err)
		utils.InternalError(ctx, "拉取力扣代码失败: "+err.Error())
		return
	}

	utils.Success(ctx, LeetCodeSyncedCodeResponse{
		Code:      synced.Code,
		Timestamp: synced.Timestamp,
	})
}

// GetLeetCodeUserProfile 拉取当前登录账号的力扣公开资料（头像、昵称等）
// @Summary 查询力扣账号资料
// @Description 使用当前登录用户绑定的 LeetCode Cookie 调用 globalData GraphQL，返回头像 / 用户名
// @Tags LeetCode
// @Produce json
// @Success 200 {object} utils.Response{data=service.LeetCodeUserProfile}
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /leetcode/user-profile [get]
func (c *LeetCodeController) GetLeetCodeUserProfile(ctx *gin.Context) {
	profile, err := c.graphql.FetchUserProfile()
	if err != nil {
		log.Printf("[Controller] 拉取力扣账号资料失败: %v\n", err)
		utils.InternalError(ctx, "拉取账号资料失败: "+err.Error())
		return
	}

	utils.Success(ctx, profile)
}

// GetLeetCodeSolvedStats 拉取当前绑定账号的刷题进度统计（按难度分组的已通过 / 失败 / 未做）
// @Summary 查询刷题进度统计
// @Description 调用 userProfileUserQuestionProgress GraphQL，返回按难度分组的刷题进度
// @Tags LeetCode
// @Produce json
// @Success 200 {object} utils.Response{data=service.UserQuestionProgress}
// @Failure 500 {object} utils.Response
// @Router /leetcode/solved-stats [get]
func (c *LeetCodeController) GetLeetCodeSolvedStats(ctx *gin.Context) {
	progress, err := c.graphql.FetchUserQuestionProgress()
	if err != nil {
		log.Printf("[Controller] 拉取刷题进度统计失败: %v\n", err)
		utils.InternalError(ctx, "拉取刷题进度统计失败: "+err.Error())
		return
	}
	utils.Success(ctx, progress)
}

// GetLeetCodeSolvedList 拉取当前绑定账号的全部已通过题目列表
// @Summary 查询已刷题目列表
// @Description 调用 /api/problems/all/ 并过滤 ac 状态，返回全部已通过题目的 slug / 标题 / 难度
// @Tags LeetCode
// @Produce json
// @Success 200 {object} utils.Response{data=service.SolvedListResult}
// @Failure 500 {object} utils.Response
// @Router /leetcode/solved-list [get]
func (c *LeetCodeController) GetLeetCodeSolvedList(ctx *gin.Context) {
	list, err := c.graphql.FetchSolvedQuestions()
	if err != nil {
		log.Printf("[Controller] 拉取已刷题目列表失败: %v\n", err)
		utils.InternalError(ctx, "拉取已刷题目列表失败: "+err.Error())
		return
	}
	utils.Success(ctx, list)
}

// ImportSolvedRequest 批量导入已刷题目请求
type ImportSolvedRequest struct {
	Slugs []string `json:"slugs" binding:"required"`
}

// ImportSolvedResult 批量导入结果
type ImportSolvedResult struct {
	Imported      int    `json:"imported"`      // 本次新增到题库的数量
	Skipped       int    `json:"skipped"`       // 题库中已存在的数量
	Failed        int    `json:"failed"`        // 抓取失败的数量
	ImportedTotal string `json:"importedTotal"` // 累计从 LeetCode 导入的题数（settings）
}

// ImportSolved 批量导入已刷题目到本地题库
// @Summary 批量导入已刷题目
// @Description 按 slug 批量同步 LeetCode 题目到本地题库，并累计 leetcode_imported_count 设置
// @Tags LeetCode
// @Accept json
// @Produce json
// @Param request body ImportSolvedRequest true "题目 slug 列表"
// @Success 200 {object} utils.Response{data=ImportSolvedResult}
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /leetcode/import-solved [post]
func (c *LeetCodeController) ImportSolved(ctx *gin.Context) {
	var req ImportSolvedRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}

	result := ImportSolvedResult{}
	for _, slug := range req.Slugs {
		if slug == "" {
			continue
		}
		// 题库中已存在则跳过
		if existing, err := c.problem.GetProblemByTitleSlug(slug); err == nil && existing != nil {
			result.Skipped++
			continue
		}

		// 从 LeetCode 抓取并同步到题库
		if _, err := c.sync.SyncAndFetch(slug); err != nil {
			log.Printf("[Controller] 导入已刷题目失败: %s, %v\n", slug, err)
			result.Failed++
			continue
		}
		result.Imported++
	}

	// 累计从 LeetCode 导入的题数（用于前端展示来源统计）
	if result.Imported > 0 {
		current, _ := config.GetSetting("leetcode_imported_count")
		config.SetSetting("leetcode_imported_count", fmt.Sprintf("%d", parseIntOrZero(current)+result.Imported))
	}

	importedTotal, _ := config.GetSetting("leetcode_imported_count")
	result.ImportedTotal = fmt.Sprintf("%d", parseIntOrZero(importedTotal))

	utils.Success(ctx, result)
}

// parseIntOrZero 安全解析整数，失败返回 0
func parseIntOrZero(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}
