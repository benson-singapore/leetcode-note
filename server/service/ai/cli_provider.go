package ai

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// CLIProvider CLI 子进程封装：调用本地 AI CLI（如 claude、ollama、自定义脚本）
// 约定：完整 Prompt 通过 stdin 传入，CLI 输出到 stdout，逐行作为流式增量
type CLIProvider struct {
	cfg CLIProviderConfig
}

func NewCLIProvider(cfg CLIProviderConfig) *CLIProvider {
	return &CLIProvider{cfg: cfg}
}

func (p *CLIProvider) Name() string { return "cli" }

// buildPrompt 将系统提示与多轮对话拼成纯文本 Prompt
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

func (p *CLIProvider) ChatStream(ctx context.Context, req ChatRequest, opts ChatOptions, onDelta StreamFunc) (string, error) {
	command := p.cfg.Command
	if command == "" {
		return "", fmt.Errorf("未配置 AI CLI 命令，请在设置中填写")
	}

	args := append([]string{}, p.cfg.Args...)
	if opts.Model != "" {
		args = append(args, "--model", opts.Model)
	} else if p.cfg.Model != "" {
		args = append(args, "--model", p.cfg.Model)
	}

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Stdin = strings.NewReader(p.buildPrompt(req))

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
		full.WriteString(line)
		full.WriteString("\n")
		if onDelta != nil {
			onDelta(line + "\n")
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
