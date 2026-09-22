package controller

import (
	"leetcode-note-sidecar/service"
	"net/http"

	"github.com/gin-gonic/gin"
)

type TagController struct {
	tagService *service.TagService
}

func NewTagController() *TagController {
	return &TagController{
		tagService: service.NewTagService(),
	}
}

// GetTagSummary 获取标签列表 + 每个标签的题目数（用于前端知识专题侧边栏）
func (c *TagController) GetTagSummary(ctx *gin.Context) {
	tags, err := c.tagService.GetAllTags()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "msg": "获取标签失败", "data": nil})
		return
	}

	counts, err := c.tagService.GetAllTagCounts()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"code": 500, "msg": "获取标签数量失败", "data": nil})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"tags":   tags,
			"counts": counts,
		},
		"msg": "获取成功",
	})
}

