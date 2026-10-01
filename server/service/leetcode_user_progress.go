package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"leetcode-note-sidecar/config"
)

// UserQuestionProgress 用户刷题进度（按难度分组的已通过 / 尝试失败 / 未做过）
type UserQuestionProgress struct {
	NumAcceptedQuestions  []DifficultyCount `json:"numAcceptedQuestions"`
	NumFailedQuestions    []DifficultyCount `json:"numFailedQuestions"`
	NumUntouchedQuestions []DifficultyCount `json:"numUntouchedQuestions"`
}

// DifficultyCount 某一难度下的题目数量
type DifficultyCount struct {
	Difficulty string `json:"difficulty"`
	Count      int    `json:"count"`
}

// SolvedQuestion 已刷题目条目（从 /api/problems/all/ 过滤 AC 状态得到）
type SolvedQuestion struct {
	Title      string `json:"title"`
	TitleSlug  string `json:"titleSlug"`
	Difficulty string `json:"difficulty"` // Easy / Medium / Hard
}

type userQuestionProgressGraphQLData struct {
	UserProfileUserQuestionProgress *UserQuestionProgress `json:"userProfileUserQuestionProgress"`
}

const userQuestionProgressQuery = `
query userQuestionProgress($userSlug: String!) {
  userProfileUserQuestionProgress(userSlug: $userSlug) {
    numAcceptedQuestions { difficulty count }
    numFailedQuestions { difficulty count }
    numUntouchedQuestions { difficulty count }
  }
}
`

// FetchUserQuestionProgress 拉取当前绑定账号的刷题进度统计（按难度）
func (g *LeetCodeGraphQL) FetchUserQuestionProgress() (*UserQuestionProgress, error) {
	cookie, err := config.GetSetting("leetcode_cookie")
	if err != nil {
		return nil, err
	}
	if cookie == "" {
		return nil, fmt.Errorf("未配置 LeetCode Cookie，请先在设置中绑定账号")
	}
	cookie, userAgent, err := config.LeetCodeRequestAuth(cookie)
	if err != nil {
		return nil, err
	}

	profile, err := g.FetchUserProfile()
	if err != nil {
		return nil, err
	}

	reqBody := GraphQLRequest{
		Query:         userQuestionProgressQuery,
		Variables:     map[string]interface{}{"userSlug": profile.UserSlug},
		OperationName: "userQuestionProgress",
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", "https://leetcode.cn/graphql/", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", cookie)
	req.Header.Set("x-csrftoken", config.ExtractLeetCodeCSRF(cookie))
	req.Header.Set("operation-name", "userQuestionProgress")
	req.Header.Set("Origin", "https://leetcode.cn")
	req.Header.Set("Referer", "https://leetcode.cn/")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncateForLog(body))
	}
	if !bytes.HasPrefix(bytes.TrimSpace(body), []byte("{")) {
		return nil, fmt.Errorf("LeetCode 返回了非 JSON 响应（可能被风控拦截），请重试")
	}

	var graphqlResp GraphQLResponse
	if err := json.Unmarshal(body, &graphqlResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w, body=%s", err, truncateForLog(body))
	}
	if len(graphqlResp.Errors) > 0 {
		return nil, fmt.Errorf("GraphQL 错误: %v", graphqlResp.Errors)
	}

	var data userQuestionProgressGraphQLData
	if err := json.Unmarshal(graphqlResp.Data, &data); err != nil {
		return nil, err
	}

	if data.UserProfileUserQuestionProgress == nil {
		return nil, fmt.Errorf("未获取到刷题进度数据")
	}

	return data.UserProfileUserQuestionProgress, nil
}

// SolvedListResult 已刷题目列表
type SolvedListResult struct {
	Total     int              `json:"total"`
	Solved    int              `json:"solved"`
	Questions []SolvedQuestion `json:"questions"`
}

// problemsAllResponse /api/problems/all/ 的响应结构
type problemsAllResponse struct {
	StatStatusPairs []problemsAllPair `json:"stat_status_pairs"`
}

type problemsAllPair struct {
	Status     string `json:"status"` // "ac" 表示已通过
	PaidOnly   bool   `json:"paid_only"`
	Difficulty struct {
		Level int `json:"level"` // 1 Easy / 2 Medium / 3 Hard
	} `json:"difficulty"`
	Stat struct {
		QuestionID         int         `json:"question_id"`
		FrontendQuestionID interface{} `json:"frontend_question_id"` // 数字或 "LCR xxx" 字符串
		Title              string      `json:"question__title"`
		TitleSlug          string      `json:"question__title_slug"`
	} `json:"stat"`
}

// pairFrontendID 将 frontend_question_id（数字或字符串）规范化为字符串
func pairFrontendID(v interface{}) string {
	switch t := v.(type) {
	case float64:
		return fmt.Sprintf("%d", int(t))
	case string:
		return t
	default:
		return ""
	}
}

// difficultyFromLevel 将 /api/problems/all/ 的 difficulty.level 转为 Easy/Medium/Hard
func difficultyFromLevel(level int) string {
	switch level {
	case 1:
		return "Easy"
	case 3:
		return "Hard"
	default:
		return "Medium"
	}
}

// FetchSolvedQuestions 拉取当前绑定账号的全部已通过题目列表
func (g *LeetCodeGraphQL) FetchSolvedQuestions() (*SolvedListResult, error) {
	cookie, err := config.GetSetting("leetcode_cookie")
	if err != nil {
		return nil, err
	}
	if cookie == "" {
		return nil, fmt.Errorf("未配置 LeetCode Cookie，请先在设置中绑定账号")
	}
	cookie, userAgent, err := config.LeetCodeRequestAuth(cookie)
	if err != nil {
		return nil, err
	}

	csrf := config.ExtractLeetCodeCSRF(cookie)
	req, err := http.NewRequest("GET", "https://leetcode.cn/api/problems/all/", nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 60 * time.Second}
	req.Header.Set("Cookie", cookie)
	req.Header.Set("x-csrftoken", csrf)
	req.Header.Set("Origin", "https://leetcode.cn")
	req.Header.Set("Referer", "https://leetcode.cn/problemset/")
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncateForLog(body))
	}
	if !bytes.HasPrefix(bytes.TrimSpace(body), []byte("{")) {
		return nil, fmt.Errorf("LeetCode 返回了非 JSON 响应（可能被风控拦截），请重试")
	}

	var parsed problemsAllResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	result := &SolvedListResult{Total: len(parsed.StatStatusPairs)}
	for _, pair := range parsed.StatStatusPairs {
		if pair.Status != "ac" || pair.Stat.TitleSlug == "" {
			continue
		}
		result.Questions = append(result.Questions, SolvedQuestion{
			Title:      pair.Stat.Title,
			TitleSlug:  pair.Stat.TitleSlug,
			Difficulty: difficultyFromLevel(pair.Difficulty.Level),
		})
	}
	result.Solved = len(result.Questions)

	log.Printf("[LeetCode] 已刷题目列表: 共 %d 题, 已通过 %d 题\n", result.Total, result.Solved)
	return result, nil
}
