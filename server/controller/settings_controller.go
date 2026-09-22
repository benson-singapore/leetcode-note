package controller

import (
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/utils"

	"github.com/gin-gonic/gin"
)

// SettingsController 全局设置（KV）
type SettingsController struct{}

func NewSettingsController() *SettingsController {
	return &SettingsController{}
}

// GET /settings/:key
func (c *SettingsController) GetSetting(ctx *gin.Context) {
	key := ctx.Param("key")
	if key == "" {
		utils.BadRequest(ctx, "缺少 key 参数")
		return
	}
	value, err := config.GetSetting(key)
	if err != nil {
		utils.InternalError(ctx, "读取设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"key": key, "value": value})
}

// PUT /settings/:key  body: { "value": "..." }
func (c *SettingsController) UpdateSetting(ctx *gin.Context) {
	key := ctx.Param("key")
	if key == "" {
		utils.BadRequest(ctx, "缺少 key 参数")
		return
	}
	var req struct {
		Value string `json:"value"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	if err := config.SetSetting(key, req.Value); err != nil {
		utils.InternalError(ctx, "保存设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"key": key, "value": req.Value})
}

// GET /settings 返回全部设置（key->value map）
func (c *SettingsController) GetAllSettings(ctx *gin.Context) {
	rows, err := config.DB.Query(`SELECT key, value FROM settings`)
	if err != nil {
		utils.InternalError(ctx, "读取设置失败: "+err.Error())
		return
	}
	defer rows.Close()

	settings := gin.H{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		settings[k] = v
	}
	utils.Success(ctx, settings)
}

// UpdateSettingsRequest 批量更新设置请求
type UpdateSettingsRequest = map[string]string

// PUT /settings  body: { "key1": "v1", "key2": "v2" }
func (c *SettingsController) UpdateSettings(ctx *gin.Context) {
	var req map[string]string
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	for k, v := range req {
		if k == "" {
			continue
		}
		if err := config.SetSetting(k, v); err != nil {
			utils.InternalError(ctx, "保存设置失败: "+err.Error())
			return
		}
	}
	utils.Success(ctx, req)
}
