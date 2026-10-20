package controller

import (
	"fmt"

	"leetcode-note-sidecar/apiaccess"
	"leetcode-note-sidecar/config"
	"leetcode-note-sidecar/utils"

	"github.com/gin-gonic/gin"
)

type APIService interface {
	SetEnabled(bool) error
	Status() apiaccess.Status
}

type SettingsController struct {
	apiService APIService
}

func NewSettingsController(apiService APIService) *SettingsController {
	return &SettingsController{apiService: apiService}
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
	if err := c.setSetting(key, req.Value); err != nil {
		utils.InternalError(ctx, "保存设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"key": key, "value": req.Value})
}

// GET /api-service 返回 API 服务当前进程状态与可访问地址。
func (c *SettingsController) GetAPIServiceInfo(ctx *gin.Context) {
	if c.apiService == nil {
		utils.Success(ctx, gin.H{"enabled": false})
		return
	}
	utils.Success(ctx, c.apiService.Status())
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
		if k == "api_service_enabled" {
			continue
		}
		if k == "api_service_token" {
			utils.BadRequest(ctx, "api_service_token 由 API 服务管理")
			return
		}
		if err := config.SetSetting(k, v); err != nil {
			utils.InternalError(ctx, "保存设置失败: "+err.Error())
			return
		}
	}
	if value, ok := req["api_service_enabled"]; ok {
		if err := c.setSetting("api_service_enabled", value); err != nil {
			utils.InternalError(ctx, "保存设置失败: "+err.Error())
			return
		}
	}
	utils.Success(ctx, req)
}

func (c *SettingsController) setSetting(key, value string) error {
	if key == "api_service_token" {
		return fmt.Errorf("api_service_token 由 API 服务管理")
	}
	if key != "api_service_enabled" {
		return config.SetSetting(key, value)
	}
	if value != "true" && value != "false" {
		return fmt.Errorf("api_service_enabled 只能为 true 或 false")
	}
	if c.apiService == nil {
		return fmt.Errorf("API 服务尚未初始化")
	}
	previous, err := config.GetSetting(key)
	if err != nil {
		return err
	}
	enabled := value == "true"
	if err := c.apiService.SetEnabled(enabled); err != nil {
		return err
	}
	if err := config.SetSetting(key, value); err != nil {
		_ = c.apiService.SetEnabled(previous == "true")
		return err
	}
	return nil
}
