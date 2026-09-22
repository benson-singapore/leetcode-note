package controller

import (
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"time"

	"github.com/gin-gonic/gin"
)

type ReviewController struct {
	reviewService *service.ReviewService
}

func NewReviewController() *ReviewController {
	return &ReviewController{
		reviewService: service.NewReviewService(),
	}
}

// CreateReview 创建复习记录
// @Summary 创建复习记录
// @Description 为用户题目创建一条复习记录
// @Tags Reviews
// @Accept json
// @Produce json
// @Param request body models.CreateReviewRequest true "创建复习记录请求"
// @Success 201 {object} models.Review
// @Failure 400 {object} map[string]string
// @Router /reviews [post]
func (c *ReviewController) CreateReview(ctx *gin.Context) {
	var req models.CreateReviewRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	review, err := c.reviewService.CreateReview(&req)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Created(ctx, review)
}

// GetReview 获取复习记录
// @Summary 获取复习记录
// @Description 根据 ID 获取复习记录详情
// @Tags Reviews
// @Produce json
// @Param id path string true "复习记录 ID"
// @Success 200 {object} models.Review
// @Failure 404 {object} map[string]string
// @Router /reviews/{id} [get]
func (c *ReviewController) GetReview(ctx *gin.Context) {
	id := ctx.Param("id")
	review, err := c.reviewService.GetReview(id)
	if err != nil {
		utils.NotFound(ctx, "Review not found")
		return
	}

	utils.Success(ctx, review)
}

// GetReviewsByUserProblem 获取用户题目的复习记录
// @Summary 获取用户题目的复习记录
// @Description 获取某个用户题目的所有复习记录
// @Tags Reviews
// @Produce json
// @Param userProblemId path string true "用户题目 ID"
// @Success 200 {array} models.Review
// @Router /reviews/user-problem/{userProblemId} [get]
func (c *ReviewController) GetReviewsByUserProblem(ctx *gin.Context) {
	userProblemID := ctx.Param("userProblemId")
	reviews, err := c.reviewService.GetReviewsByUserProblem(userProblemID)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, reviews)
}

// GetActivityHeatmap 获取最近 365 天复习热力图（以服务端本地「今天」为窗口最后一天）
// @Summary 滑动窗口复习热力图
// @Description 返回 startDate~endDate 每日复习涉及的不重复 user_problem 数（着色）与新创建题目数（从 problems 表，与「今日题目」列表一致）
// @Tags Reviews
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /reviews/activity-heatmap [get]
func (c *ReviewController) GetActivityHeatmap(ctx *gin.Context) {
	data, err := c.reviewService.GetActivityHeatmapRolling()
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, data)
}

// GetActivityDay 获取某自然日有过复习的题目列表（按 user_problem_id 去重）
// @Summary 按日复习题目
// @Tags Reviews
// @Produce json
// @Param date query string true "YYYY-MM-DD"
// @Router /reviews/activity-day [get]
func (c *ReviewController) GetActivityDay(ctx *gin.Context) {
	date := ctx.Query("date")
	if date == "" {
		utils.BadRequest(ctx, "date is required")
		return
	}
	if len(date) != 10 || date[4] != '-' || date[7] != '-' {
		utils.BadRequest(ctx, "invalid date format")
		return
	}
	if _, err := time.ParseInLocation("2006-01-02", date, time.Local); err != nil {
		utils.BadRequest(ctx, "invalid date")
		return
	}

	list, err := c.reviewService.GetActivityDayProblems(date)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, gin.H{
		"date":     date,
		"problems": list,
	})
}

// DeleteReview 删除复习记录
// @Summary 删除复习记录
// @Description 删除一条复习记录
// @Tags Reviews
// @Param id path string true "复习记录 ID"
// @Success 204
// @Failure 404 {object} map[string]string
// @Router /reviews/{id} [delete]
func (c *ReviewController) DeleteReview(ctx *gin.Context) {
	id := ctx.Param("id")
	if err := c.reviewService.DeleteReview(id); err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}

	utils.Success(ctx, nil)
}

// UpdateReview 更新复习记录
// @Summary 更新复习记录
// @Description 更新一条复习记录的状态和备注
// @Tags Reviews
// @Accept json
// @Produce json
// @Param id path string true "复习记录 ID"
// @Param request body models.Review true "更新复习记录请求"
// @Success 200 {object} models.Review
// @Failure 400 {object} map[string]string
// @Router /reviews/{id} [put]
func (c *ReviewController) UpdateReview(ctx *gin.Context) {
	id := ctx.Param("id")
	var req models.Review
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	req.ID = id
	if err := c.reviewService.UpdateReview(&req); err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	review, err := c.reviewService.GetReview(id)
	if err != nil {
		utils.NotFound(ctx, "Review not found")
		return
	}

	utils.Success(ctx, review)
}
