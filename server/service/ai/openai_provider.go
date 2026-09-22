package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

// OpenAIProvider 官方 OpenAI SDK 封装（兼容所有 OpenAI 协议服务：OpenAI / DeepSeek / Ollama / 本地推理等）
type OpenAIProvider struct {
	cfg OpenAIProviderConfig
}

func NewOpenAIProvider(cfg OpenAIProviderConfig) *OpenAIProvider {
	return &OpenAIProvider{cfg: cfg}
}

func (p *OpenAIProvider) Name() string { return "openai" }

func (p *OpenAIProvider) ChatStream(ctx context.Context, req ChatRequest, opts ChatOptions, onDelta StreamFunc) (string, error) {
	apiKey := opts.APIKey
	if apiKey == "" {
		apiKey = p.cfg.APIKey
	}
	model := opts.Model
	if model == "" {
		model = p.cfg.Model
	}
	if apiKey == "" && opts.BaseURL == "" && p.cfg.BaseURL == "" {
		return "", fmt.Errorf("OpenAI API Key 未配置，请在设置中填写")
	}

	clientOpts := make([]option.RequestOption, 0, 2)
	if apiKey != "" {
		clientOpts = append(clientOpts, option.WithAPIKey(apiKey))
	}
	baseURL := opts.BaseURL
	if baseURL == "" {
		baseURL = p.cfg.BaseURL
	}
	if baseURL != "" {
		clientOpts = append(clientOpts, option.WithBaseURL(baseURL))
	}
	client := openai.NewClient(clientOpts...)

	var messages []openai.ChatCompletionMessageParamUnion
	if sys := strings.TrimSpace(req.SystemPrompt); sys != "" {
		messages = append(messages, openai.SystemMessage(sys))
	}
	for _, m := range req.Messages {
		switch m.Role {
		case "assistant":
			messages = append(messages, openai.AssistantMessage(m.Content))
		case "system":
			messages = append(messages, openai.SystemMessage(m.Content))
		default:
			messages = append(messages, openai.UserMessage(m.Content))
		}
	}

	params := openai.ChatCompletionNewParams{
		Model:    model,
		Messages: messages,
	}
	if opts.MaxTokens > 0 {
		params.MaxTokens = openai.Int(int64(opts.MaxTokens))
	}
	if opts.Temperature > 0 {
		params.Temperature = openai.Float(opts.Temperature)
	}

	stream := client.Chat.Completions.NewStreaming(ctx, params)

	var full strings.Builder
	for stream.Next() {
		select {
		case <-ctx.Done():
			return full.String(), ctx.Err()
		default:
		}
		chunk := stream.Current()
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				full.WriteString(choice.Delta.Content)
				if onDelta != nil {
					onDelta(choice.Delta.Content)
				}
			}
		}
	}
	if err := stream.Err(); err != nil {
		return full.String(), err
	}
	return full.String(), nil
}
