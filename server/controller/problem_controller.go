package controller

import (
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"

	"github.com/gin-gonic/gin"
)

type ProblemController struct {
	problemService *service.ProblemService
	tagService     *service.TagService
}

func NewProblemController() *ProblemController {
	return &ProblemController{
		problemService: service.NewProblemService(),
		tagService:     service.NewTagService(),
	}
}

// CreateProblem 创建题目
// @Summary 创建题目
// @Description 创建一个新的 LeetCode 题目
// @Tags Problems
// @Accept json
// @Produce json
// @Param request body models.CreateProblemRequest true "创建题目请求"
// @Success 201 {object} models.Problem
// @Failure 400 {object} map[string]string
// @Router /problems [post]
func (c *ProblemController) CreateProblem(ctx *gin.Context) {
	var req models.CreateProblemRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	problem, err := c.problemService.CreateProblem(&req)
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	utils.Created(ctx, problem)
}

// GetProblem 获取题目
// @Summary 获取题目
// @Description 根据 ID 获取题目详情
// @Tags Problems
// @Produce json
// @Param id path string true "题目 ID"
// @Success 200 {object} models.Problem
// @Failure 404 {object} map[string]string
// @Router /problems/{id} [get]
func (c *ProblemController) GetProblem(ctx *gin.Context) {
	id := ctx.Param("id")
	detail, err := c.problemService.GetProblemDetail(id)
	if err != nil {
		utils.NotFound(ctx, "Problem not found")
		return
	}

	utils.Success(ctx, detail)
}

// GetAllProblems 获取所有题目
// @Summary 获取所有题目
// @Description 获取所有 LeetCode 题目列表
// @Tags Problems
// @Produce json
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(10)
// @Success 200 {object} models.Pagination
// @Router /problems [get]
func (c *ProblemController) GetAllProblems(ctx *gin.Context) {
	page := ctx.DefaultQuery("page", "1")
	pageSize := ctx.DefaultQuery("page_size", "10")

	var pageNum, pageSizeNum int
	if _, err := fmt.Sscanf(page, "%d", &pageNum); err != nil || pageNum < 1 {
		pageNum = 1
	}
	if _, err := fmt.Sscanf(pageSize, "%d", &pageSizeNum); err != nil || pageSizeNum < 1 {
		pageSizeNum = 10
	}

	problems, err := c.problemService.GetAllProblems()
	if err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}

	total := int64(len(problems))
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

	var items []models.Problem
	if start < int(total) {
		items = problems[start:end]
	} else {
		items = []models.Problem{}
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

// UpdateProblem 更新题目
// @Summary 更新题目
// @Description 更新题目信息
// @Tags Problems
// @Accept json
// @Produce json
// @Param id path string true "题目 ID"
// @Param request body models.CreateProblemRequest true "更新题目请求"
// @Success 200 {object} models.Problem
// @Failure 404 {object} map[string]string
// @Router /problems/{id} [put]
func (c *ProblemController) UpdateProblem(ctx *gin.Context) {
	id := ctx.Param("id")
	var req models.CreateProblemRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	problem, err := c.problemService.UpdateProblem(id, &req)
	if err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}

	utils.Success(ctx, problem)
}

// DeleteProblem 删除题目
// @Summary 删除题目
// @Description 删除题目及其相关数据
// @Tags Problems
// @Param id path string true "题目 ID"
// @Success 204
// @Failure 404 {object} map[string]string
// @Router /problems/{id} [delete]
func (c *ProblemController) DeleteProblem(ctx *gin.Context) {
	id := ctx.Param("id")
	if err := c.problemService.DeleteProblem(id); err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}

	utils.Success(ctx, nil)
}
