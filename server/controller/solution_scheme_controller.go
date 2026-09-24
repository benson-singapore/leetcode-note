package controller

import (
	"errors"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/service"
	"leetcode-note-sidecar/utils"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type SolutionSchemeController struct {
	schemeService *service.SolutionSchemeService
}

func NewSolutionSchemeController() *SolutionSchemeController {
	return &SolutionSchemeController{schemeService: service.NewSolutionSchemeService()}
}

// ListSolutionSchemes 列出题目下的所有解题方案
func (c *SolutionSchemeController) ListSolutionSchemes(ctx *gin.Context) {
	problemID := ctx.Param("id")
	if problemID == "" {
		utils.BadRequest(ctx, "缺少题目 ID")
		return
	}
	schemes, err := c.schemeService.List(problemID)
	if err != nil {
		log.Printf("[Controller] 获取解题方案失败: %v\n", err)
		utils.InternalError(ctx, "获取解题方案失败: "+err.Error())
		return
	}
	if schemes == nil {
		schemes = []models.SolutionScheme{}
	}
	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": schemes, "msg": "获取成功"})
}

// CreateSolutionScheme 新增解题方案
func (c *SolutionSchemeController) CreateSolutionScheme(ctx *gin.Context) {
	problemID := ctx.Param("id")
	if problemID == "" {
		utils.BadRequest(ctx, "缺少题目 ID")
		return
	}
	var req models.SaveSolutionSchemeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	scheme, err := c.schemeService.Create(problemID, &req)
	if err != nil {
		log.Printf("[Controller] 创建解题方案失败: %v\n", err)
		utils.InternalError(ctx, "创建解题方案失败: "+err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": scheme, "msg": "创建成功"})
}

// UpdateSolutionScheme 更新解题方案
func (c *SolutionSchemeController) UpdateSolutionScheme(ctx *gin.Context) {
	problemID := ctx.Param("id")
	schemeID := ctx.Param("schemeId")
	if problemID == "" || schemeID == "" {
		utils.BadRequest(ctx, "缺少 ID")
		return
	}
	var req models.SaveSolutionSchemeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	scheme, err := c.schemeService.Update(problemID, schemeID, &req)
	if err != nil {
		if errors.Is(err, service.ErrSchemeNotFound) {
			utils.NotFound(ctx, "解题方案不存在")
			return
		}
		log.Printf("[Controller] 更新解题方案失败: %v\n", err)
		utils.BadRequest(ctx, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": scheme, "msg": "保存成功"})
}

// DeleteSolutionScheme 删除解题方案
func (c *SolutionSchemeController) DeleteSolutionScheme(ctx *gin.Context) {
	problemID := ctx.Param("id")
	schemeID := ctx.Param("schemeId")
	if problemID == "" || schemeID == "" {
		utils.BadRequest(ctx, "缺少 ID")
		return
	}
	if err := c.schemeService.Delete(problemID, schemeID); err != nil {
		if errors.Is(err, service.ErrSchemeNotFound) {
			utils.NotFound(ctx, "解题方案不存在")
			return
		}
		log.Printf("[Controller] 删除解题方案失败: %v\n", err)
		utils.InternalError(ctx, "删除解题方案失败: "+err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"deleted": true}, "msg": "删除成功"})
}
