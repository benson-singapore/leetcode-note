package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

// Settings AI 全局设置（存储在 settings 表，key = "ai_settings"）
type Settings struct {
	DefaultProvider string                `json:"defaultProvider"`
	OpenAI          OpenAIProviderConfig  `json:"openai"`
	Anthropic       AnthropicProviderConfig `json:"anthropic"`
	CLI             CLIProviderConfig     `json:"cli"`
}

type OpenAIProviderConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseURL"`
	Model   string `json:"model"`
}

type AnthropicProviderConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseURL"`
	Model   string `json:"model"`
}

type CLIProviderConfig struct {
	Command string   `json:"command"` // 如 claude / ollama
	Args    []string `json:"args"`    // 命令参数模板
	Model   string   `json:"model"`
}

const aiSettingsKey = "ai_settings"

// LoadSettings 从 settings 表加载 AI 设置；为空时返回默认值
func LoadSettings() (*Settings, error) {
	raw, err := getSettingValue(aiSettingsKey)
	if err != nil {
		return nil, err
	}
	s := &Settings{
		DefaultProvider: "openai",
		OpenAI:          OpenAIProviderConfig{Model: "gpt-4o-mini"},
		Anthropic:       AnthropicProviderConfig{Model: "claude-sonnet-4-20250514"},
		CLI:             CLIProviderConfig{Command: "claude", Args: []string{"-p"}},
	}
	if raw == "" {
		return s, nil
	}
	if err := json.Unmarshal([]byte(raw), s); err != nil {
		log.Printf("[AI] 解析 ai_settings 失败，使用默认配置: %v", err)
	}
	return s, nil
}

// SaveSettings 持久化 AI 设置
func SaveSettings(s *Settings) error {
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	return setSettingValue(aiSettingsKey, string(data))
}

// GetProvider 按名称返回实现了 Provider 的实例
func GetProvider(name string, s *Settings) (Provider, error) {
	switch name {
	case "openai":
		return NewOpenAIProvider(s.OpenAI), nil
	case "anthropic":
		return NewAnthropicProvider(s.Anthropic), nil
	case "cli":
		return NewCLIProvider(s.CLI), nil
	default:
		return nil, fmt.Errorf("未知的 AI Provider: %s", name)
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
