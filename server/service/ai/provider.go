package ai

import "context"

// OpenAIProviderConfig OpenAI 兼容服务配置
type OpenAIProviderConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseURL"`
	Model   string `json:"model"`
}

// AnthropicProviderConfig Anthropic Claude 配置
type AnthropicProviderConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseURL"`
	Model   string `json:"model"`
}

// CLIProviderConfig 本地 CLI 配置
type CLIProviderConfig struct {
	Command string   `json:"command"`  // 如 codex / claude
	Args    []string `json:"args"`     // 命令参数模板（generic 模式）
	CliKind string   `json:"cliKind"`  // 预置适配类型：codex / claude / generic
	Model   string   `json:"model"`
}

// ChatMessage 统一的消息结构（Provider 无关）
type ChatMessage struct {
	Role    string `json:"role"` // user / assistant / system
	Content string `json:"content"`
}

// ChatRequest 一次对话请求
type ChatRequest struct {
	SystemPrompt string
	Messages     []ChatMessage // 不含 system，按时间顺序
}

// ChatOptions Provider 配置
type ChatOptions struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
}

// StreamFunc 流式回调：每收到一段增量文本调用一次
type StreamFunc func(delta string)

// Provider 统一 AI Provider 接口
// 官方 SDK（OpenAI/Anthropic）与 CLI 子进程封装都实现该接口
type Provider interface {
	// Name Provider 标识：openai / anthropic / cli
	Name() string
	// ChatStream 流式对话，返回完整回复文本
	ChatStream(ctx context.Context, req ChatRequest, opts ChatOptions, onDelta StreamFunc) (string, error)
}
