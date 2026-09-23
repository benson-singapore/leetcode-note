package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// 预置的本地 CLI 适配类型：不同 CLI 的参数与输出格式不同，单独封装解析
const (
	CLIKindCodex   = "codex"   // OpenAI Codex CLI：codex exec --json，JSONL 输出
	CLIKindClaude  = "claude"  // Claude Code CLI：claude -p --output-format stream-json
	CLIKindGeneric = "generic" // 通用：prompt 走 stdin，stdout 逐行透传
)

// InferCLIKind 根据命令名推断适配类型（兼容未带 cliKind 的旧配置）
func InferCLIKind(command string) string {
	base := strings.ToLower(filepath.Base(strings.TrimSpace(command)))
	base = strings.TrimSuffix(base, ".exe")
	switch base {
	case "codex":
		return CLIKindCodex
	case "claude":
		return CLIKindClaude
	}
	return CLIKindGeneric
}

// CLIProvider CLI 子进程封装：按 CLI 类型适配参数与输出解析
type CLIProvider struct {
	cfg  CLIProviderConfig
	kind string
}

func NewCLIProvider(cfg CLIProviderConfig) *CLIProvider {
	kind := cfg.CliKind
	if kind == "" {
		kind = InferCLIKind(cfg.Command)
	}
	return &CLIProvider{cfg: cfg, kind: kind}
}

func (p *CLIProvider) Name() string { return "cli" }

// buildArgs 按适配类型组装命令行参数，返回是否需要把 prompt 作为最后一个参数传入
func (p *CLIProvider) buildArgs() (args []string, promptAsArg bool) {
	model := p.cfg.Model
	switch p.kind {
	case CLIKindCodex:
		// codex exec --json --skip-git-repo-check [--model X] "prompt"
		args = []string{"exec", "--json", "--skip-git-repo-check"}
		if model != "" {
			args = append(args, "--model", model)
		}
		return args, true
	case CLIKindClaude:
		// claude -p --output-format stream-json --verbose [--model X] "prompt"
		args = []string{"-p", "--output-format", "stream-json", "--verbose"}
		if model != "" {
			args = append(args, "--model", model)
		}
		return args, true
	default:
		// 通用模式：参数模板 + 可选 --model，prompt 走 stdin
		args = append([]string{}, p.cfg.Args...)
		if model != "" {
			args = append(args, "--model", model)
		}
		return args, false
	}
}

// buildPrompt 将系统提示与多轮对话拼成纯文本 Prompt（generic 模式用）
func (p *CLIProvider) buildPrompt(req ChatRequest) string {
	var sb strings.Builder
	if sys := strings.TrimSpace(req.SystemPrompt); sys != "" {
		sb.WriteString("[System]\n")
		sb.WriteString(sys)
		sb.WriteString("\n\n")
	}
	for _, m := range req.Messages {
		switch m.Role {
		case "assistant":
			sb.WriteString("[Assistant]\n")
		case "system":
			sb.WriteString("[System]\n")
		default:
			sb.WriteString("[User]\n")
		}
		sb.WriteString(m.Content)
		sb.WriteString("\n\n")
	}
	sb.WriteString("[Assistant]\n")
	return sb.String()
}

// codexEvent codex exec --json 的 JSONL 事件
type codexEvent struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Item    *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"item"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// parseCodexLine 解析 codex JSONL，返回增量文本
func parseCodexLine(line string) (string, error) {
	if !strings.HasPrefix(strings.TrimSpace(line), "{") {
		return "", nil
	}
	var ev codexEvent
	if err := json.Unmarshal([]byte(line), &ev); err != nil {
		return "", nil // 非 JSON 行忽略
	}
	switch ev.Type {
	case "item.completed", "item.updated":
		// 只取 agent_message（reasoning 等其他 item 类型忽略）
		if ev.Item != nil && ev.Item.Type == "agent_message" && ev.Item.Text != "" {
			return ev.Item.Text + "\n", nil
		}
	case "error":
		if ev.Message != "" {
			return "", fmt.Errorf("%s", ev.Message)
		}
	case "turn.failed":
		if ev.Error != nil && ev.Error.Message != "" {
			return "", fmt.Errorf("%s", ev.Error.Message)
		}
		return "", fmt.Errorf("codex 执行失败")
	}
	return "", nil
}

// claudeEvent claude -p --output-format stream-json 的 JSONL 事件
type claudeEvent struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype"`
	Result  string `json:"result"`
	Message *struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message"`
}

// parseClaudeLine 解析 claude stream-json，返回增量文本
func parseClaudeLine(line string) (string, error) {
	if !strings.HasPrefix(strings.TrimSpace(line), "{") {
		return "", nil
	}
	var ev claudeEvent
	if err := json.Unmarshal([]byte(line), &ev); err != nil {
		return "", nil
	}
	switch ev.Type {
	case "assistant":
		if ev.Message == nil {
			return "", nil
		}
		var sb strings.Builder
		for _, block := range ev.Message.Content {
			if block.Type == "text" && block.Text != "" {
				sb.WriteString(block.Text)
			}
		}
		if sb.Len() > 0 {
			return sb.String() + "\n", nil
		}
	case "result":
		if ev.Subtype != "success" {
			msg := ev.Result
			if msg == "" {
				msg = "claude 执行失败: " + ev.Subtype
			}
			return "", fmt.Errorf("%s", msg)
		}
		// 成功的 result 是完整汇总，assistant 事件已流式输出，忽略避免重复
	}
	return "", nil
}

func (p *CLIProvider) ChatStream(ctx context.Context, req ChatRequest, opts ChatOptions, onDelta StreamFunc) (string, error) {
	command := p.cfg.Command
	if command == "" {
		return "", fmt.Errorf("未配置 AI CLI 命令，请在设置中选择 CLI 类型")
	}

	baseArgs, promptAsArg := p.buildArgs()
	args := append([]string{}, baseArgs...)
	prompt := p.buildPrompt(req)
	if promptAsArg {
		// codex / claude 把 prompt 作为最后一个参数
		args = append(args, prompt)
	}

	cmd := exec.CommandContext(ctx, command, args...)
	if !promptAsArg {
		cmd.Stdin = strings.NewReader(prompt)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("创建 CLI 输出管道失败: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("启动 AI CLI 失败: %w", err)
	}

	var full strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			_ = cmd.Process.Kill()
			return full.String(), ctx.Err()
		default:
		}
		line := scanner.Text()

		var delta string
		switch p.kind {
		case CLIKindCodex:
			delta, err = parseCodexLine(line)
		case CLIKindClaude:
			delta, err = parseClaudeLine(line)
		default:
			delta = line + "\n"
		}
		if err != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return full.String(), fmt.Errorf("AI CLI 执行失败: %v, stderr: %s", err, strings.TrimSpace(stderr.String()))
		}
		if delta == "" {
			continue
		}
		full.WriteString(delta)
		if onDelta != nil {
			onDelta(delta)
		}
	}

	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return full.String(), ctx.Err()
		}
		return full.String(), fmt.Errorf("AI CLI 执行失败: %v, stderr: %s", err, stderr.String())
	}
	return full.String(), nil
}
