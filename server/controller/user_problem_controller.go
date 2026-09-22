package controller

import (
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"time"

	"github.com/gin-gonic/gin"
)

type UserProblemController struct {
	userProblemService *service.UserProblemService
}

// UpdateUserProblemNotes 更新用户题目笔记（如果不存在则创建）
// @Summary 更新用户题目笔记
// @Description 更新用户题目的核心笔记内容，如果不存在则创建
// @Tags UserProblems
// @Accept json
// @Produce json
// @Param id path string true "用户题目 ID"
// @Param request body map[string]string true "笔记内容"
// @Success 200 {object} models.UserProblem
// @Failure 400 {object} map[string]string
// @Router /user-problems/{id}/notes [put]
func (c *UserProblemController) UpdateUserProblemNotes(ctx *gin.Context) {
	id := ctx.Param("id")
	var req map[string]string
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	notes, ok := req["notes"]
	if !ok {
		utils.BadRequest(ctx, "notes field is required")
		return
	}

	// 使用 upsert 逻辑：不存在则创建，存在则更新
	userProblem, err := c.userProblemService.UpsertUserProblemNotes(id, notes)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, userProblem)
}

// GetUserProblemNotes 获取用户题目笔记
// @Summary 获取用户题目笔记
// @Description 获取用户题目的核心笔记内容
// @Tags UserProblems
// @Produce json
// @Param id path string true "用户题目 ID"
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /user-problems/{id}/notes [get]
func (c *UserProblemController) GetUserProblemNotes(ctx *gin.Context) {
	id := ctx.Param("id")
	userProblem, err := c.userProblemService.GetUserProblem(id)
	if err != nil {
		utils.NotFound(ctx, "User problem not found")
		return
	}

	utils.Success(ctx, map[string]string{
		"id":    userProblem.ID,
		"notes": userProblem.Notes,
	})
}

func NewUserProblemController() *UserProblemController {
	return &UserProblemController{
		userProblemService: service.NewUserProblemService(),
	}
}

// CreateUserProblem 创建用户题目记录
// @Summary 创建用户题目记录
// @Description 为用户创建一个题目学习记录
// @Tags UserProblems
// @Accept json
// @Produce json
// @Param request body models.CreateUserProblemRequest true "创建用户题目请求"
// @Success 201 {object} models.UserProblem
// @Failure 400 {object} map[string]string
// @Router /user-problems [post]
func (c *UserProblemController) CreateUserProblem(ctx *gin.Context) {
	var req models.CreateUserProblemRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	userProblem, err := c.userProblemService.CreateUserProblem(&req)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Created(ctx, userProblem)
}

// GetUserProblem 获取用户题目记录
// @Summary 获取用户题目记录
// @Description 根据 ID 获取用户题目记录详情
// @Tags UserProblems
// @Produce json
// @Param id path string true "用户题目 ID"
// @Success 200 {object} models.UserProblem
// @Failure 404 {object} map[string]string
// @Router /user-problems/{id} [get]
func (c *UserProblemController) GetUserProblem(ctx *gin.Context) {
	id := ctx.Param("id")
	userProblem, err := c.userProblemService.GetUserProblem(id)
	if err != nil {
		utils.NotFound(ctx, "User problem not found")
		return
	}

	utils.Success(ctx, userProblem)
}

// GetAllUserProblems 获取所有用户题目记录
// @Summary 获取所有用户题目记录
// @Description 获取用户的所有题目学习记录
// @Tags UserProblems
// @Produce json
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(10)
// @Success 200 {object} models.Pagination
// @Router /user-problems [get]
func (c *UserProblemController) GetAllUserProblems(ctx *gin.Context) {
	page := ctx.DefaultQuery("page", "1")
	pageSize := ctx.DefaultQuery("page_size", "10")

	var pageNum, pageSizeNum int
	if _, err := fmt.Sscanf(page, "%d", &pageNum); err != nil || pageNum < 1 {
		pageNum = 1
	}
	if _, err := fmt.Sscanf(pageSize, "%d", &pageSizeNum); err != nil || pageSizeNum < 1 {
		pageSizeNum = 10
	}

	userProblems, err := c.userProblemService.GetAllUserProblems()
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	total := int64(len(userProblems))
	totalPages := (total + int64(pageSizeNum) - 1) / int64(pageSizeNum)

	// 计算分页
	start := (pageNum - 1) * pageSizeNum
	end := start + pageSizeNum
	if start > int(total) {
		start = int(total)
	}
	if end > int(total) {
		end = int(total)
	}

	var items []models.UserProblem
	if start < int(total) {
		items = userProblems[start:end]
	} else {
		items = []models.UserProblem{}
	}

	pagination := models.Pagination{
		Total:      total,
		Page:       pageNum,
		PageSize:   pageSizeNum,
		TotalPages: totalPages,
		Items:      items,
	}

	utils.Success(ctx, pagination)
}

// GetUserProblemsByStatus 根据状态获取用户题目记录
// @Summary 根据状态获取用户题目记录
// @Description 根据掌握状态获取用户题目记录
// @Tags UserProblems
// @Produce json
// @Param status query string true "掌握状态 (New, Struggling, Reviewing, Mastered)"
// @Success 200 {array} models.UserProblem
// @Router /user-problems/status [get]
func (c *UserProblemController) GetUserProblemsByStatus(ctx *gin.Context) {
	status := ctx.Query("status")
	if status == "" {
		utils.BadRequest(ctx, "status parameter is required")
		return
	}

	userProblems, err := c.userProblemService.GetUserProblemsByStatus(status)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, userProblems)
}

// UpdateUserProblem 更新用户题目记录
// @Summary 更新用户题目记录
// @Description 更新用户题目的学习状态、笔记等信息，如果不存在则创建
// @Tags UserProblems
// @Accept json
// @Produce json
// @Param id path string true "用户题目 ID"
// @Param request body models.UpdateUserProblemRequest true "更新用户题目请求"
// @Success 200 {object} models.UserProblem
// @Failure 400 {object} map[string]string
// @Router /user-problems/{id} [put]
func (c *UserProblemController) UpdateUserProblem(ctx *gin.Context) {
	id := ctx.Param("id")
	var req models.UpdateUserProblemRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	userProblem, err := c.userProblemService.UpsertUserProblem(id, &req)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, userProblem)
}

// DeleteUserProblem 删除用户题目记录
// @Summary 删除用户题目记录
// @Description 删除用户的题目学习记录
// @Tags UserProblems
// @Param id path string true "用户题目 ID"
// @Success 204
// @Failure 404 {object} map[string]string
// @Router /user-problems/{id} [delete]
func (c *UserProblemController) DeleteUserProblem(ctx *gin.Context) {
	id := ctx.Param("id")
	if err := c.userProblemService.DeleteUserProblem(id); err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}

	utils.Success(ctx, nil)
}

// GetActivityDayCreated 按 problems 创建日期列出当日新创建的题目
// @Summary 按日创建题目
// @Tags UserProblems
// @Produce json
// @Param date query string true "YYYY-MM-DD"
// @Router /user-problems/on-date [get]
func (c *UserProblemController) GetActivityDayCreated(ctx *gin.Context) {
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

	list, err := c.userProblemService.GetActivityDayCreatedProblems(date)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, gin.H{
		"date":     date,
		"problems": list,
	})
}

// GetStats 获取统计数据
// @Summary 获取统计数据
// @Description 获取用户的学习统计数据
// @Tags UserProblems
// @Produce json
// @Success 200 {object} models.StatsResponse
// @Router /user-problems/stats [get]
func (c *UserProblemController) GetStats(ctx *gin.Context) {
	stats, err := c.userProblemService.GetStats()
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Success(ctx, stats)
}
