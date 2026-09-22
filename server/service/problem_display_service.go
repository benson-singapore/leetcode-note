package service

import (
	"database/sql"
	"encoding/json"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"log"
)

type ProblemDisplayService struct {
	problemRepo     *repository.ProblemRepository
	tagRepo         *repository.TagRepository
	userProblemRepo *repository.UserProblemRepository
}

// DisplayProblem 前端显示用的题目数据（完整版）
type DisplayProblem struct {
	ID                 string        `json:"id"`
	UserProblemID      string        `json:"userProblemId"`
	LcID               string        `json:"lcId"`
	Title              string        `json:"title"`
	TitleSlug          string        `json:"titleSlug"`
	Difficulty         string        `json:"difficulty"`
	PassRate           string        `json:"passRate"`
	Frequency          int           `json:"frequency"`
	PersonalDifficulty int           `json:"personalDifficulty"`
	Status             string        `json:"status"`
	ProgressStatus     string        `json:"progressStatus"`
	Notes              string        `json:"notes"`
	Code               string        `json:"code"`
	Tags               []string      `json:"tags"`
	TranslatedTitle    string        `json:"translatedTitle"`
	Content            string        `json:"content"`
	TranslatedContent  string        `json:"translatedContent"`
	CategoryTitle      string        `json:"categoryTitle"`
	CodeSnippets       []CodeSnippet `json:"codeSnippets"`
	ExampleTestcases   string        `json:"exampleTestcases"`
	SampleTestCase     string        `json:"sampleTestCase"`
	Likes              int           `json:"likes"`
	Dislikes           int           `json:"dislikes"`
	IsPaidOnly         bool          `json:"isPaidOnly"`
	Examples           []interface{} `json:"examples"`
	Constraints        []string      `json:"constraints"`
	SimilarQuestions   string        `json:"similarQuestions"`
	HasHtmlDemo        bool          `json:"hasHtmlDemo"`
}

// DisplayProblemList 列表显示用的题目数据（简化版，只包含表格需要的字段）
type DisplayProblemList struct {
	ID                 string   `json:"id"`
	UserProblemID      string   `json:"userProblemId"`
	LcID               string   `json:"lcId"`
	Title              string   `json:"title"`
	TranslatedTitle    string   `json:"translatedTitle"`
	Difficulty         string   `json:"difficulty"`
	PassRate           string   `json:"passRate"`
	Frequency          int      `json:"frequency"`
	PersonalDifficulty int      `json:"personalDifficulty"`
	Status             string   `json:"status"`
	Tags               []string `json:"tags"`
	HasHtmlDemo        bool     `json:"hasHtmlDemo"`
	ReviewCount        int      `json:"reviewCount"`
	ProgressStatus     string   `json:"progressStatus"`
	CreatedAt          string   `json:"createdAt"`
}

func NewProblemDisplayService() *ProblemDisplayService {
	return &ProblemDisplayService{
		problemRepo:     repository.NewProblemRepository(),
		tagRepo:         repository.NewTagRepository(),
		userProblemRepo: repository.NewUserProblemRepository(),
	}
}

// GetAllProblemsForDisplay 获取所有题目用于前端显示（列表简化版）
func (s *ProblemDisplayService) GetAllProblemsForDisplay() ([]DisplayProblemList, error) {
	log.Printf("[Display] 开始获取所有题目用于前端显示\n")

	problems, err := s.problemRepo.GetAllProblems()
	if err != nil {
		log.Printf("[Display] 获取题目失败: %v\n", err)
		return nil, err
	}

	var displayProblems []DisplayProblemList
	for _, p := range problems {
		displayProblem, err := s.convertToDisplayProblemList(&p)
		if err != nil {
			log.Printf("[Display] 转换题目失败: %v\n", err)
			continue
		}
		displayProblems = append(displayProblems, displayProblem)
	}

	log.Printf("[Display] 成功获取 %d 个题目\n", len(displayProblems))
	return displayProblems, nil
}

// GetProblemsForDisplayList 分页 + 条件过滤（用于“题库表格”）
func (s *ProblemDisplayService) GetProblemsForDisplayList(page, pageSize int, searchQuery, difficulty string, tags []string, sortMode, sortDirection string) ([]DisplayProblemList, int64, error) {
	log.Printf("[Display] 获取题库列表 page=%d pageSize=%d q=%q difficulty=%q tags=%d sort=%s/%s\n", page, pageSize, searchQuery, difficulty, len(tags), sortMode, sortDirection)

	total, err := s.problemRepo.CountProblemsForDisplayList(searchQuery, difficulty, tags)
	if err != nil {
		return nil, 0, err
	}

	problems, err := s.problemRepo.GetProblemsForDisplayList(page, pageSize, searchQuery, difficulty, tags, sortMode, sortDirection)
	if err != nil {
		return nil, 0, err
	}

	var displayProblems []DisplayProblemList
	for i := range problems {
		displayProblem, err := s.convertToDisplayProblemList(&problems[i])
		if err != nil {
			log.Printf("[Display] 转换题目失败: %v\n", err)
			continue
		}
		displayProblems = append(displayProblems, displayProblem)
	}

	return displayProblems, total, nil
}

// GetRandomReviewingProblemsForDisplay 获取“复习中”随机题目（用于“复习”tab）
func (s *ProblemDisplayService) GetRandomReviewingProblemsForDisplay(count int, searchQuery, difficulty string, tags []string) ([]DisplayProblemList, error) {
	log.Printf("[Display] 获取复习中随机题目 count=%d q=%q difficulty=%q tags=%d\n", count, searchQuery, difficulty, len(tags))

	problems, err := s.problemRepo.GetRandomReviewingProblemsForDisplay(count, searchQuery, difficulty, tags)
	if err != nil {
		return nil, err
	}

	var displayProblems []DisplayProblemList
	for i := range problems {
		displayProblem, err := s.convertToDisplayProblemList(&problems[i])
		if err != nil {
			log.Printf("[Display] 转换题目失败: %v\n", err)
			continue
		}
		displayProblems = append(displayProblems, displayProblem)
	}
	return displayProblems, nil
}

// GetProblemByIDForDisplay 根据 ID 获取单个题目用于前端显示
func (s *ProblemDisplayService) GetProblemByIDForDisplay(id string) (*DisplayProblem, error) {
	log.Printf("[Display] 获取题目: %s\n", id)

	problem, err := s.problemRepo.GetProblemByID(id)
	if err != nil {
		if err == sql.ErrNoRows {
			log.Printf("[Display] 题目不存在: %s\n", id)
			return nil, err
		}
		log.Printf("[Display] 获取题目失败: %v\n", err)
		return nil, err
	}

	displayProblem, err := s.convertToDisplayProblem(problem)
	if err != nil {
		log.Printf("[Display] 转换题目失败: %v\n", err)
		return nil, err
	}

	return &displayProblem, nil
}

// convertToDisplayProblem 将数据库题目转换为前端显示格式
func (s *ProblemDisplayService) convertToDisplayProblem(problem *models.Problem) (DisplayProblem, error) {
	// 获取标签
	tags, err := s.tagRepo.GetTagsByProblemID(problem.ID)
	if err != nil {
		log.Printf("[Display] 获取标签失败: %v\n", err)
	}

	tagNames := make([]string, len(tags))
	for i, tag := range tags {
		tagNames[i] = tag.Tag
	}

	// 解析代码片段
	var codeSnippets []CodeSnippet
	if problem.CodeSnippets != "" {
		if err := json.Unmarshal([]byte(problem.CodeSnippets), &codeSnippets); err != nil {
			log.Printf("[Display] 解析代码片段失败: %v\n", err)
		}
	}

	// 解析示例
	var examples []interface{}
	if problem.Examples != "" {
		if err := json.Unmarshal([]byte(problem.Examples), &examples); err != nil {
			log.Printf("[Display] 解析示例失败: %v\n", err)
		}
	}

	// 解析限制条件
	var constraints []string
	if problem.Constraints != "" {
		if err := json.Unmarshal([]byte(problem.Constraints), &constraints); err != nil {
			log.Printf("[Display] 解析限制条件失败: %v\n", err)
		}
	}

	// 获取用户题目记录
	userProblem, err := s.userProblemRepo.GetUserProblemByProblemID(problem.ID)
	personalDifficulty := 3
	status := "New"
	progressStatus := "Unpracticed"
	notes := ""
	code := ""
	userProblemID := ""
	userHasHtmlDemo := 0

	if err == nil && userProblem != nil {
		personalDifficulty = userProblem.PersonalDifficulty
		status = userProblem.Status
		if userProblem.ProgressStatus != "" {
			progressStatus = userProblem.ProgressStatus
		}
		notes = userProblem.Notes
		code = userProblem.Code
		userProblemID = userProblem.ID
		userHasHtmlDemo = userProblem.HasHtmlDemo
	}

	displayProblem := DisplayProblem{
		ID:                 problem.ID,
		UserProblemID:      userProblemID,
		LcID:               problem.LcID,
		Title:              problem.Title,
		TitleSlug:          problem.TitleSlug,
		Difficulty:         problem.Difficulty,
		PassRate:           problem.PassRate + "%",
		Frequency:          problem.Frequency,
		PersonalDifficulty: personalDifficulty,
		Status:             status,
		ProgressStatus:     progressStatus,
		Notes:              notes,
		Code:               code,
		Tags:               tagNames,
		TranslatedTitle:    problem.TranslatedTitle,
		Content:            problem.Content,
		TranslatedContent:  problem.TranslatedContent,
		CategoryTitle:      problem.CategoryTitle,
		CodeSnippets:       codeSnippets,
		ExampleTestcases:   problem.ExampleTestcases,
		SampleTestCase:     problem.SampleTestCase,
		Likes:              problem.Likes,
		Dislikes:           problem.Dislikes,
		IsPaidOnly:         problem.IsPaidOnly,
		Examples:           examples,
		Constraints:        constraints,
		SimilarQuestions:   problem.SimilarQuestions,
		// 优先使用 user_problems.has_html_demo，其次回落到 problems.has_html_demo
		HasHtmlDemo: userHasHtmlDemo != 0 || problem.HasHtmlDemo != 0,
	}

	return displayProblem, nil
}

// convertToDisplayProblemList 将数据库题目转换为前端列表显示格式（简化版）
func (s *ProblemDisplayService) convertToDisplayProblemList(problem *models.Problem) (DisplayProblemList, error) {
	// 获取标签
	tags, err := s.tagRepo.GetTagsByProblemID(problem.ID)
	if err != nil {
		log.Printf("[Display] 获取标签失败: %v\n", err)
	}

	tagNames := make([]string, len(tags))
	for i, tag := range tags {
		tagNames[i] = tag.Tag
	}

	// 获取用户题目记录
	userProblem, err := s.userProblemRepo.GetUserProblemByProblemID(problem.ID)
	personalDifficulty := 3
	status := "Unpracticed"
	progressStatus := "Unpracticed"
	reviewCount := 0
	userProblemID := ""
	userHasHtmlDemo := 0

	if err == nil && userProblem != nil {
		personalDifficulty = userProblem.PersonalDifficulty
		status = userProblem.Status
		if userProblem.ProgressStatus != "" {
			progressStatus = userProblem.ProgressStatus
		}
		reviewCount = userProblem.ReviewCount
		userProblemID = userProblem.ID
		userHasHtmlDemo = userProblem.HasHtmlDemo
	}

	displayProblem := DisplayProblemList{
		ID:                 problem.ID,
		UserProblemID:      userProblemID,
		LcID:               problem.LcID,
		Title:              problem.Title,
		TranslatedTitle:    problem.TranslatedTitle,
		Difficulty:         problem.Difficulty,
		PassRate:           problem.PassRate + "%",
		Frequency:          problem.Frequency,
		PersonalDifficulty: personalDifficulty,
		Status:             status,
		Tags:               tagNames,
		// 优先使用 user_problems.has_html_demo，其次回落到 problems.has_html_demo
		HasHtmlDemo:        userHasHtmlDemo != 0 || problem.HasHtmlDemo != 0,
		ReviewCount:        reviewCount,
		ProgressStatus:     progressStatus,
		CreatedAt:          problem.CreatedAt,
	}

	return displayProblem, nil
}

// GetStats 获取统计数据
func (s *ProblemDisplayService) GetStats() (map[string]interface{}, error) {
	log.Printf("[Display] 获取统计数据\n")

	problems, err := s.problemRepo.GetAllProblems()
	if err != nil {
		log.Printf("[Display] 获取题目失败: %v\n", err)
		return nil, err
	}

	total := len(problems)
	mastered := 0
	new := 0
	struggling := 0
	reviewing := 0

	// 这里需要从 user_problems 表获取实际的状态
	// 暂时使用默认值
	new = total

	stats := map[string]interface{}{
		"total":      total,
		"mastered":   mastered,
		"new":        new,
		"struggling": struggling,
		"reviewing":  reviewing,
	}

	log.Printf("[Display] 统计数据: %v\n", stats)
	return stats, nil
}
