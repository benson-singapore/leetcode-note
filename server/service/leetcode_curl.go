package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type LeetCodeCurl struct {
	client *http.Client
}

func NewLeetCodeCurl() *LeetCodeCurl {
	return &LeetCodeCurl{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// FetchProblem 直接使用 HTTP 请求获取题目（无需 Playwright）
func (l *LeetCodeCurl) FetchProblem(titleSlug string) (*ProblemData, error) {
	log.Printf("[LeetCode] 开始获取题目: %s\n", titleSlug)

	query := `
    query questionDetail($titleSlug: String!) {
  languageList {
    id
    name
    verboseName
  }
  statusList {
    id
    name: translatedName
  }
  question(titleSlug: $titleSlug) {
    title
    titleSlug
    questionId
    questionFrontendId
    questionTitle
    translatedTitle
    content
    translatedContent
    categoryTitle
    difficulty
    stats
    style
    contributors {
      username
      profileUrl
      avatarUrl
    }
    book {
      id
      bookName
      pressName
      source
      shortDescription
      fullDescription
      bookImgUrl
      pressImgUrl
      productUrl
    }
    companyTagStatsV2
    topicTags {
      name
      slug
      translatedName
    }
    positionLevelTags {
      name
      nameTranslated
      slug
    }
    similarQuestions
    mysqlSchemas
    dataSchemas
    frontendPreviews
    likes
    dislikes
    isPaidOnly
    status
    boundTopicId
    enableTestMode
    metaData
    enableRunCode
    enableSubmit
    envInfo
    isLiked
    nextChallengePairs
    libraryUrl
    hints
    codeSnippets {
      code
      lang
      langSlug
    }
    jsonExampleTestcases
    exampleTestcases
    sampleTestCase
    hasFrontendPreview
    editorType
    featuredContests {
      titleSlug
      titleCn
      title
    }
  }
}
    `

	reqBody := GraphQLRequest{
		Query:     query,
		Variables: map[string]interface{}{"titleSlug": titleSlug},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		log.Printf("[LeetCode] JSON 序列化失败: %v\n", err)
		return nil, err
	}

	log.Printf("[LeetCode] 请求体大小: %d 字节\n", len(jsonBody))

	req, err := http.NewRequest("POST", "https://leetcode.cn/graphql/", bytes.NewBuffer(jsonBody))
	if err != nil {
		log.Printf("[LeetCode] 创建请求失败: %v\n", err)
		return nil, err
	}

	// 设置必要的请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36")
	req.Header.Set("Referer", "https://leetcode.cn/problems/"+titleSlug+"/")
	req.Header.Set("Origin", "https://leetcode.cn")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	log.Printf("[LeetCode] 发送请求到: %s\n", req.URL.String())

	resp, err := l.client.Do(req)
	if err != nil {
		log.Printf("[LeetCode] 请求执行失败: %v\n", err)
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("[LeetCode] 响应状态码: %d\n", resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[LeetCode] 读取响应体失败: %v\n", err)
		return nil, err
	}

	log.Printf("[LeetCode] 响应体大小: %d 字节\n", len(body))
	log.Printf("[LeetCode] 响应体内容: %s\n", string(body))

	// 检查响应状态
	if resp.StatusCode != http.StatusOK {
		log.Printf("[LeetCode] HTTP 错误: %d\n", resp.StatusCode)
		return nil, fmt.Errorf("HTTP 错误: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var graphqlResp GraphQLResponse
	if err := json.Unmarshal(body, &graphqlResp); err != nil {
		log.Printf("[LeetCode] 解析 GraphQL 响应失败: %v\n", err)
		return nil, fmt.Errorf("解析响应失败: %w, 原始响应: %s", err, string(body))
	}

	log.Printf("[LeetCode] GraphQL 错误数: %d\n", len(graphqlResp.Errors))
	if len(graphqlResp.Errors) > 0 {
		log.Printf("[LeetCode] GraphQL 错误详情: %v\n", graphqlResp.Errors)
		return nil, fmt.Errorf("GraphQL 错误: %v", graphqlResp.Errors)
	}

	log.Printf("[LeetCode] 开始解析题目数据\n")
	log.Printf("[LeetCode] 原始数据: %s\n", string(graphqlResp.Data))

	problem, err := ParseGraphQLResponse(graphqlResp.Data)
	if err != nil {
		log.Printf("[LeetCode] 解析题目数据失败: %v\n", err)
		return nil, fmt.Errorf("解析题目数据失败: %w", err)
	}

	log.Printf("[LeetCode] 成功获取题目: %s (ID: %s)\n", problem.Title, problem.QuestionID)

	return problem, nil
}
