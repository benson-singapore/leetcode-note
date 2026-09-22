package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"

	"leetcode-note-sidecar/config"
)

type GraphQLRequest struct {
	Query         string                 `json:"query"`
	Variables     map[string]interface{} `json:"variables"`
	OperationName string                 `json:"operationName,omitempty"`
}

type GraphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []interface{}   `json:"errors"`
}

type LeetCodeGraphQL struct {
	client *http.Client
}

func NewLeetCodeGraphQL() *LeetCodeGraphQL {
	return &LeetCodeGraphQL{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// FetchProblemWithPlaywright 使用 Playwright 获取 Cookie 后请求 GraphQL
func (g *LeetCodeGraphQL) FetchProblemWithPlaywright(titleSlug string) (*ProblemData, error) {
	// 使用 Playwright 获取有效的 Cookie
	cookies, err := g.getCookiesWithPlaywright()
	if err != nil {
		// 如果获取 Cookie 失败，尝试使用空 Cookie（某些题目可能不需要认证）
		return g.fetchProblemWithCookies(titleSlug, "")
	}

	// 使用 Cookie 请求 GraphQL API
	return g.fetchProblemWithCookies(titleSlug, cookies)
}

// getCookiesWithPlaywright 使用 Playwright 获取有效的 Cookie
func (g *LeetCodeGraphQL) getCookiesWithPlaywright() (string, error) {
	script := `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    // 访问 LeetCode 首页以获取 Cookie
    await page.goto('https://leetcode.cn/', { waitUntil: 'networkidle' });
    
    // 获取所有 Cookie
    const cookies = await context.cookies();
    const cookieString = cookies
      .map(c => c.name + '=' + c.value)
      .join('; ');
    
    console.log(cookieString);
  } finally {
    await browser.close();
  }
})();
`

	tmpFile, err := os.CreateTemp("", "get_cookies_*.js")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(script); err != nil {
		tmpFile.Close()
		return "", err
	}
	tmpFile.Close()

	// 在后端目录执行，确保能找到 node_modules
	cmd := exec.Command("node", tmpFile.Name())

	// 设置工作目录为后端目录
	backendDir := os.Getenv("BACKEND_DIR")
	if backendDir == "" {
		// 尝试从当前目录推断
		backendDir = "."
	}
	cmd.Dir = backendDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("执行脚本失败: %w, 输出: %s", err, string(output))
	}

	return string(bytes.TrimSpace(output)), nil
}

// fetchProblemWithCookies 使用 Cookie 请求 GraphQL API
func (g *LeetCodeGraphQL) fetchProblemWithCookies(titleSlug string, cookies string) (*ProblemData, error) {
	query := `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    titleSlug
    translatedTitle
    content
    translatedContent
    difficulty
    categoryTitle
    topicTags {
      name
      slug
      translatedName
    }
    codeSnippets {
      lang
      langName
      code
    }
    exampleTestcases
    sampleTestCase
    likes
    dislikes
    isPaidOnly
    stats
    similarQuestions {
      title
      titleSlug
      difficulty
      translatedTitle
    }
    positionLevelTags
  }
}
`

	reqBody := GraphQLRequest{
		Query: query,
		Variables: map[string]interface{}{
			"titleSlug": titleSlug,
		},
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
	req.Header.Set("Cookie", cookies)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://leetcode.cn/problems/"+titleSlug+"/")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var graphqlResp GraphQLResponse
	if err := json.Unmarshal(body, &graphqlResp); err != nil {
		return nil, err
	}

	if len(graphqlResp.Errors) > 0 {
		return nil, fmt.Errorf("GraphQL 错误: %v", graphqlResp.Errors)
	}

	var problemData ProblemData
	if err := json.Unmarshal(graphqlResp.Data, &problemData); err != nil {
		return nil, err
	}

	return &problemData, nil
}

// SyncedUserCode 力扣「已同步到题库」的提交代码（需登录 Cookie，对应前端 syncedCode GraphQL）
type SyncedUserCode struct {
	Code      string `json:"code"`
	Timestamp string `json:"timestamp"`
}

type syncedCodeGraphQLData struct {
	ProblemsetUserSyncedCode *struct {
		Code      string `json:"code"`
		Timestamp string `json:"timestamp"`
	} `json:"problemsetUserSyncedCode"`
}

const syncedCodeQuery = `
query syncedCode($questionSlug: String!, $langSlug: String!) {
  problemsetUserSyncedCode(titleSlug: $questionSlug, lang: $langSlug) {
    code
    timestamp
  }
}
`

// FetchSyncedUserCode 调用 leetcode.cn/graphql/noj-go/ 的 syncedCode，根据题目 slug 与语言拉取当前账号已保存的实现代码
func (g *LeetCodeGraphQL) FetchSyncedUserCode(questionSlug, langSlug string) (*SyncedUserCode, error) {
	if questionSlug == "" {
		return nil, fmt.Errorf("questionSlug 不能为空")
	}
	if langSlug == "" {
		langSlug = "java"
	}

	cookie, err := config.GetSetting("leetcode_cookie")
	if err != nil {
		return nil, err
	}

	if cookie == "" {
		return nil, fmt.Errorf("未配置 LeetCode Cookie，请先在设置中更新")
	}

	csrf := config.ExtractLeetCodeCSRF(cookie)

	reqBody := GraphQLRequest{
		Query: syncedCodeQuery,
		Variables: map[string]interface{}{
			"questionSlug": questionSlug,
			"langSlug":     langSlug,
		},
		OperationName: "syncedCode",
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", "https://leetcode.cn/graphql/noj-go/", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", cookie)
	if csrf != "" {
		req.Header.Set("x-csrftoken", csrf)
	}
	req.Header.Set("operation-name", "syncedCode")
	req.Header.Set("Origin", "https://leetcode.cn")
	req.Header.Set("Referer", "https://leetcode.cn/problems/"+questionSlug+"/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

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
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	var graphqlResp GraphQLResponse
	if err := json.Unmarshal(body, &graphqlResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w, body=%s", err, string(body))
	}

	if len(graphqlResp.Errors) > 0 {
		return nil, fmt.Errorf("GraphQL 错误: %v", graphqlResp.Errors)
	}

	var data syncedCodeGraphQLData
	if err := json.Unmarshal(graphqlResp.Data, &data); err != nil {
		return nil, err
	}

	out := &SyncedUserCode{}
	if data.ProblemsetUserSyncedCode != nil {
		out.Code = data.ProblemsetUserSyncedCode.Code
		out.Timestamp = data.ProblemsetUserSyncedCode.Timestamp
	}
	return out, nil
}
