package controller

import (
	"errors"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type ProblemDisplayController struct {
	displayService     *service.ProblemDisplayService
	solutionDemoService *service.SolutionDemoService
}

func NewProblemDisplayController() *ProblemDisplayController {
	return &ProblemDisplayController{
		displayService:      service.NewProblemDisplayService(),
		solutionDemoService: service.NewSolutionDemoService(),
	}
}

type solutionDemoPutRequest struct {
	HTML string `json:"html"`
}

// GetAllProblems 获取所有题目
// @Summary 获取所有题目
// @Description 获取所有题目用于前端显示
// @Tags Problems
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} utils.Response
// @Router /problems [get]
func (c *ProblemDisplayController) GetAllProblems(ctx *gin.Context) {
	log.Printf("[Controller] 获取所有题目\n")

	page := 1
	pageSize := 16
	if v := ctx.Query("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := ctx.Query("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			pageSize = n
		}
	}

	mode := ctx.DefaultQuery("mode", "repo") // repo | reviewing_random
	searchQuery := strings.TrimSpace(ctx.Query("q"))
	difficulty := strings.TrimSpace(ctx.DefaultQuery("difficulty", "All"))
	sortMode := strings.TrimSpace(ctx.DefaultQuery("sort_mode", "createdAt"))
	sortDirection := strings.TrimSpace(ctx.DefaultQuery("sort_direction", "desc"))

	tagsParam := strings.TrimSpace(ctx.Query("tags"))
	var tags []string
	if tagsParam != "" {
		for _, t := range strings.Split(tagsParam, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}

	if mode == "reviewing_random" {
		count := 10
		if v := ctx.Query("count"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				count = n
			}
		}

		items, err := c.displayService.GetRandomReviewingProblemsForDisplay(count, searchQuery, difficulty, tags)
		if err != nil {
			log.Printf("[Controller] 获取复习中随机题目失败: %v\n", err)
			utils.InternalError(ctx, "获取题目失败: "+err.Error())
			return
		}

		pagination := models.Pagination{
			Total:      int64(len(items)),
			Page:       1,
			PageSize:   int(count),
			TotalPages: 1,
			Items:      items,
		}

		ctx.JSON(http.StatusOK, gin.H{
			"code": 0,
			"data": pagination,
			"msg":  "获取成功",
		})
		return
	}

	items, total, err := c.displayService.GetProblemsForDisplayList(page, pageSize, searchQuery, difficulty, tags, sortMode, sortDirection)
	if err != nil {
		log.Printf("[Controller] 获取题目失败: %v\n", err)
		utils.InternalError(ctx, "获取题目失败: "+err.Error())
		return
	}

	totalPages := (total + int64(pageSize) - 1) / int64(pageSize)
	pagination := models.Pagination{
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
		Items:      items,
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": pagination,
		"msg":  "获取成功",
	})
}

// GetProblemByID 根据 ID 获取题目
// @Summary 根据 ID 获取题目
// @Description 根据题目 ID 获取单个题目详情
// @Tags Problems
// @Produce json
// @Param id path string true "题目 ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} utils.Response
// @Failure 500 {object} utils.Response
// @Router /problems/{id} [get]
func (c *ProblemDisplayController) GetProblemByID(ctx *gin.Context) {
	id := ctx.Param("id")
	log.Printf("[Controller] 获取题目: %s\n", id)

	if id == "" {
		utils.BadRequest(ctx, "缺少题目 ID")
		return
	}

	problem, err := c.displayService.GetProblemByIDForDisplay(id)
	if err != nil {
		log.Printf("[Controller] 获取题目失败: %v\n", err)
		utils.InternalError(ctx, "获取题目失败: "+err.Error())
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": problem,
		"msg":  "获取成功",
	})
}

// GetStats 获取统计数据
// @Summary 获取统计数据
// @Description 获取题目统计数据
// @Tags Problems
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} utils.Response
// @Router /problems/stats [get]
func (c *ProblemDisplayController) GetStats(ctx *gin.Context) {
	log.Printf("[Controller] 获取统计数据\n")

	stats, err := c.displayService.GetStats()
	if err != nil {
		log.Printf("[Controller] 获取统计数据失败: %v\n", err)
		utils.InternalError(ctx, "获取统计数据失败: "+err.Error())
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": stats,
		"msg":  "获取成功",
	})
}

// GetSolutionDemo returns saved HTML for the problem (file on disk).
func (c *ProblemDisplayController) GetSolutionDemo(ctx *gin.Context) {
	id := ctx.Param("id")
	if id == "" {
		utils.BadRequest(ctx, "缺少题目 ID")
		return
	}
	html, err := c.solutionDemoService.GetHTML(id)
	if err != nil {
		if errors.Is(err, service.ErrSolutionDemoNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"code": 404, "msg": "暂无解题演示", "data": nil})
			return
		}
		log.Printf("[Controller] 读取解题演示失败: %v\n", err)
		utils.InternalError(ctx, "读取失败: "+err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{"html": html},
		"msg":  "获取成功",
	})
}

// PutSolutionDemo saves HTML to disk and updates problems.has_html_demo.
func (c *ProblemDisplayController) PutSolutionDemo(ctx *gin.Context) {
	id := ctx.Param("id")
	if id == "" {
		utils.BadRequest(ctx, "缺少题目 ID")
		return
	}
	var req solutionDemoPutRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	if err := c.solutionDemoService.SaveHTML(id, req.HTML); err != nil {
		log.Printf("[Controller] 保存解题演示失败: %v\n", err)
		utils.BadRequest(ctx, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{"saved": true},
		"msg":  "保存成功",
	})
}
