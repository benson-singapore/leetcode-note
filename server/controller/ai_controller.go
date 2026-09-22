package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	ai "leetcode-note-sidecar/service/ai"
	"leetcode-note-sidecar/utils"
)

// AIController AI 问答接口
type AIController struct{}

func NewAIController() *AIController {
	return &AIController{}
}

// ProviderInfo Provider 描述
type ProviderInfo struct {
	Name    string `json:"name"`
	Label   string `json:"label"`
	Model   string `json:"model"`
	Ready   bool   `json:"ready"`
}

// GET /ai/providers 列出可用的 Provider
func (c *AIController) ListProviders(ctx *gin.Context) {
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}

	providers := []ProviderInfo{
		{Name: "openai", Label: "OpenAI 兼容", Model: settings.OpenAI.Model, Ready: settings.OpenAI.APIKey != "" || settings.OpenAI.BaseURL != ""},
		{Name: "anthropic", Label: "Anthropic Claude", Model: settings.Anthropic.Model, Ready: settings.Anthropic.APIKey != ""},
		{Name: "cli", Label: "本地 CLI", Model: settings.CLI.Model, Ready: settings.CLI.Command != ""},
	}
	utils.Success(ctx, gin.H{
		"default": settings.DefaultProvider,
		"list":    providers,
	})
}

// GetAISettingsResponse AI 设置响应（API Key 脱敏）
type GetAISettingsResponse struct {
	DefaultProvider string                  `json:"defaultProvider"`
	OpenAI          ai.OpenAIProviderConfig `json:"openai"`
	Anthropic       ai.AnthropicProviderConfig `json:"anthropic"`
	CLI             ai.CLIProviderConfig    `json:"cli"`
}

func maskKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 8 {
		return "****"
	}
	return key[:4] + "****" + key[len(key)-4:]
}

// GET /ai/settings
func (c *AIController) GetAISettings(ctx *gin.Context) {
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	resp := GetAISettingsResponse{
		DefaultProvider: settings.DefaultProvider,
		OpenAI:          settings.OpenAI,
		Anthropic:       settings.Anthropic,
		CLI:             settings.CLI,
	}
	resp.OpenAI.APIKey = maskKey(resp.OpenAI.APIKey)
	resp.Anthropic.APIKey = maskKey(resp.Anthropic.APIKey)
	utils.Success(ctx, resp)
}

// PUT /ai/settings  body: GetAISettingsResponse（apiKey 为空或含 **** 表示不修改）
func (c *AIController) UpdateAISettings(ctx *gin.Context) {
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}

	var req GetAISettingsResponse
	if err := ctx.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(ctx, "请求参数错误: "+err.Error())
		return
	}

	if req.DefaultProvider != "" {
		settings.DefaultProvider = req.DefaultProvider
	}
	if req.OpenAI.APIKey != "" && !strings.Contains(req.OpenAI.APIKey, "*") {
		settings.OpenAI.APIKey = req.OpenAI.APIKey
	}
	if req.OpenAI.BaseURL != "" || req.OpenAI.Model != "" {
		settings.OpenAI.BaseURL = req.OpenAI.BaseURL
		settings.OpenAI.Model = req.OpenAI.Model
	}
	if req.Anthropic.APIKey != "" && !strings.Contains(req.Anthropic.APIKey, "*") {
		settings.Anthropic.APIKey = req.Anthropic.APIKey
	}
	if req.Anthropic.BaseURL != "" || req.Anthropic.Model != "" {
		settings.Anthropic.BaseURL = req.Anthropic.BaseURL
		settings.Anthropic.Model = req.Anthropic.Model
	}
	if req.CLI.Command != "" {
		settings.CLI.Command = req.CLI.Command
	}
	if req.CLI.Args != nil {
		settings.CLI.Args = req.CLI.Args
	}
	if req.CLI.Model != "" {
		settings.CLI.Model = req.CLI.Model
	}

	if err := ai.SaveSettings(settings); err != nil {
		utils.InternalError(ctx, "保存 AI 设置失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"saved": true})
}

// ChatRequest SSE 对话请求
type ChatRequestBody struct {
	SessionID    string `json:"sessionId"`
	Message      string `json:"message"`
	SystemPrompt string `json:"systemPrompt"`
	Provider     string `json:"provider"`
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

	// 加载设置
	settings, err := ai.LoadSettings()
	if err != nil {
		utils.InternalError(ctx, "加载 AI 设置失败: "+err.Error())
		return
	}
	providerName := body.Provider
	if providerName == "" {
		providerName = settings.DefaultProvider
	}
	provider, err := ai.GetProvider(providerName, settings)
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

	modelName := body.Model
	fullText, chatErr := provider.ChatStream(cancelCtx, *chatReq, ai.ChatOptions{
		APIKey:    providerAPIKey(providerName, settings),
		BaseURL:   providerBaseURL(providerName, settings),
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
		_, _ = ai.AppendMessage(sessionID, "assistant", fullText, providerName, modelName)
		_ = ai.UpdateSession(sessionID, "", providerName, modelName)
	}
	writeSSE("done", fullText)
}

func providerAPIKey(name string, s *ai.Settings) string {
	switch name {
	case "anthropic":
		return s.Anthropic.APIKey
	case "openai":
		return s.OpenAI.APIKey
	default:
		return ""
	}
}

func providerBaseURL(name string, s *ai.Settings) string {
	switch name {
	case "anthropic":
		return s.Anthropic.BaseURL
	case "openai":
		return s.OpenAI.BaseURL
	default:
		return ""
	}
}

// POST /ai/chat/cancel 取消当前生成
func (c *AIController) CancelChat(ctx *gin.Context) {
	ai.GetManager().StopCurrent()
	utils.Success(ctx, gin.H{"cancelled": true})
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
		utils.InternalError(ctx, "删除会话失败: "+err.Error())
		return
	}
	utils.Success(ctx, gin.H{"deleted": true})
}
