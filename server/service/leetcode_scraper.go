package service

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
)

type LeetCodeScraper struct {
	playwrightPath string
}

type ProblemData struct {
	QuestionID         string        `json:"questionId"`
	QuestionFrontendID string        `json:"questionFrontendId"`
	Title              string        `json:"title"`
	TitleSlug          string        `json:"titleSlug"`
	QuestionTitle      string        `json:"questionTitle"`
	TranslatedTitle    string        `json:"translatedTitle"`
	Difficulty         string        `json:"difficulty"`
	Content            string        `json:"content"`
	TranslatedContent  string        `json:"translatedContent"`
	CategoryTitle      string        `json:"categoryTitle"`
	Stats              string        `json:"stats"`
	Style              string        `json:"style"`
	Likes              int           `json:"likes"`
	Dislikes           int           `json:"dislikes"`
	IsPaidOnly         bool          `json:"isPaidOnly"`
	Status             string        `json:"status"`
	IsLiked            bool          `json:"isLiked"`
	Hints              []string      `json:"hints"`
	TopicTags          []Tag         `json:"topicTags"`
	CodeSnippets       []CodeSnippet `json:"codeSnippets"`
	ExampleTestcases   string        `json:"exampleTestcases"`
	SampleTestCase     string        `json:"sampleTestCase"`
	Description        string        `json:"description"`
	Examples           string        `json:"examples"`
	Constraints        string        `json:"constraints"`
	SimilarQuestions   interface{}   `json:"similarQuestions"`  // 可以是字符串或数组
	PositionLevelTags  interface{}   `json:"positionLevelTags"` // 可以是字符串或数组
}

type SimilarQuestion struct {
	Title           string `json:"title"`
	TitleSlug       string `json:"titleSlug"`
	Difficulty      string `json:"difficulty"`
	TranslatedTitle string `json:"translatedTitle"`
}

type Tag struct {
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	TranslatedName string `json:"translatedName"`
}

type CodeSnippet struct {
	Code     string `json:"code"`
	Lang     string `json:"lang"`
	LangSlug string `json:"langSlug"`
}

func NewLeetCodeScraper() *LeetCodeScraper {
	return &LeetCodeScraper{}
}

// FetchProblem 使用 Playwright 获取 LeetCode 题目信息
func (s *LeetCodeScraper) FetchProblem(titleSlug string) (*ProblemData, error) {
	// 创建临时 Node.js 脚本
	scriptPath, err := s.createPlaywrightScript(titleSlug)
	if err != nil {
		return nil, fmt.Errorf("创建脚本失败: %w", err)
	}
	defer os.Remove(scriptPath)

	// 执行脚本
	cmd := exec.Command("node", scriptPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("执行脚本失败: %w, 输出: %s", err, string(output))
	}

	// 解析 JSON 结果
	var problem ProblemData
	if err := json.Unmarshal(output, &problem); err != nil {
		return nil, fmt.Errorf("解析结果失败: %w, 原始输出: %s", err, string(output))
	}

	return &problem, nil
}

// createPlaywrightScript 创建 Playwright 脚本
func (s *LeetCodeScraper) createPlaywrightScript(titleSlug string) (string, error) {
	// 创建临时文件
	tmpFile, err := os.CreateTemp("", "leetcode_*.js")
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	script := fmt.Sprintf(`
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    // 设置超时
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // 访问 LeetCode 题目页面
    const url = 'https://leetcode.cn/problems/%s/';
    console.error('正在访问: ' + url);
    
    await page.goto(url, { waitUntil: 'networkidle' });

    // 等待页面加载完成
    await page.waitForTimeout(2000);

    // 提取题目数据
    const problemData = await page.evaluate(() => {
      // 从页面中提取数据
      const scripts = Array.from(document.querySelectorAll('script'));
      let data = null;

      for (const script of scripts) {
        if (script.textContent.includes('questionData')) {
          try {
            const match = script.textContent.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
            if (match) {
              data = JSON.parse(match[1]);
              break;
            }
          } catch (e) {
            // 继续尝试下一个脚本
          }
        }
      }

      if (!data) {
        // 备用方案：从 GraphQL 响应中提取
        const graphqlData = window.__INITIAL_STATE__;
        if (graphqlData && graphqlData.questions) {
          data = graphqlData.questions[0];
        }
      }

      return data || {};
    });

    console.log(JSON.stringify(problemData));
  } catch (error) {
    console.error('错误: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`, titleSlug)

	if _, err := tmpFile.WriteString(script); err != nil {
		return "", err
	}

	return tmpFile.Name(), nil
}

// CheckPlaywrightInstalled 检查 Playwright 是否已安装
func (s *LeetCodeScraper) CheckPlaywrightInstalled() bool {
	cmd := exec.Command("npm", "list", "playwright")
	err := cmd.Run()
	return err == nil
}

// InstallPlaywright 安装 Playwright
func (s *LeetCodeScraper) InstallPlaywright() error {
	log.Println("正在安装 Playwright...")
	cmd := exec.Command("npm", "install", "playwright")
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm install playwright")
	}
	return cmd.Run()
}
