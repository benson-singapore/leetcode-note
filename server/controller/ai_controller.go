package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	ai "leetcode-note-sidecar/service/ai"
	"leetcode-note-sidecar/utils"
)

// AIController AI 问答接口
type AIController struct{}

func NewAIController() *AIController {
	return &AIController{}
}

// ============ 助手 CRUD ============

// validateAssistant 校验并补全助手配置
func validateAssistant(req *ai.AssistantConfig) error {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return fmt.Errorf("助手名称不能为空")
	}
	switch req.Type {
	case "openai":
		// API Key 与 BaseURL 至少配置其一
	case "anthropic":
		// 同上
	case "cli":
		if req.CliKind == "" {
			req.CliKind = ai.InferCLIKind(req.Command)
		}
		if strings.TrimSpace(req.Command) == "" {
			switch req.CliKind {
			case ai.CLIKindCodex:
				req.Command = "codex"
			case ai.CLIKindClaude:
				req.Command = "claude"
			default:
				return fmt.Errorf("CLI 命令不能为空")
			}
		}
	default:
		return fmt.Errorf("不支持的接入方式: %s", req.Type)
	}
	// 清洗模型列表
	cleaned := []ai.ModelConfig{}
	seen := map[string]bool{}
	for _, m := range req.Models {
		id := strings.TrimSpace(m.ID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		name := strings.TrimSpace(m.Name)
		if name == "" {
			name = id
		}
		cleaned = append(cleaned, ai.ModelConfig{ID: id, Name: name, Enabled: m.Enabled})
	}
	req.Models = cleaned
	return nil
}

// idForAssistant 生成唯一助手 ID
func idForAssistant(name, atype string) string {
	return fmt.Sprintf("%s-%s", atype, strings.ReplaceAll(name, " ", "-")) + "-" + uuid.NewString()[:8]
}

// GET /ai/cli/models?kind=codex 从 CLI 本地配置中尽力发现可用模型
func (c *AIController) ListCLIModels(ctx *gin.Context) {
	kind := ctx.Query("kind")
	models := ai.DetectCLIModels(kind)
	utils.Success(ctx, gin.H{
		"kind":   kind,
		"models": models,
	})
}

// CreateAssistantRequest 新增助手（Enabled 缺省视为启用）
type CreateAssistantRequest struct {
	ai.AssistantConfig
	Enabled *bool `json:"enabled"`
}

// POST /ai/assistants 新增 AI 助手
func (c *AIController) CreateAssistant(ctx *gin.Context) {
	var req CreateAssistantRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	cfg := req.AssistantConfig
	cfg.Enabled = req.Enabled == nil || *req.Enabled
	if err := validateAssistant(&cfg); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	cfg.ID = idForAssistant(cfg.Name, cfg.Type)
	settings.Assistants = append(settings.Assistants, cfg)
	// 第一个助手自动设为默认
	if len(settings.Assistants) == 1 || settings.DefaultAssistant == "" {
		settings.DefaultAssistant = cfg.ID
	}
	if err := ai.SaveSettings(settings); err != nil {
		utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
		return
	}
	cfg.APIKey = maskKey(cfg.APIKey)
	utils.Created(ctx, cfg)
}

// GET /ai/assistants 助手列表（API Key 脱敏）
func (c *AIController) ListAssistants(ctx *gin.Context) {
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	list := make([]ai.AssistantConfig, 0, len(settings.Assistants))
	for _, a := range settings.Assistants {
		a.APIKey = maskKey(a.APIKey)
		list = append(list, a)
	}
	utils.Success(ctx, gin.H{
		"list":    list,
		"default": settings.DefaultAssistant,
	})
}

// UpdateAssistantRequest 更新助手（Enabled 缺省沿用旧值）
type UpdateAssistantRequest struct {
	ai.AssistantConfig
	Enabled *bool `json:"enabled"`
}

// PUT /ai/assistants/:id 更新助手
func (c *AIController) UpdateAssistant(ctx *gin.Context) {
	id := ctx.Param("id")
	var req UpdateAssistantRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}

	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	idx := -1
	for i := range settings.Assistants {
		if settings.Assistants[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		utils.NotFound(ctx, "未找到该 AI 助手")
		return
	}

	old := settings.Assistants[idx]
	apiKey := req.APIKey
	// 脱敏值或不填时保留旧 Key
	if apiKey == "" || strings.Contains(apiKey, "*") {
		apiKey = old.APIKey
	}

	cfg := req.AssistantConfig
	if err := validateAssistant(&cfg); err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	cfg.ID = id
	cfg.APIKey = apiKey
	cfg.Enabled = (req.Enabled == nil && old.Enabled) || (req.Enabled != nil && *req.Enabled)
	settings.Assistants[idx] = cfg

	if err := ai.SaveSettings(settings); err != nil {
		utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
		return
	}
	cfg.APIKey = maskKey(cfg.APIKey)
	utils.Success(ctx, cfg)
}

// DELETE /ai/assistants/:id 删除助手
func (c *AIController) DeleteAssistant(ctx *gin.Context) {
	id := ctx.Param("id")
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	idx := -1
	for i := range settings.Assistants {
		if settings.Assistants[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		utils.NotFound(ctx, "未找到该 AI 助手")
		return
	}
	if len(settings.Assistants) == 1 {
		utils.BadRequest(ctx, "至少保留一个 AI 助手")
		return
	}
	settings.Assistants = append(settings.Assistants[:idx], settings.Assistants[idx+1:]...)
	if settings.DefaultAssistant == id {
		settings.DefaultAssistant = settings.Assistants[0].ID
	}
	if err := ai.SaveSettings(settings); err != nil {
		utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"deleted": true})
}

// PUT /ai/assistants/:id/default 设为默认助手
func (c *AIController) SetDefaultAssistant(ctx *gin.Context) {
	id := ctx.Param("id")
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	if _, err := ai.FindAssistant(settings, id); err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}
	settings.DefaultAssistant = id
	if err := ai.SaveSettings(settings); err != nil {
		utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"saved": true})
}

// PUT /ai/assistants/:id/enabled 启用 / 停用助手
func (c *AIController) ToggleAssistant(ctx *gin.Context) {
	id := ctx.Param("id")
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := ctx.ShouldBindJSON(&body); err != nil || body.Enabled == nil {
		utils.BadRequest(ctx, "请求参数错误: enabled 必填")
		return
	}
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	a, err := ai.FindAssistant(settings, id)
	if err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}
	a.Enabled = *body.Enabled
	if err := ai.SaveSettings(settings); err != nil {
		utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"saved": true})
}

// PUT /ai/assistants/:id/models/:modelId/enabled 启用 / 停用模型
func (c *AIController) ToggleModel(ctx *gin.Context) {
	assistantID := ctx.Param("id")
	modelID := ctx.Param("modelId")
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := ctx.ShouldBindJSON(&body); err != nil || body.Enabled == nil {
		utils.BadRequest(ctx, "请求参数错误: enabled 必填")
		return
	}
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	a, err := ai.FindAssistant(settings, assistantID)
	if err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}
	for i := range a.Models {
		if a.Models[i].ID == modelID {
			a.Models[i].Enabled = *body.Enabled
			if err := ai.SaveSettings(settings); err != nil {
				utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
				return
			}
			utils.Success(ctx, gin.H{"saved": true})
			return
		}
	}
	utils.NotFound(ctx, "未找到该模型")
}

// ============ Provider 列表（聊天下拉用）============

// ProviderInfo Provider 描述
type ProviderInfo struct {
	Name    string `json:"name"`    // 助手 ID
	Label   string `json:"label"`   // 助手名称
	Type    string `json:"type"`    // openai | anthropic | cli
	Default bool   `json:"default"` // 是否默认助手
	Models  []ModelOption `json:"models"` // 启用的模型
}

// ModelOption 可选模型
type ModelOption struct {
	ID      string `json:"id"`
	Name    string `json:"name,omitempty"`
	Default bool   `json:"default"` // 是否该助手下的首选模型
	Ready   bool   `json:"ready"`   // 配置是否可用（API 有 Key，CLI 有命令）
}

// GET /ai/providers 列出已启用的助手与模型（含默认标记）
func (c *AIController) ListProviders(ctx *gin.Context) {
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	providers := []ProviderInfo{}
	for _, a := range settings.Assistants {
		if !a.Enabled {
			continue
		}
		ready := readiness(a)
		models := []ModelOption{}
		for _, m := range a.Models {
			if !m.Enabled {
				continue
			}
			models = append(models, ModelOption{
				ID:      m.ID,
				Name:    m.Name,
				Default: m.ID == firstEnabledModel(&a),
				Ready:   ready,
			})
		}
		if len(models) == 0 {
			// 未配置模型时提供空选项占位，避免下拉只有助手名
			models = append(models, ModelOption{ID: "", Name: "未配置模型", Default: true, Ready: ready})
		}
		providers = append(providers, ProviderInfo{
			Name:    a.ID,
			Label:   a.Name,
			Type:    a.Type,
			Default: a.ID == settings.DefaultAssistant,
			Models:  models,
		})
	}
	utils.Success(ctx, gin.H{
		"default": settings.DefaultAssistant,
		"list":    providers,
	})
}

// readiness 助手配置是否可用
func readiness(a ai.AssistantConfig) bool {
	switch a.Type {
	case "openai", "anthropic":
		return a.APIKey != "" || a.BaseURL != ""
	case "cli":
		return a.Command != ""
	}
	return false
}

// firstEnabledModel 返回第一个启用的模型 ID
func firstEnabledModel(a *ai.AssistantConfig) string {
	for _, m := range a.Models {
		if m.Enabled {
			return m.ID
		}
	}
	return ""
}

// maskKey API Key 脱敏
func maskKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return "****"
	}
	return key[:4] + "****" + key[len(key)-4:]
}

// ChatRequest SSE 对话请求
type ChatRequestBody struct {
	SessionID    string `json:"sessionId"`
	Message      string `json:"message"`
	SystemPrompt string `json:"systemPrompt"`
	AssistantID  string `json:"assistantId"` // AI 助手 ID
	Provider     string `json:"provider"`    // 兼容旧字段，等价于助手 ID
	Model        string `json:"model"`
}

// sseEvent SSE 事件帧
type sseEvent struct {
	Event string `json:"event"` // delta / done / error
	Data  string `json:"data"`
}

// POST /ai/chat  (SSE 流式响应)
func (c *AIController) Chat(ctx *gin.Context) {
	var body ChatRequestBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	if strings.TrimSpace(body.Message) == "" {
		utils.BadRequest(ctx, "消息不能为空")
		return
	}

	// 加载设置并解析助手
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	assistantID := body.AssistantID
	if assistantID == "" {
		assistantID = body.Provider
	}
	assistant, err := ai.FindAssistant(settings, assistantID)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	if !assistant.Enabled {
		utils.BadRequest(ctx, "该 AI 助手已被停用，请在设置中启用")
		return
	}
	provider, err := ai.GetProvider(assistant)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	// 会话：无则创建
	sessionID := body.SessionID
	if sessionID == "" {
		title := []rune(strings.TrimSpace(body.Message))
		if len(title) > 24 {
			title = title[:24]
		}
		s, err := ai.CreateSession(string(title), nil)
		if err != nil {
			utils.InternalError(ctx, "创建会话失败: "+err.Error())
			return
		}
		sessionID = s.ID
	}

	// 持久化用户消息
	if _, err := ai.AppendMessage(sessionID, "user", body.Message, "", ""); err != nil {
		utils.InternalError(ctx, "保存消息失败: "+err.Error())
		return
	}

	// 构建请求（历史 + 本条消息）
	history, err := ai.ListMessages(sessionID)
	if err != nil {
		utils.InternalError(ctx, "读取会话历史失败: "+err.Error())
		return
	}
	chatReq := ai.BuildChatRequest(body.SystemPrompt, history)

	// 注册可取消任务
	cancelCtx, cancel := ai.GetManager().StartTask(sessionID)
	defer cancel()

	// SSE 响应头
	ctx.Writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	ctx.Writer.Header().Set("Cache-Control", "no-cache")
	ctx.Writer.Header().Set("Connection", "keep-alive")
	ctx.Writer.Header().Set("X-Accel-Buffering", "no")
	ctx.Status(http.StatusOK)

	flusher, _ := ctx.Writer.(http.Flusher)

	writeSSE := func(event, data string) {
		payload, _ := json.Marshal(sseEvent{Event: event, Data: data})
		fmt.Fprintf(ctx.Writer, "data: %s\n\n", payload)
		if flusher != nil {
			flusher.Flush()
		}
	}

	// 先告知 sessionID（新建会话场景）
	writeSSE("session", sessionID)

	// 模型：未指定时使用助手下第一个启用的模型
	modelName := body.Model
	if modelName == "" {
		modelName = firstEnabledModel(assistant)
	}
	fullText, chatErr := provider.ChatStream(cancelCtx, *chatReq, ai.ChatOptions{
		APIKey:    assistant.APIKey,
		BaseURL:   assistant.BaseURL,
		Model:     modelName,
		MaxTokens: 4096,
	}, func(delta string) {
		writeSSE("delta", delta)
	})

	// 取消场景
	if chatErr != nil && cancelCtx.Err() != nil {
		writeSSE("done", "[已取消]")
		return
	}

	if chatErr != nil {
		writeSSE("error", chatErr.Error())
		return
	}

	// 持久化助手回复
	if fullText != "" {
		_, _ = ai.AppendMessage(sessionID, "assistant", fullText, assistant.ID, modelName)
		_ = ai.UpdateSession(sessionID, "", assistant.ID, modelName)
	}
	writeSSE("done", fullText)
}

// POST /ai/chat/cancel 取消当前生成
func (c *AIController) CancelChat(ctx *gin.Context) {
	ai.GetManager().StopCurrent()
	utils.Success(ctx, gin.H{"cancelled": true})
}

// TestAssistantRequest 连通性测速请求
type TestAssistantRequest struct {
	Model string `json:"model"`
}

// POST /ai/assistants/:id/test 连通性测速
// 默认取第一个启用模型发送一条最小消息，返回连通状态与耗时
func (c *AIController) TestAssistant(ctx *gin.Context) {
	var body TestAssistantRequest
	_ = ctx.ShouldBindJSON(&body)

	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	assistant, err := ai.FindAssistant(settings, ctx.Param("id"))
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}
	provider, err := ai.GetProvider(assistant)
	if err != nil {
		utils.BadRequest(ctx, err.Error())
		return
	}

	// 模型：默认取第一个启用的模型
	modelName := body.Model
	if modelName == "" {
		modelName = firstEnabledModel(assistant)
	}
	if modelName == "" {
		utils.BadRequest(ctx, "该助手没有启用的模型，请先在编辑中启用一个模型")
		return
	}

	// CLI 冷启动较慢，给 60s 超时
	testCtx, cancel := context.WithTimeout(ctx.Request.Context(), 60*time.Second)
	defer cancel()

	chatReq := ai.BuildChatRequest("", []ai.AIMessage{
		{Role: "user", Content: "连通性测试：请只回复两个字母 pong，不要输出其他内容"},
	})

	start := time.Now()
	reply, chatErr := provider.ChatStream(testCtx, *chatReq, ai.ChatOptions{
		APIKey:    assistant.APIKey,
		BaseURL:   assistant.BaseURL,
		Model:     modelName,
		MaxTokens: 64,
	}, nil)
	latency := time.Since(start).Milliseconds()

	if chatErr != nil {
		utils.Success(ctx, gin.H{
			"ok":        false,
			"model":     modelName,
			"latencyMs": latency,
			"error":     chatErr.Error(),
		})
		return
	}

	// 回复截断，避免超长内容塞进设置页
	reply = strings.TrimSpace(reply)
	if runes := []rune(reply); len(runes) > 80 {
		reply = string(runes[:80]) + "…"
	}
	utils.Success(ctx, gin.H{
		"ok":        true,
		"model":     modelName,
		"latencyMs": latency,
		"reply":     reply,
	})
}

// GET /ai/sessions 会话列表
func (c *AIController) ListSessions(ctx *gin.Context) {
	sessions, err := ai.ListSessions()
	if err != nil {
		utils.InternalError(ctx, "读取会话失败: "+err.Error())
		return
	}
	utils.Success(ctx, sessions)
}

// POST /ai/sessions 新建会话 body: { "title": "", "problemId": "" }
func (c *AIController) CreateSession(ctx *gin.Context) {
	var req struct {
		Title     string  `json:"title"`
		ProblemID *string `json:"problemId"`
	}
	_ = ctx.ShouldBindJSON(&req)

	s, err := ai.CreateSession(req.Title, req.ProblemID)
	if err != nil {
		utils.InternalError(ctx, "创建会话失败: "+err.Error())
		return
	}
	utils.Created(ctx, s)
}

// GET /ai/sessions/:id
func (c *AIController) GetSession(ctx *gin.Context) {
	s, err := ai.GetSession(ctx.Param("id"))
	if err != nil {
		utils.NotFound(ctx, err.Error())
		return
	}
	utils.Success(ctx, s)
}

// PUT /ai/sessions/:id
func (c *AIController) UpdateSession(ctx *gin.Context) {
	id := ctx.Param("id")
	var req struct {
		Title    string `json:"title"`
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}
	if err := ai.UpdateSession(id, req.Title, req.Provider, req.Model); err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}
	utils.Success(ctx, gin.H{"updated": true})
}

// DELETE /ai/sessions/:id
func (c *AIController) DeleteSession(ctx *gin.Context) {
	if err := ai.DeleteSession(ctx.Param("id")); err != nil {
		utils.InternalError(ctx, err.Error())
		return
	}
	utils.Success(ctx, gin.H{"deleted": true})
}

// ============ 兼容旧接口（保留 settings 读写，前端旧版本可降级）============

// GetAISettingsResponse AI 设置响应（API Key 脱敏）
type GetAISettingsResponse struct {
	DefaultAssistant string                 `json:"defaultAssistant"`
	Assistants       []ai.AssistantConfig   `json:"assistants"`
}

// GET /ai/settings
func (c *AIController) GetAISettings(ctx *gin.Context) {
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	list := make([]ai.AssistantConfig, 0, len(settings.Assistants))
	for _, a := range settings.Assistants {
		a.APIKey = maskKey(a.APIKey)
		list = append(list, a)
	}
	utils.Success(ctx, GetAISettingsResponse{
		DefaultAssistant: settings.DefaultAssistant,
		Assistants:       list,
	})
}
