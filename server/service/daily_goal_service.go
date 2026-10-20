package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	ai "leetcode-note-sidecar/service/ai"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// DailyGoalService 今日目标：配置选题、AI 智能选题、手动按题号生成
type DailyGoalService struct {
	goalRepo    *repository.DailyGoalRepository
	problemRepo *repository.ProblemRepository
	sync        *ProblemSyncService
	frequency   *LeetCodeFrequency
}

func NewDailyGoalService() *DailyGoalService {
	return &DailyGoalService{
		goalRepo:    repository.NewDailyGoalRepository(),
		problemRepo: repository.NewProblemRepository(),
		sync:        NewProblemSyncService(),
		frequency:   NewLeetCodeFrequency(),
	}
}

// DailyGoalDate 返回有效的 YYYY-MM-DD 日期，非法输入回退到本地今天。
func DailyGoalDate(date string) string {
	date = strings.TrimSpace(date)
	if date != "" {
		if _, err := time.Parse("2006-01-02", date); err == nil {
			return date
		}
	}
	return time.Now().Format("2006-01-02")
}

// GetByDate 获取某天今日目标；无目标时返回 nil。
func (s *DailyGoalService) GetByDate(date string) (*models.DailyGoal, error) {
	goal, err := s.goalRepo.GetByDate(DailyGoalDate(date))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return goal, err
}

// GenerateWithAI 根据配置从题库候选题中让 AI 选题并写入今日目标。
func (s *DailyGoalService) GenerateWithAI(cfg *models.DailyGoalConfig, date string) (*models.DailyGoal, error) {
	if cfg == nil {
		cfg = &models.DailyGoalConfig{}
	}
	if cfg.Count <= 0 {
		cfg.Count = 5
	}
	if cfg.Count > 20 {
		cfg.Count = 20
	}
	date = DailyGoalDate(date)

	candidates, err := s.goalRepo.ListCandidates(cfg.Difficulties, cfg.Tags, 160)
	if err != nil {
		return nil, fmt.Errorf("读取候选题失败: %w", err)
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("题库中没有符合当前筛选条件的题目，请调整知识点或难度，或先同步更多题目")
	}
	count := cfg.Count
	if count > len(candidates) {
		count = len(candidates)
	}
	cfg.Count = count

	prompt := buildDailyGoalPrompt(cfg, candidates)
	reply, err := s.callAI(prompt)
	if err != nil {
		return nil, fmt.Errorf("AI 选题失败: %w", err)
	}
	log.Printf("[DailyGoal] AI 选题返回: %s\n", truncateDailyGoalLog(reply, 500))

	selected := parseAIProblemIDs(reply, candidates)
	if len(selected) == 0 {
		return nil, fmt.Errorf("AI 未返回有效的题目编号，请稍后重试")
	}

	// 数量不足时用候选池补齐，保证用户配置的题目数量生效。
	seen := map[string]bool{}
	problemIDs := []string{}
	for _, id := range selected {
		if seen[id] {
			continue
		}
		seen[id] = true
		problemIDs = append(problemIDs, id)
		if len(problemIDs) >= count {
			break
		}
	}
	for _, c := range candidates {
		if len(problemIDs) >= count {
			break
		}
		if seen[c.ProblemID] {
			continue
		}
		seen[c.ProblemID] = true
		problemIDs = append(problemIDs, c.ProblemID)
	}

	for _, problemID := range problemIDs {
		if err := s.goalRepo.EnsureUserProblem(problemID); err != nil {
			log.Printf("[DailyGoal] 初始化题目用户记录失败: %s, %v\n", problemID, err)
		}
	}

	configJSON, _ := json.Marshal(cfg)
	return s.goalRepo.Replace(date, "今日目标", string(configJSON), problemIDs, nil)
}

// GenerateManual 按题号 / slug 生成今日目标；append=true 时追加到当前目标。
func (s *DailyGoalService) GenerateManual(numbers []string, date, title string, appendMode bool) (*models.DailyGoal, error) {
	date = DailyGoalDate(date)
	problemIDs := []string{}
	seen := map[string]bool{}
	baselines := map[string]string{}

	if appendMode {
		if current, err := s.GetByDate(date); err == nil && current != nil {
			for _, item := range current.Items {
				if !seen[item.ProblemID] {
					seen[item.ProblemID] = true
					problemIDs = append(problemIDs, item.ProblemID)
					baselines[item.ProblemID] = item.BaselineStatus
				}
			}
		}
	}

	added := 0
	failures := []string{}
	for _, raw := range numbers {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		problem, err := s.resolveProblem(key)
		if err != nil {
			log.Printf("[DailyGoal] 解析题号失败: %s, %v\n", key, err)
			failures = append(failures, key)
			continue
		}
		if seen[problem.ID] {
			continue
		}
		seen[problem.ID] = true
		problemIDs = append(problemIDs, problem.ID)
		added++
		if err := s.goalRepo.EnsureUserProblem(problem.ID); err != nil {
			log.Printf("[DailyGoal] 初始化题目用户记录失败: %s, %v\n", problem.ID, err)
		}
	}

	if added == 0 && !appendMode {
		if len(failures) > 0 {
			return nil, fmt.Errorf("未能导入题目：%s", strings.Join(failures, ", "))
		}
		return nil, fmt.Errorf("请至少输入一个题目编号")
	}
	if len(problemIDs) == 0 {
		return nil, fmt.Errorf("请至少输入一个题目编号")
	}

	if strings.TrimSpace(title) == "" {
		title = "今日目标"
	}
	cfg := models.DailyGoalConfig{Count: len(problemIDs)}
	configJSON, _ := json.Marshal(cfg)
	return s.goalRepo.Replace(date, title, string(configJSON), problemIDs, baselines)
}

// Clear 清空某天的今日目标。
func (s *DailyGoalService) Clear(date string) error {
	return s.goalRepo.DeleteByDate(DailyGoalDate(date))
}

// LibraryStats 题库基础信息。
func (s *DailyGoalService) LibraryStats() (map[string]int, error) {
	return s.goalRepo.LibraryStats()
}

// lcNumberPattern 匹配 “LC 1”“lc-1” 之类的题号输入，避免误伤 lcof 等 slug。
var lcNumberPattern = regexp.MustCompile(`(?i)^lc[\s-]*(\d+)$`)

// resolveProblem 支持前端题号、内部 lc_id 与 titleSlug；本地不存在时从 LeetCode 同步。
func (s *DailyGoalService) resolveProblem(key string) (*models.Problem, error) {
	raw := strings.TrimSpace(key)
	raw = strings.TrimPrefix(raw, "#")
	if match := lcNumberPattern.FindStringSubmatch(raw); len(match) == 2 {
		raw = match[1]
	}

	if n, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil && n > 0 {
		if problem, err := s.problemRepo.GetProblemByFrontendID(n); err == nil && problem != nil {
			return problem, nil
		} else if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		info, err := s.frequency.GetQuestionInfoByFrontendID(strconv.Itoa(n))
		if err != nil {
			return nil, fmt.Errorf("题号 %d 在 LeetCode 中不存在或无法获取: %w", n, err)
		}
		return s.sync.SyncAndFetch(info.TitleSlug)
	}

	slug := strings.ToLower(strings.TrimSpace(raw))
	if problem, err := s.problemRepo.GetProblemByTitleSlug(slug); err == nil && problem != nil {
		return problem, nil
	} else if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	return s.sync.SyncAndFetch(slug)
}

// callAI 走系统默认模型链，失败时依次尝试下一个模型。
func (s *DailyGoalService) callAI(prompt string) (string, error) {
	settings, err := ai.LoadSettings()
	if err != nil {
		return "", fmt.Errorf("加载 AI 设置失败: %w", err)
	}

	type candidate struct {
		assistant *ai.AssistantConfig
		provider  ai.Provider
		model     string
	}
	candidates := []candidate{}

	for i := range settings.DefaultChain {
		entry := settings.DefaultChain[i]
		if ai.ChainCooldownRemaining(entry.AssistantID, entry.Model) > 0 {
			continue
		}
		a, err := ai.FindAssistant(settings, entry.AssistantID)
		if err != nil || !a.Enabled {
			continue
		}
		enabled := false
		for _, m := range a.Models {
			if m.ID == entry.Model && m.Enabled {
				enabled = true
				break
			}
		}
		if !enabled {
			continue
		}
		p, err := ai.GetProvider(a)
		if err != nil {
			continue
		}
		candidates = append(candidates, candidate{assistant: a, provider: p, model: entry.Model})
	}

	// 默认模型链为空时，回退到默认助手的首个启用模型。
	if len(candidates) == 0 {
		if a, err := ai.FindAssistant(settings, settings.DefaultAssistant); err == nil && a.Enabled {
			for _, m := range a.Models {
				if !m.Enabled {
					continue
				}
				if p, err := ai.GetProvider(a); err == nil {
					candidates = append(candidates, candidate{assistant: a, provider: p, model: m.ID})
				}
				break
			}
		}
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("请先在设置中配置可用的 AI 模型")
	}

	chatReq := ai.ChatRequest{
		SystemPrompt: "你是 LeetCode 刷题规划助手。你只从给定的候选题目中挑选题目，并严格输出 JSON，不输出 markdown 或解释。",
		Messages: []ai.ChatMessage{
			{Role: "user", Content: prompt},
		},
	}

	var lastErr error
	for _, cand := range candidates {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		reply, err := cand.provider.ChatStream(ctx, chatReq, ai.ChatOptions{
			APIKey:    cand.assistant.APIKey,
			BaseURL:   cand.assistant.BaseURL,
			Model:     cand.model,
			MaxTokens: 1024,
		}, nil)
		cancel()
		if err == nil {
			ai.ClearChainFailure(cand.assistant.ID, cand.model)
			return reply, nil
		}
		ai.MarkChainFailure(cand.assistant.ID, cand.model)
		lastErr = err
		log.Printf("[DailyGoal] AI 模型 %s/%s 调用失败: %v\n", cand.assistant.ID, cand.model, err)
	}
	return "", lastErr
}

// buildDailyGoalPrompt 组织 AI 选题提示词。
func buildDailyGoalPrompt(cfg *models.DailyGoalConfig, candidates []models.DailyGoalCandidate) string {
	var b strings.Builder
	b.WriteString("请根据用户的练习配置，从候选题目中挑选最合适的题目，组成今日刷题目标。\n\n")
	b.WriteString("用户配置：\n")
	fmt.Fprintf(&b, "- 题目数量：%d 道\n", cfg.Count)
	if len(cfg.Difficulties) > 0 {
		fmt.Fprintf(&b, "- 难度：%s\n", strings.Join(cfg.Difficulties, "、"))
	} else {
		b.WriteString("- 难度：不限\n")
	}
	if len(cfg.Tags) > 0 {
		fmt.Fprintf(&b, "- 知识点：%s\n", strings.Join(cfg.Tags, "、"))
	} else {
		b.WriteString("- 知识点：不限\n")
	}
	if strings.TrimSpace(cfg.Notes) != "" {
		fmt.Fprintf(&b, "- 补充要求：%s\n", strings.TrimSpace(cfg.Notes))
	}
	b.WriteString("\n选题要求：\n")
	b.WriteString("1. 只能从下列候选题中选择，严禁编造不存在的题号。\n")
	b.WriteString("2. 优先选择尚未练习或仍在复习中的题目，尽量避免已精通的题目。\n")
	b.WriteString("3. 尽量覆盖用户选择的知识点，难度搭配合理。\n")
	b.WriteString("4. 题目数量必须等于用户配置的数量（候选不足时取全部候选）。\n\n")
	b.WriteString("候选题（题号 | 标题 | 难度 | 知识点 | 当前状态）：\n")
	for _, c := range candidates {
		title := c.TranslatedTitle
		if strings.TrimSpace(title) == "" {
			title = c.Title
		}
		fmt.Fprintf(&b, "%d | %s | %s | %s | %s\n",
			c.LcFrontendID, title, c.Difficulty, formatCandidateTags(c.TopicTags), c.ProgressStatus)
	}
	b.WriteString("\n请只输出如下 JSON（problems 数组中填入你选择的题号，不要 markdown 代码块，不要额外文字）：\n")
	b.WriteString("{\"problems\":[...]}\n")
	return b.String()
}

func formatCandidateTags(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "-"
	}
	var tags []struct {
		Name           string `json:"name"`
		NameTranslated string `json:"nameTranslated"`
		TranslatedName string `json:"translatedName"`
	}
	if err := json.Unmarshal([]byte(raw), &tags); err == nil && len(tags) > 0 {
		out := make([]string, 0, len(tags))
		for _, t := range tags {
			name := t.TranslatedName
			if name == "" {
				name = t.NameTranslated
			}
			if name == "" {
				name = t.Name
			}
			if name != "" {
				out = append(out, name)
			}
		}
		if len(out) > 0 {
			return strings.Join(out, "/")
		}
	}
	if len([]rune(raw)) > 60 {
		return string([]rune(raw)[:60]) + "…"
	}
	return raw
}

// parseAIProblemIDs 从 AI 回复中提取题号，并映射回本地题库题目 ID。
func parseAIProblemIDs(reply string, candidates []models.DailyGoalCandidate) []string {
	byFrontend := map[int]string{}
	byLcID := map[string]string{}
	for _, c := range candidates {
		if c.LcFrontendID > 0 {
			byFrontend[c.LcFrontendID] = c.ProblemID
		}
		byLcID[strings.TrimSpace(c.LcID)] = c.ProblemID
	}

	numbers := []int{}
	cleaned := strings.TrimSpace(reply)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)

	var payload struct {
		Problems []int `json:"problems"`
	}
	if start, end := strings.Index(cleaned, "{"), strings.LastIndex(cleaned, "}"); start >= 0 && end > start {
		if err := json.Unmarshal([]byte(cleaned[start:end+1]), &payload); err == nil {
			numbers = payload.Problems
		}
	}
	if len(numbers) == 0 {
		var arr []int
		if start, end := strings.Index(cleaned, "["), strings.LastIndex(cleaned, "]"); start >= 0 && end > start {
			if err := json.Unmarshal([]byte(cleaned[start:end+1]), &arr); err == nil {
				numbers = arr
			}
		}
	}
	if len(numbers) == 0 {
		for _, token := range regexp.MustCompile(`\d+`).FindAllString(cleaned, -1) {
			if n, err := strconv.Atoi(token); err == nil {
				numbers = append(numbers, n)
			}
		}
	}

	out := []string{}
	seen := map[string]bool{}
	for _, n := range numbers {
		if id, ok := byFrontend[n]; ok && !seen[id] {
			seen[id] = true
			out = append(out, id)
			continue
		}
		if id, ok := byLcID[strconv.Itoa(n)]; ok && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func truncateDailyGoalLog(s string, limit int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit]) + "…"
}
