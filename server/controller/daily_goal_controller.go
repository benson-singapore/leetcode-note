package controller

import (
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

type DailyGoalController struct {
	goalService *service.DailyGoalService
	tagService  *service.TagService
}

func NewDailyGoalController() *DailyGoalController {
	return &DailyGoalController{
		goalService: service.NewDailyGoalService(),
		tagService:  service.NewTagService(),
	}
}

// GetToday 获取今日目标（默认本地自然日，可用 date 查询指定日期）
// @Summary 获取今日目标
// @Description 返回指定自然日的目标题目，完成状态与题库 user_problems 实时同步
// @Tags DailyGoal
// @Produce json
// @Param date query string false "日期 YYYY-MM-DD，默认今天"
// @Success 200 {object} utils.Response{data=models.DailyGoal}
// @Router /daily-goals/today [get]
func (c *DailyGoalController) GetToday(ctx *gin.Context) {
	goal, err := c.goalService.GetByDate(ctx.Query("date"))
	if err != nil {
		utils.InternalError(ctx, "获取今日目标失败: "+err.Error())
		return
	}
	utils.Success(ctx, goal)
}

// GetOptions 获取今日目标页需要的知识点与题库基础信息
// @Summary 获取今日目标可选项
// @Description 返回题库基础统计、知识点标签及数量
// @Tags DailyGoal
// @Produce json
// @Success 200 {object} utils.Response
// @Router /daily-goals/options [get]
func (c *DailyGoalController) GetOptions(ctx *gin.Context) {
	stats, err := c.goalService.LibraryStats()
	if err != nil {
		utils.InternalError(ctx, "获取题库基础信息失败: "+err.Error())
		return
	}
	tags, err := c.tagService.GetAllTags()
	if err != nil {
		utils.InternalError(ctx, "获取知识点失败: "+err.Error())
		return
	}
	counts, err := c.tagService.GetAllTagCounts()
	if err != nil {
		utils.InternalError(ctx, "获取知识点数量失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{
		"stats":  stats,
		"tags":   tags,
		"counts": counts,
	})
}

// GenerateAIRequest AI 智能选题请求
type GenerateAIRequest struct {
	Count        int      `json:"count"`
	Tags         []string `json:"tags"`
	Difficulties []string `json:"difficulties"`
	Notes        string   `json:"notes"`
	Date         string   `json:"date"`
}

// GenerateAI 根据配置调用 AI 从题库中选题，生成今日目标
// @Summary AI 智能选题
// @Description 将题目数量、知识点、难度与补充要求组织为提示词交给 AI，AI 返回题号后写入今日目标
// @Tags DailyGoal
// @Accept json
// @Produce json
// @Param request body GenerateAIRequest true "今日目标配置"
// @Success 200 {object} utils.Response{data=models.DailyGoal}
// @Failure 400 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /daily-goals/generate [post]
func (c *DailyGoalController) GenerateAI(ctx *gin.Context) {
	var req GenerateAIRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	if req.Count <= 0 {
		req.Count = 5
	}
	if req.Count > 20 {
		utils.BadRequest(ctx, "题目数量不能超过 20")
		return
	}

	cfg := &models.DailyGoalConfig{
		Count:        req.Count,
		Tags:         req.Tags,
		Difficulties: req.Difficulties,
		Notes:        req.Notes,
	}
	goal, err := c.goalService.GenerateWithAI(cfg, req.Date)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	utils.Created(ctx, goal)
}

// CreateDailyGoalRequest 按题号生成今日目标请求
type CreateDailyGoalRequest struct {
	ProblemNumbers []string `json:"problem_numbers"`
	Date           string   `json:"date"`
	Title          string   `json:"title"`
	Append         bool     `json:"append"`
}

// Create 手动传入题目编号生成今日目标（本地不存在时自动从 LeetCode 同步）
// @Summary 按题号生成今日目标
// @Description 接受 LeetCode 前端题号或 slug 列表，自动查询题库；不存在则同步后写入今日目标
// @Tags DailyGoal
// @Accept json
// @Produce json
// @Param request body CreateDailyGoalRequest true "题目编号列表"
// @Success 201 {object} utils.Response{data=models.DailyGoal}
// @Failure 400 {object} utils.Response
// @Router /daily-goals [post]
func (c *DailyGoalController) Create(ctx *gin.Context) {
	var req CreateDailyGoalRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	numbers := make([]string, 0, len(req.ProblemNumbers))
	for _, n := range req.ProblemNumbers {
		if strings.TrimSpace(n) != "" {
			numbers = append(numbers, n)
		}
	}
	if len(numbers) == 0 {
		utils.BadRequest(ctx, "problem_numbers 不能为空")
		return
	}
	goal, err := c.goalService.GenerateManual(numbers, req.Date, req.Title, req.Append)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	utils.Created(ctx, goal)
}

// ClearToday 清空今日目标
// @Summary 清空今日目标
// @Tags DailyGoal
// @Produce json
// @Param date query string false "日期 YYYY-MM-DD，默认今天"
// @Success 200 {object} utils.Response
// @Router /daily-goals/today [delete]
func (c *DailyGoalController) ClearToday(ctx *gin.Context) {
	if err := c.goalService.Clear(ctx.Query("date")); err != nil {
		utils.InternalError(ctx, "清空今日目标失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"deleted": true})
}
