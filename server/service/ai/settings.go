package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

// Settings AI 全局设置（存储在 settings 表，key = "ai_settings"）
// 支持多个 AI 助手，每个助手可配置多个模型
type Settings struct {
	DefaultAssistant string            `json:"defaultAssistant"`
	Assistants       []AssistantConfig `json:"assistants"`
}

// AssistantConfig 单个 AI 助手配置
// Type = openai / anthropic 时走 API，Type = cli 时走本地命令行
type AssistantConfig struct {
	ID      string        `json:"id"`
	Name    string        `json:"name"`
	Type    string        `json:"type"` // openai | anthropic | cli
	Enabled bool          `json:"enabled"`
	APIKey  string        `json:"apiKey,omitempty"`
	BaseURL string        `json:"baseURL,omitempty"`
	Command string        `json:"command,omitempty"` // CLI 命令，如 codex / claude
	Args    []string      `json:"args,omitempty"`    // CLI 参数模板（generic 自定义模式）
	CliKind string        `json:"cliKind,omitempty"` // 预置适配类型：codex / claude / generic
	Models  []ModelConfig `json:"models"`
}

// ModelConfig 助手下挂的模型
type ModelConfig struct {
	ID      string `json:"id"`   // 模型名，如 gpt-4o-mini
	Name    string `json:"name,omitempty"`
	Enabled bool   `json:"enabled"`
}

const aiSettingsKey = "ai_settings"

// LoadSettings 从 settings 表加载 AI 设置；为空或为旧版结构时返回默认值
func LoadSettings() (*Settings, error) {
	raw, err := getSettingValue(aiSettingsKey)
	if err != nil {
		return nil, err
	}
	s := defaultSettings()
	if raw == "" {
		return s, nil
	}
	if err := json.Unmarshal([]byte(raw), s); err != nil {
		log.Printf("[AI] 解析 ai_settings 失败，使用默认配置: %v", err)
		return s, nil
	}
	// 兼容旧版结构（defaultProvider + openai/anthropic/cli 单例）
	if len(s.Assistants) == 0 {
		s = migrateLegacySettings(raw)
	}
	if s.DefaultAssistant == "" && len(s.Assistants) > 0 {
		s.DefaultAssistant = s.Assistants[0].ID
	}
	return s, nil
}

func defaultSettings() *Settings {
	return &Settings{
		Assistants: []AssistantConfig{},
	}
}

// migrateLegacySettings 将旧版单例配置转换为助手列表
func migrateLegacySettings(raw string) *Settings {
	var legacy struct {
		DefaultProvider string                  `json:"defaultProvider"`
		OpenAI          OpenAIProviderConfig    `json:"openai"`
		Anthropic       AnthropicProviderConfig `json:"anthropic"`
		CLI             CLIProviderConfig       `json:"cli"`
	}
	_ = json.Unmarshal([]byte(raw), &legacy)

	s := defaultSettings()
	if legacy.OpenAI.APIKey != "" || legacy.OpenAI.BaseURL != "" || legacy.OpenAI.Model != "" {
		s.Assistants = append(s.Assistants, AssistantConfig{
			ID:      "openai",
			Name:    "OpenAI 兼容",
			Type:    "openai",
			Enabled: true,
			APIKey:  legacy.OpenAI.APIKey,
			BaseURL: legacy.OpenAI.BaseURL,
			Models:  enabledModels(legacy.OpenAI.Model),
		})
	}
	if legacy.Anthropic.APIKey != "" || legacy.Anthropic.BaseURL != "" {
		s.Assistants = append(s.Assistants, AssistantConfig{
			ID:      "anthropic",
			Name:    "Anthropic Claude",
			Type:    "anthropic",
			Enabled: true,
			APIKey:  legacy.Anthropic.APIKey,
			BaseURL: legacy.Anthropic.BaseURL,
			Models:  enabledModels(legacy.Anthropic.Model),
		})
	}
	if legacy.CLI.Command != "" {
		s.Assistants = append(s.Assistants, AssistantConfig{
			ID:      "cli",
			Name:    "本地 CLI",
			Type:    "cli",
			Enabled: true,
			Command: legacy.CLI.Command,
			Args:    legacy.CLI.Args,
			CliKind: InferCLIKind(legacy.CLI.Command),
			Models:  enabledModels(legacy.CLI.Model),
		})
	}
	if len(s.Assistants) == 0 {
		return s
	}
	s.DefaultAssistant = s.Assistants[0].ID
	for _, a := range s.Assistants {
		if a.ID == legacy.DefaultProvider {
			s.DefaultAssistant = a.ID
		}
	}
	return s
}

func enabledModels(ids ...string) []ModelConfig {
	models := []ModelConfig{}
	for _, id := range ids {
		if id == "" {
			continue
		}
		models = append(models, ModelConfig{ID: id, Enabled: true})
	}
	return models
}

// SaveSettings 持久化 AI 设置
func SaveSettings(s *Settings) error {
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	return setSettingValue(aiSettingsKey, string(data))
}

// FindAssistant 按 ID 查找助手
func FindAssistant(s *Settings, id string) (*AssistantConfig, error) {
	if id == "" {
		id = s.DefaultAssistant
	}
	for i := range s.Assistants {
		if s.Assistants[i].ID == id {
			return &s.Assistants[i], nil
		}
	}
	return nil, fmt.Errorf("未找到 AI 助手: %s", id)
}

// GetProvider 根据助手配置返回实现了 Provider 的实例
func GetProvider(a *AssistantConfig) (Provider, error) {
	switch a.Type {
	case "openai":
		return NewOpenAIProvider(OpenAIProviderConfig{APIKey: a.APIKey, BaseURL: a.BaseURL}), nil
	case "anthropic":
		return NewAnthropicProvider(AnthropicProviderConfig{APIKey: a.APIKey, BaseURL: a.BaseURL}), nil
	case "cli":
		return NewCLIProvider(CLIProviderConfig{Command: a.Command, Args: a.Args, CliKind: a.CliKind}), nil
	default:
		return nil, fmt.Errorf("未知的 AI Provider 类型: %s", a.Type)
	}
}

// Manager 管理当前活跃的生成任务，用于取消
type Manager struct {
	mu        sync.Mutex
	currentID string
	cancels   map[string]context.CancelFunc
}

var mgr = &Manager{cancels: map[string]context.CancelFunc{}}

// GetManager 全局 Manager 实例
func GetManager() *Manager {
	return mgr
}

// StartTask 注册一个可取消的生成任务
func (m *Manager) StartTask(id string) (context.Context, context.CancelFunc) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.StopTask(id, false)

	ctx, cancel := context.WithCancel(context.Background())
	m.currentID = id
	m.cancels[id] = cancel
	return ctx, cancel
}

// StopTask 取消指定任务；broadcast=false 时不校验当前任务
func (m *Manager) StopTask(id string, _ bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cancel, ok := m.cancels[id]; ok {
		cancel()
		delete(m.cancels, id)
	}
}

// StopCurrent 取消当前正在生成的任务
func (m *Manager) StopCurrent() {
	m.mu.Lock()
	id := m.currentID
	m.mu.Unlock()
	if id != "" {
		m.StopTask(id, false)
	}
}
