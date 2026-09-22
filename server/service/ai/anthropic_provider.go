package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// AnthropicProvider 官方 Anthropic SDK 封装
type AnthropicProvider struct {
	cfg AnthropicProviderConfig
}

func NewAnthropicProvider(cfg AnthropicProviderConfig) *AnthropicProvider {
	return &AnthropicProvider{cfg: cfg}
}

func (p *AnthropicProvider) Name() string { return "anthropic" }

func (p *AnthropicProvider) ChatStream(ctx context.Context, req ChatRequest, opts ChatOptions, onDelta StreamFunc) (string, error) {
	apiKey := opts.APIKey
	if apiKey == "" {
		apiKey = p.cfg.APIKey
	}
	if apiKey == "" {
		return "", fmt.Errorf("Anthropic API Key 未配置，请在设置中填写")
	}
	model := opts.Model
	if model == "" {
		model = p.cfg.Model
	}
	maxTokens := opts.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	// 构建 option 列表
	clientOpts := []option.RequestOption{option.WithAPIKey(apiKey)}
	if opts.BaseURL != "" {
		clientOpts = append(clientOpts, option.WithBaseURL(opts.BaseURL))
	} else if p.cfg.BaseURL != "" {
		clientOpts = append(clientOpts, option.WithBaseURL(p.cfg.BaseURL))
	}
	client := anthropic.NewClient(clientOpts...)

	// 消息转换（anthropic 约定 system 独立传参）
	var messages []anthropic.MessageParam
	for _, m := range req.Messages {
		if m.Role == "system" {
			continue
		}
		role := anthropic.MessageParamRoleUser
		if m.Role == "assistant" {
			role = anthropic.MessageParamRoleAssistant
		}
		messages = append(messages, anthropic.MessageParam{
			Role: role,
			Content: []anthropic.ContentBlockParamUnion{
				anthropic.NewTextBlock(m.Content),
			},
		})
	}

	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(model),
		MaxTokens: int64(maxTokens),
		Messages:  messages,
	}
	if sys := strings.TrimSpace(req.SystemPrompt); sys != "" {
		params.System = []anthropic.TextBlockParam{{Text: sys}}
	}

	stream := client.Messages.NewStreaming(ctx, params)

	var full strings.Builder
	for stream.Next() {
		select {
		case <-ctx.Done():
			return full.String(), ctx.Err()
		default:
		}
		switch event := stream.Current().AsAny().(type) {
		case anthropic.ContentBlockDeltaEvent:
			if td := event.Delta.AsTextDelta(); td.Text != "" {
				full.WriteString(td.Text)
				if onDelta != nil {
					onDelta(td.Text)
				}
			}
		}
	}
	if err := stream.Err(); err != nil {
		return full.String(), err
	}
	return full.String(), nil
}
