package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"leetcode-note-sidecar/models"
	"leetcode-note-sidecar/repository"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ProblemSyncService struct {
	problemRepo *repository.ProblemRepository
	tagRepo     *repository.TagRepository
	frequency   *LeetCodeFrequency
}

func NewProblemSyncService() *ProblemSyncService {
	return &ProblemSyncService{
		problemRepo: repository.NewProblemRepository(),
		tagRepo:     repository.NewTagRepository(),
		frequency:   NewLeetCodeFrequency(),
	}
}

// StatsData 统计数据结构
type StatsData struct {
	TotalAccepted      string `json:"totalAccepted"`
	TotalSubmission    string `json:"totalSubmission"`
	TotalAcceptedRaw   int    `json:"totalAcceptedRaw"`
	TotalSubmissionRaw int    `json:"totalSubmissionRaw"`
	AcRate             string `json:"acRate"`
}

// ParseStats 解析统计数据
func (s *ProblemSyncService) ParseStats(statsJSON string) (passRate string, frequency int) {
	var stats StatsData
	if err := json.Unmarshal([]byte(statsJSON), &stats); err != nil {
		log.Printf("[Sync] 解析统计数据失败: %v\n", err)
		return "", 0
	}

	// 提取通过率
	passRate = strings.TrimSuffix(stats.AcRate, "%")

	// 提取频率（使用提交次数作为频率指标）
	frequency = stats.TotalSubmissionRaw

	log.Printf("[Sync] 解析统计数据: 通过率=%s%%, 频率=%d\n", passRate, frequency)

	return passRate, frequency
}

// SyncProblem 同步题目到数据库（插入或更新）
func (s *ProblemSyncService) SyncProblem(problemData *ProblemData) (*models.Problem, error) {
	log.Printf("[Sync] 开始同步题目: %s\n", problemData.Title)

	// 检查题目是否已存在
	existingProblem, err := s.problemRepo.GetProblemByLcID(problemData.QuestionID)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("[Sync] 查询题目失败: %v\n", err)
		return nil, err
	}

	// 序列化代码片段
	codesJSON, err := json.Marshal(problemData.CodeSnippets)
	if err != nil {
		log.Printf("[Sync] 序列化代码片段失败: %v\n", err)
		codesJSON = []byte("[]")
	}

	// 序列化相似题目（处理字符串或数组）
	var similarQuestionsJSON []byte
	if str, ok := problemData.SimilarQuestions.(string); ok {
		similarQuestionsJSON = []byte(str)
	} else {
		similarQuestionsJSON, _ = json.Marshal(problemData.SimilarQuestions)
	}
	if len(similarQuestionsJSON) == 0 {
		similarQuestionsJSON = []byte("[]")
	}

	// 序列化职位等级标签（处理字符串或数组）
	var positionLevelTagsJSON []byte
	if str, ok := problemData.PositionLevelTags.(string); ok {
		positionLevelTagsJSON = []byte(str)
	} else {
		positionLevelTagsJSON, _ = json.Marshal(problemData.PositionLevelTags)
	}
	if len(positionLevelTagsJSON) == 0 {
		positionLevelTagsJSON = []byte("[]")
	}

	// 解析统计数据
	passRate, frequency := s.ParseStats(problemData.Stats)

	// 尝试从 LeetCode 获取最新的频率数据（可使用用户绑定的 Cookie）
	if problemData.QuestionFrontendID != "" {
		if latestFrequency, err := s.frequency.GetFrequencyByFrontendID(problemData.QuestionFrontendID); err == nil {
			frequency = int(latestFrequency)
			log.Printf("[Sync] 获取到原始频率: %.2f, 转换后: %d\n", latestFrequency, frequency)
		} else {
			log.Printf("[Sync] 获取频率失败: %v，使用默认值\n", err)
		}
	}

	// 将 QuestionFrontendID 转换为 int
	var lcFrontendID int
	if problemData.QuestionFrontendID != "" {
		if id, err := strconv.Atoi(problemData.QuestionFrontendID); err == nil {
			lcFrontendID = id
		} else {
			log.Printf("[Sync] 转换 QuestionFrontendID 失败: %v\n", err)
		}
	}

	// 构建题目对象
	problem := &models.Problem{
		ID:                uuid.New().String(),
		LcID:              problemData.QuestionID,
		LcFrontendID:      lcFrontendID,
		Title:             problemData.Title,
		TitleSlug:         problemData.TitleSlug,
		TranslatedTitle:   problemData.TranslatedTitle,
		Difficulty:        problemData.Difficulty,
		Content:           problemData.Content,
		TranslatedContent: problemData.TranslatedContent,
		CategoryTitle:     problemData.CategoryTitle,
		CodeSnippets:      string(codesJSON),
		ExampleTestcases:  problemData.ExampleTestcases,
		SampleTestCase:    problemData.SampleTestCase,
		Likes:             problemData.Likes,
		Dislikes:          problemData.Dislikes,
		IsPaidOnly:        problemData.IsPaidOnly,
		Stats:             problemData.Stats,
		PassRate:          passRate,
		Frequency:         frequency,
		SimilarQuestions:  string(similarQuestionsJSON),
		PositionLevelTags: string(positionLevelTagsJSON),
		CreatedAt:         time.Now().Format("2006-01-02 15:04:05"),
		UpdatedAt:         time.Now().Format("2006-01-02 15:04:05"),
	}

	if existingProblem != nil {
		// 更新现有题目
		log.Printf("[Sync] 更新现有题目: %s (ID: %s)\n", problem.Title, problem.LcID)
		problem.ID = existingProblem.ID
		if err := s.problemRepo.UpdateProblem(problem); err != nil {
			log.Printf("[Sync] 更新题目失败: %v\n", err)
			return nil, fmt.Errorf("更新题目失败: %w", err)
		}
		log.Printf("[Sync] 题目更新成功\n")
	} else {
		// 创建新题目
		problem.ID = uuid.New().String()
		log.Printf("[Sync] 创建新题目: %s (ID: %s)\n", problem.Title, problem.ID)
		if err := s.problemRepo.CreateProblem(problem); err != nil {
			log.Printf("[Sync] 创建题目失败: %v\n", err)
			return nil, fmt.Errorf("创建题目失败: %w", err)
		}
		log.Printf("[Sync] 题目创建成功\n")
	}

	// 同步标签
	if err := s.syncTags(problem.ID, problemData.TopicTags); err != nil {
		log.Printf("[Sync] 同步标签失败: %v\n", err)
		// 不中断，继续返回题目
	}

	return problem, nil
}

// syncTags 同步题目标签
func (s *ProblemSyncService) syncTags(problemID string, tags []Tag) error {
	log.Printf("[Sync] 开始同步标签，共 %d 个\n", len(tags))

	// 删除旧标签
	if err := s.tagRepo.DeleteTagsByProblemID(problemID); err != nil {
		log.Printf("[Sync] 删除旧标签失败: %v\n", err)
		return err
	}

	// 添加新标签
	for _, tag := range tags {
		tagModel := &models.ProblemTag{
			ID:        uuid.New().String(),
			ProblemID: problemID,
			Tag:       tag.TranslatedName, // 优先使用中文名称
		}

		if tagModel.Tag == "" {
			tagModel.Tag = tag.Name // 如果没有中文名称，使用英文名称
		}

		if err := s.tagRepo.CreateTag(tagModel); err != nil {
			log.Printf("[Sync] 创建标签失败: %v (标签: %s)\n", err, tagModel.Tag)
			// 继续处理其他标签
		} else {
			log.Printf("[Sync] 标签已添加: %s\n", tagModel.Tag)
		}
	}

	return nil
}

// SyncAndFetch 获取题目并同步到数据库
func (s *ProblemSyncService) SyncAndFetch(titleSlug string) (*models.Problem, error) {
	log.Printf("[Sync] 开始获取并同步题目: %s\n", titleSlug)

	// 获取题目数据
	curl := NewLeetCodeCurl()
	problemData, err := curl.FetchProblem(titleSlug)
	if err != nil {
		log.Printf("[Sync] 获取题目失败: %v\n", err)
		return nil, err
	}

	// 同步到数据库
	problem, err := s.SyncProblem(problemData)
	if err != nil {
		log.Printf("[Sync] 同步失败: %v\n", err)
		return nil, err
	}

	log.Printf("[Sync] 题目同步完成: %s\n", problem.Title)
	return problem, nil
}
