package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"leetcode-note-sidecar/config"
	"log"
	"net/http"
	"time"
)

type LeetCodeFrequency struct {
	client *http.Client
}

type FrequencyResponse struct {
	Data struct {
		ProblemsetQuestionListV2 struct {
			Questions []struct {
				ID                 int     `json:"id"`
				TitleSlug          string  `json:"titleSlug"`
				Title              string  `json:"title"`
				TranslatedTitle    string  `json:"translatedTitle"`
				QuestionFrontendID string  `json:"questionFrontendId"`
				Difficulty         string  `json:"difficulty"`
				Frequency          float64 `json:"frequency"`
				AcRate             float64 `json:"acRate"`
			} `json:"questions"`
		} `json:"problemsetQuestionListV2"`
	} `json:"data"`
	Errors []interface{} `json:"errors"`
}

type QuestionInfo struct {
	TitleSlug  string
	Frequency  float64
	Title      string
	Difficulty string
}

func NewLeetCodeFrequency() *LeetCodeFrequency {
	return &LeetCodeFrequency{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetFrequencyByFrontendID 根据前端 ID 获取题目的出现频率
func (f *LeetCodeFrequency) GetFrequencyByFrontendID(frontendID string) (float64, error) {
	info, err := f.GetQuestionInfoByFrontendID(frontendID)
	if err != nil {
		return 0, err
	}
	return info.Frequency, nil
}

// GetQuestionInfoByFrontendID 根据前端 ID 获取题目完整信息（包括 titleSlug 和 frequency）
func (f *LeetCodeFrequency) GetQuestionInfoByFrontendID(frontendID string) (*QuestionInfo, error) {
	log.Printf("[Frequency] 开始获取题目信息: frontendID=%s\n", frontendID)
	cookie, _ := config.GetSetting("leetcode_cookie")

	query := `
    query problemsetQuestionListV2($filters: QuestionFilterInput, $limit: Int, $searchKeyword: String, $skip: Int, $sortBy: QuestionSortByInput, $categorySlug: String) {
  problemsetQuestionListV2(
    filters: $filters
    limit: $limit
    searchKeyword: $searchKeyword
    skip: $skip
    sortBy: $sortBy
    categorySlug: $categorySlug
  ) {
    questions {
      id
      titleSlug
      title
      translatedTitle
      questionFrontendId
      paidOnly
      difficulty
      topicTags {
        name
        slug
        nameTranslated
      }
      status
      isInMyFavorites
      frequency
      acRate
      contestPoint
    }
    totalLength
    finishedLength
    hasMore
  }
}
    `

	variables := map[string]interface{}{
		"skip":          0,
		"limit":         1,
		"categorySlug":  "all-code-essentials",
		"searchKeyword": "",
		"sortBy": map[string]string{
			"sortField": "FRONTEND_ID",
			"sortOrder": "ASCENDING",
		},
		"filters": map[string]interface{}{
			"filterCombineType": "ALL",
			"statusFilter": map[string]interface{}{
				"questionStatuses": []string{},
				"operator":         "IS",
			},
			"difficultyFilter": map[string]interface{}{
				"difficulties": []string{},
				"operator":     "IS",
			},
			"languageFilter": map[string]interface{}{
				"languageSlugs": []string{},
				"operator":      "IS",
			},
			"topicFilter": map[string]interface{}{
				"topicSlugs": []string{},
				"operator":   "IS",
			},
			"acceptanceFilter": map[string]interface{}{},
			"frequencyFilter":  map[string]interface{}{},
			"frontendIdFilter": map[string]interface{}{
				"rangeLeft":  frontendID,
				"rangeRight": frontendID,
			},
			"lastSubmittedFilter": map[string]interface{}{},
			"publishedFilter":     map[string]interface{}{},
			"companyFilter": map[string]interface{}{
				"companySlugs": []string{},
				"operator":     "IS",
			},
			"positionFilter": map[string]interface{}{
				"positionSlugs": []string{},
				"operator":      "IS",
			},
			"positionLevelFilter": map[string]interface{}{
				"positionLevelSlugs": []string{},
				"operator":           "IS",
			},
			"contestPointFilter": map[string]interface{}{
				"contestPoints": []string{},
				"operator":      "IS",
			},
			"premiumFilter": map[string]interface{}{
				"premiumStatus": []string{},
				"operator":      "IS",
			},
		},
	}

	reqBody := GraphQLRequest{
		Query:     query,
		Variables: variables,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		log.Printf("[Frequency] 序列化请求失败: %v\n", err)
		return nil, err
	}

	req, err := http.NewRequest("POST", "https://leetcode.cn/graphql/", bytes.NewBuffer(jsonBody))
	if err != nil {
		log.Printf("[Frequency] 创建请求失败: %v\n", err)
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://leetcode.cn/problemset/")
	req.Header.Set("Cookie", cookie)

	resp, err := f.client.Do(req)
	if err != nil {
		log.Printf("[Frequency] 请求失败: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[Frequency] 读取响应失败: %v\n", err)
		return nil, err
	}

	log.Printf("[Frequency] GraphQL 响应: %s\n", string(body))

	var freqResp FrequencyResponse
	if err := json.Unmarshal(body, &freqResp); err != nil {
		log.Printf("[Frequency] 解析响应失败: %v\n", err)
		return nil, err
	}

	if len(freqResp.Errors) > 0 {
		log.Printf("[Frequency] GraphQL 错误: %v\n", freqResp.Errors)
		return nil, fmt.Errorf("GraphQL 错误: %v", freqResp.Errors)
	}

	if len(freqResp.Data.ProblemsetQuestionListV2.Questions) == 0 {
		log.Printf("[Frequency] 未找到题目: frontendID=%s\n", frontendID)
		return nil, fmt.Errorf("未找到题目")
	}

	q := freqResp.Data.ProblemsetQuestionListV2.Questions[0]
	info := &QuestionInfo{
		TitleSlug:  q.TitleSlug,
		Frequency:  q.Frequency,
		Title:      q.Title,
		Difficulty: q.Difficulty,
	}
	log.Printf("[Frequency] 成功获取题目信息: frontendID=%s, titleSlug=%s, frequency=%.2f (原始值: %v)\n", frontendID, info.TitleSlug, info.Frequency, q.Frequency)

	return info, nil
}
