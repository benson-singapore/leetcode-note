package ai

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// CLIModelInfo CLI 本地配置中发现的模型
type CLIModelInfo struct {
	ID        string `json:"id"`
	IsDefault bool   `json:"isDefault,omitempty"`
}

var (
	tomlModelLine  = regexp.MustCompile(`(?m)^\s*model\s*=\s*"([^"]+)"`)
	tomlProfileHdr = regexp.MustCompile(`(?m)^\s*\[profiles\.([^\]\.]+)\]`)
)

// homeDir 当前用户主目录（测试可覆盖）
var homeDir = os.UserHomeDir

// DetectCLIModels 尽力从 CLI 本地配置中发现可用模型
// 不同 CLI 没有统一的 list-models 命令，只能读取各自配置文件：
//   - codex:  ~/.codex/config.toml 的 model / [profiles.*].model，以及 model_catalog_json 指向的模型目录
//   - claude: ~/.claude/settings.json 与 ~/.claude.json 的 model 字段，附官方别名
//   - generic: 无约定，返回空由用户手动填写
func DetectCLIModels(kind string) []CLIModelInfo {
	switch kind {
	case CLIKindCodex:
		return detectCodexModels()
	case CLIKindClaude:
		return detectClaudeModels()
	default:
		return nil
	}
}

func detectCodexModels() []CLIModelInfo {
	home, err := homeDir()
	if err != nil {
		return nil
	}
	raw, err := os.ReadFile(filepath.Join(home, ".codex", "config.toml"))
	if err != nil {
		return nil
	}
	content := string(raw)

	seen := map[string]bool{}
	models := []CLIModelInfo{}
	add := func(id string, isDefault bool) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		models = append(models, CLIModelInfo{ID: id, IsDefault: isDefault})
	}

	// 顶层默认 model（文件中最先出现的 model =）
	if m := tomlModelLine.FindStringSubmatch(content); m != nil {
		add(m[1], true)
	}

	// [profiles.*] 下的 model（截取各 profile 段再匹配）
	hdrs := tomlProfileHdr.FindAllStringSubmatchIndex(content, -1)
	for i, h := range hdrs {
		start := h[1]
		end := len(content)
		if i+1 < len(hdrs) {
			end = hdrs[i+1][0]
		}
		if m := tomlModelLine.FindStringSubmatch(content[start:end]); m != nil {
			add(m[1], false)
		}
	}

	// model_catalog_json 指向的模型目录（如 cc-switch 等工具生成的 catalog）
	if m := regexp.MustCompile(`(?m)^\s*model_catalog_json\s*=\s*"([^"]+)"`).FindStringSubmatch(content); m != nil {
		for _, id := range parseCatalogJSON(resolveCodexPath(home, m[1])) {
			add(id, false)
		}
	}

	return models
}

// resolveCodexPath 相对路径基于 ~/.codex/ 解析
func resolveCodexPath(home, p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(home, ".codex", p)
}

// parseCatalogJSON 解析模型目录 JSON：{"models":[{"slug":"..."}]}
func parseCatalogJSON(path string) []string {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var catalog struct {
		Models []struct {
			Slug string `json:"slug"`
		} `json:"models"`
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		return nil
	}
	ids := make([]string, 0, len(catalog.Models))
	for _, m := range catalog.Models {
		if m.Slug != "" {
			ids = append(ids, m.Slug)
		}
	}
	return ids
}

// claudeAliases Claude Code 官方模型别名
var claudeAliases = []string{"sonnet", "opus", "haiku"}

func detectClaudeModels() []CLIModelInfo {
	home, err := homeDir()
	if err != nil {
		return nil
	}

	seen := map[string]bool{}
	models := []CLIModelInfo{}
	add := func(id string, isDefault bool) {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		models = append(models, CLIModelInfo{ID: id, IsDefault: isDefault})
	}

	// settings.json 与 ~/.claude.json 的 model 字段
	var readModel = func(path string) {
		raw, err := os.ReadFile(path)
		if err != nil {
			return
		}
		var cfg struct {
			Model string `json:"model"`
		}
		if json.Unmarshal(raw, &cfg) == nil {
			add(cfg.Model, len(models) == 0)
		}
	}
	readModel(filepath.Join(home, ".claude", "settings.json"))
	readModel(filepath.Join(home, ".claude.json"))

	// 官方别名兜底
	for _, a := range claudeAliases {
		add(a, false)
	}
	return models
}
